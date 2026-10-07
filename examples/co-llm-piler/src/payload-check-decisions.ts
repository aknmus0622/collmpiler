/**
 * The business decisions of the payload check as pure functions: they take plain values, return plain
 * values, and touch no dependency. The `PayloadCheck` class (see `payload-check.ts`) gathers the inputs,
 * calls these, and carries out what they return.
 *
 * The rules themselves are in the specification, not in these comments.
 */

import type { PayloadCheckState, PayloadDiagnostic, ValueKind } from "./payload-check-types.ts";

/** What entering an effect leads to: where the walk goes, what it remembers and what to report. */
export interface EnterEffectOutcome {
  /** The state after the command (specification: the outcome's `goTo`). */
  readonly state: PayloadCheckState;
  /** The effect name to remember (specification data field `effect`). */
  readonly effect: string;
  /** The diagnostic to report, or `null` for none (specification effect `ReportDiagnostic`). */
  readonly diagnostic: PayloadDiagnostic | null;
}

/**
 * The specification's decision table `compatibility`, column `fits`.
 *
 * @param valueKind the kind of the value given (the `GivenField` command's `kind` input).
 * @param fieldKind the kind of value the field takes (the answer of `EffectDeclarations.fieldKind`).
 * @returns the `fits` value of the row that applies.
 */
export function kindFits(valueKind: ValueKind, fieldKind: ValueKind): boolean {
  if (valueKind === fieldKind) return true;
  if (valueKind === "integer" && fieldKind === "number") return true;
  if (valueKind === "enum" && fieldKind === "string") return true;
  return false;
}

/**
 * Decides what the specification's `EnterEffect` command leads to.
 *
 * @param name the name of the effect being entered (the command's `name` input).
 * @param declared the answer of `EffectDeclarations.isEffectDeclared` for `name`.
 * @returns the state to go to, the effect name to remember, and the diagnostic to report, if any.
 */
export function decideEnterEffect(name: string, declared: boolean): EnterEffectOutcome {
  if (!declared) {
    return {
      state: "IN_UNKNOWN_EFFECT",
      effect: name,
      diagnostic: { code: "unknown-effect", effect: name, field: "" },
    };
  }
  return { state: "IN_EFFECT", effect: name, diagnostic: null };
}

/**
 * Decides what the specification's `GivenField` command leads to. The command leaves the walk where it is
 * and remembers nothing, so the only result is what to report.
 *
 * @param state the state before the command.
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param field the name of the field given (the command's `field` input).
 * @param valueKind the kind of the value given (the command's `kind` input).
 * @param fieldDeclared the answer of `EffectDeclarations.isFieldDeclared` for `effect` and `field`, or
 *   `null` when it was not asked.
 * @param fieldKind the answer of `EffectDeclarations.fieldKind` for `effect` and `field`, or `null` when it
 *   was not asked.
 * @returns the diagnostic to report, or `null` for none.
 */
export function decideGivenField(
  state: PayloadCheckState,
  effect: string,
  field: string,
  valueKind: ValueKind,
  fieldDeclared: boolean | null,
  fieldKind: ValueKind | null,
): PayloadDiagnostic | null {
  if (state !== "IN_EFFECT") return null;
  if (fieldDeclared === false) return { code: "bad-value", effect, field };
  if (fieldDeclared === true && fieldKind !== null && !kindFits(valueKind, fieldKind)) {
    return { code: "bad-value", effect, field };
  }
  return null;
}

/**
 * Decides what the specification's `DeclaredField` command leads to. The command leaves the walk where it
 * is and remembers nothing, so the only result is what to report.
 *
 * @param effect the remembered name of the effect being walked (specification data field `effect`).
 * @param field the name of the declared field (the command's `field` input).
 * @param given the answer of `GivenPayloads.isFieldGiven` for `effect` and `field`.
 * @returns the diagnostic to report, or `null` for none.
 */
export function decideDeclaredField(effect: string, field: string, given: boolean): PayloadDiagnostic | null {
  if (!given) return { code: "missing-field", effect, field };
  return null;
}
