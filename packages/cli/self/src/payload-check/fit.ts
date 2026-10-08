import type { ConstantValue, FieldType, ValueType } from "./types.ts";

/**
 * Snapshot of one field's declaration, as needed by the decisions below. The check assembles it from the
 * answers of `EffectDeclarations` for one effect name and field name.
 */
export interface FieldFacts {
  /** The field's type (the `fieldKind` answer). */
  readonly type: FieldType;
  /** The field's lower bound, `undefined` when absent (the `hasMinimum` / `minimum` answers). */
  readonly minimum: number | undefined;
  /** The field's upper bound, `undefined` when absent (the `hasMaximum` / `maximum` answers). */
  readonly maximum: number | undefined;
  /**
   * Membership test of a string against the field's closed list (the `memberOf` answer for that string).
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
    case "string":
      return value.kind === "string";
    case "enum":
      return value.kind === "string" && field.isMember(value.text);
    case "integer":
      return value.kind === "integer" && withinBounds(value.value, field);
    case "number":
      return (value.kind === "integer" || value.kind === "number") && withinBounds(value.value, field);
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

/** Whether a numeric value respects the field's bounds. Both bounds are inclusive; an absent bound allows anything. */
function withinBounds(value: number, field: FieldFacts): boolean {
  if (field.minimum !== undefined && value < field.minimum) return false;
  if (field.maximum !== undefined && value > field.maximum) return false;
  return true;
}
