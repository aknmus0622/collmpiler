import type {
  ConstantValue,
  FieldType,
  PayloadDiagnosticCode,
  Slot,
  SlotKind,
  ValueSource,
  ValueType,
} from "./types.ts";

/**
 * Snapshot of one field's declaration, as needed by the decisions below. The check assembles it from the
 * answers of `SlotDeclarations` for one field name of the slot being walked. Members are read lazily: a
 * decision reads only what it needs, and each read asks the dependency.
 */
export interface FieldFacts {
  /** The field's type (the `fieldKind` answer). */
  readonly type: FieldType;
  /** The field's lower bound, `undefined` when absent (the `hasMinimum` / `minimum` answers). */
  readonly minimum: number | undefined;
  /** The field's upper bound, `undefined` when absent (the `hasMaximum` / `maximum` answers). */
  readonly maximum: number | undefined;
  /** True when the field is marked optional (the `fieldOptional` answer). */
  readonly optional: boolean;
  /**
   * Membership test of a string against the field's enumeration (the `memberOf` answer for that string).
   * Evaluated lazily: the decision calls it only when it needs the answer.
   */
  isMember(value: string): boolean;
}

/**
 * Pure decision. Corresponds to the `fits` column of the specification's `constantFit` decision table.
 *
 * @param value the literal payload value
 * @param field the declaration of the field the value is written for
 * @returns the value of the `fits` column
 */
export function constantFits(value: ConstantValue, field: FieldFacts): boolean {
  switch (field.type) {
    case "boolean":
      return value.kind === "boolean";
    case "number":
      return (value.kind === "integer" || value.kind === "number") && withinBounds(value.value, field);
    case "string":
      return value.kind === "string";
    case "integer":
      return value.kind === "integer" && withinBounds(value.value, field);
    case "enum":
      return value.kind === "string" && field.isMember(value.text);
    default:
      return false;
  }
}

/**
 * Pure decision. Corresponds to the `fits` column of the specification's `typeFit` decision table.
 *
 * @param valueType the type of the payload value
 * @param fieldType the type of the field the value is written for
 * @returns the value of the `fits` column
 */
export function typeFits(valueType: ValueType, fieldType: FieldType): boolean {
  if (valueType === "integer" && fieldType === "number") return true;
  return valueType === fieldType;
}

/**
 * Pure decision. Whether a null value fits the field (the specification's `Null` command).
 *
 * @param field the declaration of the field the value is written for; reads `optional` and `type`
 * @returns true when the null value fits, false when it is to be reported as a mismatch
 */
export function nullFits(field: FieldFacts): boolean {
  return field.optional || field.type === "value";
}

/**
 * Pure decision. Whether a value with this source is acceptable in a slot of this kind (the
 * specification's `Source` command). Only a constant, a command input or remembered data is acceptable,
 * whatever the slot's kind.
 *
 * @param _slotKind the kind of slot being walked (`data.slotKind`)
 * @param source where the value comes from (the command's `kind`)
 * @returns true when acceptable, false when it is to be reported as bad-source
 */
export function sourceAllowed(_slotKind: SlotKind, source: ValueSource): boolean {
  return source !== "other";
}

/**
 * Pure calculation. Corresponds to the specification's `isVariants` calculation, stored in
 * `data.variants` on entering a slot.
 *
 * @param slot what is known about the slot entered (the input of `EnterSlot`)
 * @returns the value of `isVariants`
 */
export function isVariants(slot: Slot): boolean {
  return slot.kind === "responds" && slot.output === "variant";
}

/**
 * What entering a slot leads to: whether the slot's fields are checked, and the diagnostic, if any,
 * reported about the slot as a whole.
 */
export interface SlotVerdict {
  /** True when the slot's fields are checked (state `ACTIVE`), false when not (state `INACTIVE`). */
  readonly checked: boolean;
  /** The code reported with the empty field name, or `undefined` when nothing is reported. */
  readonly report: PayloadDiagnosticCode | undefined;
}

/**
 * Pure decision. Corresponds to the cases of the specification's `EnterSlot` command.
 *
 * @param slot what is known about the slot entered (the input of `EnterSlot`)
 * @returns whether the slot is checked and what is reported about it
 */
export function enterSlotVerdict(slot: Slot): SlotVerdict {
  switch (slot.kind) {
    case "effect":
      return slot.declared ? CHECKED : skipped(undefined);
    case "asks":
    case "change":
      return slot.declared ? CHECKED : skipped("unknown-target");
    case "calls":
      if (!slot.declared) return skipped("unknown-target");
      if (!slot.keyedOk) return skipped("keyed-mismatch");
      if (!slot.commandDeclared) return skipped("unknown-command");
      return CHECKED;
    case "responds": {
      const problem = answerProblem(slot);
      return problem === undefined ? CHECKED : skipped(problem);
    }
    default:
      return CHECKED;
  }
}

const CHECKED: SlotVerdict = { checked: true, report: undefined };

/** The verdict for a slot whose fields are not checked. */
function skipped(report: PayloadDiagnosticCode | undefined): SlotVerdict {
  return { checked: false, report };
}

/** What is wrong with how a command's answer is written, given the shape the command declares; if anything. */
function answerProblem(slot: Slot): PayloadDiagnosticCode | undefined {
  if (slot.output === "none") return slot.given === "none" ? undefined : "no-output";
  if (slot.given === "none") return "missing-response";
  if (slot.output === "fields" && slot.given === "single") return "wrong-shape";
  if (slot.output === "variant" && (slot.given === "single" || slot.givenCount !== 1)) return "wrong-shape";
  if (slot.output === "single" && slot.given === "fields") return "wrong-shape";
  return undefined;
}

/** Whether a numeric value respects the field's bounds. */
function withinBounds(value: number, field: FieldFacts): boolean {
  if (field.minimum !== undefined && value < field.minimum) return false;
  if (field.maximum !== undefined && value > field.maximum) return false;
  return true;
}
