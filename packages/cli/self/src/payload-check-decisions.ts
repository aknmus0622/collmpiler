/**
 * The business decisions of the payload check as pure functions: they take plain values, return plain
 * values, and touch no dependency. The `PayloadCheck` class (see `payload-check.ts`) gathers the inputs,
 * calls these, and carries out what they return.
 *
 * The rules themselves are in the specification, not in these comments.
 */

import type {
  ConstantValue,
  FieldFacts,
  PayloadCheckState,
  PayloadDiagnostic,
  ValueKind,
} from "./payload-check-types.ts";

/** What entering an effect leads to: where the walk goes and what it remembers. */
export interface EnterEffectOutcome {
  /** The state after the command (specification: the outcome's `goTo`). */
  readonly state: PayloadCheckState;
  /** The effect name to remember (specification data field `effect`). */
  readonly effect: string;
}

/** What a given field leads to: where the walk goes, what it remembers and what to report. */
export interface GivenFieldOutcome {
  /** The state after the command (specification: the outcome's `goTo`, or the state before if it has none). */
  readonly state: PayloadCheckState;
  /**
   * The field name to remember (specification data field `field`), or `null` when the outcome stores none
   * and what is remembered stays as it is.
   */
  readonly field: string | null;
  /** The diagnostic to report, or `null` for none (specification effect `ReportDiagnostic`). */
  readonly diagnostic: PayloadDiagnostic | null;
}

/**
 * What a value handed to the check for the field being walked leads to (the specification's `Constant`,
 * `Typed` and `Unresolved` commands): where the walk goes and what to report. These commands store nothing.
 */
export interface FieldValueOutcome {
  /** The state after the command (specification: the outcome's `goTo`, or the state before if it has none). */
  readonly state: PayloadCheckState;
  /** The diagnostic to report, or `null` for none (specification effect `ReportDiagnostic`). */
  readonly diagnostic: PayloadDiagnostic | null;
}

/**
 * The specification's decision table `constantFit`, column `fits`.
 *
 * @param value the constant given (the `Constant` command's input).
 * @param field what the declaration says about the field being walked (the answers the specification's
 *   `Constant` command names `takes`, `bounded` with `lowest`, `capped` with `highest`, and `inSet`).
 * @returns the `fits` value of the row that applies.
 */
export function constantFits(value: ConstantValue, field: FieldFacts): boolean {
  switch (field.kind) {
    case "boolean":
      return value.kind === "boolean";
    case "string":
      return value.kind === "string";
    case "enum":
      return value.kind === "string" && field.inSet === true;
    case "integer":
      return value.kind === "integer" && withinBounds(value.value, field);
    case "number":
      return (value.kind === "integer" || value.kind === "number") && withinBounds(value.value, field);
  }
}

/** Whether a number respects the field's minimum and maximum, as far as the field has them. */
function withinBounds(value: number, field: FieldFacts): boolean {
  if (field.minimum !== null && value < field.minimum) return false;
  if (field.maximum !== null && value > field.maximum) return false;
  return true;
}

/**
 * Whether the effect being walked is one the specification declares (the specification's condition "the
 * effect is declared"), for a walk that is inside an effect.
 *
 * @param state the current state.
 */
export function inDeclaredEffect(state: PayloadCheckState): boolean {
  return state !== "IN_UNKNOWN_EFFECT";
}

/**
 * Whether the value of the field being walked is still being checked (the specification's condition of the
 * same wording).
 *
 * @param state the current state.
 */
export function valueStillChecked(state: PayloadCheckState): boolean {
  return state === "IN_FIELD";
}

/** What a value that does or does not fit leads to; shared by the commands that hand over a value. */
function decideFieldValue(
  state: PayloadCheckState,
  effect: string,
  field: string,
  fits: boolean | null,
): FieldValueOutcome {
  if (valueStillChecked(state) && fits === false) {
    return { state: "IN_SETTLED_FIELD", diagnostic: { code: "bad-value", effect, field } };
  }
  return { state, diagnostic: null };
}

/**
 * The specification's decision table `typeFit`, column `fits`.
 *
 * @param valueKind the type of the value given (the `Typed` command's `type` input).
 * @param fieldKind the kind of value the field takes (the answer of `EffectDeclarations.fieldKind`).
 * @returns the `fits` value of the row that applies.
 */
export function kindFits(valueKind: ValueKind, fieldKind: ValueKind): boolean {
  if (valueKind === fieldKind) return true;
  if (valueKind === "integer" && fieldKind === "number") return true;
  return false;
}

/**
 * Decides what the specification's `EnterEffect` command leads to.
 *
 * @param name the name of the effect being entered (the command's `name` input).
 * @param declared the answer of `EffectDeclarations.isEffectDeclared` for `name`.
 * @returns the state to go to and the effect name to remember.
 */
export function decideEnterEffect(name: string, declared: boolean): EnterEffectOutcome {
  if (!declared) return { state: "IN_UNKNOWN_EFFECT", effect: name };
  return { state: "IN_EFFECT", effect: name };
}

/**
 * Decides what the specification's `GivenField` command leads to.
 *
 * @param state the state before the command.
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param name the name of the field given (the command's `name` input).
 * @param fieldDeclared the answer of `EffectDeclarations.isFieldDeclared` for `effect` and `name`, or
 *   `null` when it was not asked.
 * @returns the state to go to, the field name to remember, if any, and the diagnostic to report, if any.
 */
export function decideGivenField(
  state: PayloadCheckState,
  effect: string,
  name: string,
  fieldDeclared: boolean | null,
): GivenFieldOutcome {
  if (!inDeclaredEffect(state) || fieldDeclared === null) return { state, field: null, diagnostic: null };
  if (fieldDeclared) return { state: "IN_FIELD", field: name, diagnostic: null };
  return { state: "IN_SETTLED_FIELD", field: name, diagnostic: { code: "bad-value", effect, field: name } };
}

/**
 * Decides what the specification's `Constant` command leads to.
 *
 * @param state the state before the command.
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param field the remembered name of the field being walked (specification data field `field`).
 * @param fits the result of `constantFits` for the constant and that field, or `null` when it was not
 *   worked out.
 * @returns the state to go to and the diagnostic to report, if any.
 */
export function decideConstant(
  state: PayloadCheckState,
  effect: string,
  field: string,
  fits: boolean | null,
): FieldValueOutcome {
  return decideFieldValue(state, effect, field, fits);
}

/**
 * Decides what the specification's `Typed` command leads to.
 *
 * @param state the state before the command.
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param field the remembered name of the field being walked (specification data field `field`).
 * @param fits the result of `kindFits` for the value's type and what that field takes, or `null` when it
 *   was not worked out.
 * @returns the state to go to and the diagnostic to report, if any.
 */
export function decideTyped(
  state: PayloadCheckState,
  effect: string,
  field: string,
  fits: boolean | null,
): FieldValueOutcome {
  return decideFieldValue(state, effect, field, fits);
}

/**
 * Decides what the specification's `Unresolved` command leads to.
 *
 * @param state the state before the command.
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param field the remembered name of the field being walked (specification data field `field`).
 * @returns the state to go to and the diagnostic to report, if any.
 */
export function decideUnresolved(state: PayloadCheckState, effect: string, field: string): FieldValueOutcome {
  return decideFieldValue(state, effect, field, false);
}

/**
 * Decides what the specification's `DeclaredField` command leads to. The command leaves the walk where it
 * is and remembers nothing, so the only result is what to report.
 *
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param field the name of the declared field (the command's `name` input).
 * @param given the answer of `GivenPayloads.isFieldGiven` for `effect` and `field`.
 * @returns the diagnostic to report, or `null` for none.
 */
export function decideDeclaredField(effect: string, field: string, given: boolean): PayloadDiagnostic | null {
  if (!given) return { code: "missing-field", effect, field };
  return null;
}
