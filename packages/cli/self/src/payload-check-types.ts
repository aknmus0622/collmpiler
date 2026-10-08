/**
 * Shared vocabulary of the payload check.
 *
 * The payload check is driven through the effects a specification performs as a walk: each effect is entered
 * and left in turn, and while the walk is inside an effect every field the specification gives to it
 * (followed by what is known about the value given), and every field the effect declares, is handed to the
 * check. Each mismatch found on the way is reported. This file holds only types; it has no behaviour.
 */

/**
 * Where the walk currently is. The names are exactly the specification's state names.
 *
 * - `OUTSIDE`: the walk is between effects (the starting state).
 * - `IN_EFFECT`: the walk is inside an effect that the specification declares.
 * - `IN_UNKNOWN_EFFECT`: the walk is inside an effect that the specification does not declare.
 * - `IN_FIELD`: the walk is inside a given field of a declared effect, and the field's value is still being
 *   checked.
 * - `IN_SETTLED_FIELD`: the walk is inside a given field of a declared effect, and the check of that field
 *   is already over.
 */
export type PayloadCheckState = "OUTSIDE" | "IN_EFFECT" | "IN_UNKNOWN_EFFECT" | "IN_FIELD" | "IN_SETTLED_FIELD";

/**
 * The kind of value a declared field takes. `"enum"` means one of a fixed set of strings.
 *
 * Same names as the answers of the specification's `fieldKind` query.
 */
export type ValueKind = "boolean" | "integer" | "number" | "string" | "enum";

/**
 * The type of a value that is known only by its type.
 *
 * Same names as the specification's `Typed.type` values.
 */
export type ValueType = "boolean" | "integer" | "number" | "string";

/**
 * A concrete value a specification gives to a field (the input of the specification's `Constant` command).
 *
 * `kind` is the command's `kind` input. `value` carries the value itself where the command carries one:
 * the command's `number` input when `kind` is `"integer"` or `"number"`, and the command's `text` input
 * when `kind` is `"string"`. A boolean constant carries no value, as in the specification.
 */
export type ConstantValue =
  | { readonly kind: "boolean" }
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly value: string };

/**
 * What the declaration says about one field of one effect, gathered from `EffectDeclarations` for the pure
 * decision functions. It is a snapshot for a single command and is never kept.
 */
export interface FieldFacts {
  /** What the field takes: the answer of `EffectDeclarations.fieldKind`. */
  readonly kind: ValueKind;
  /** The answer of `EffectDeclarations.fieldMinimum`: the field's minimum, or `null` when it has none. */
  readonly minimum: number | null;
  /** The answer of `EffectDeclarations.fieldMaximum`: the field's maximum, or `null` when it has none. */
  readonly maximum: number | null;
  /**
   * The answer of `EffectDeclarations.isInFieldSet` for the string being checked, or `null` when that was
   * not asked.
   */
  readonly inSet: boolean | null;
}

/**
 * The kind of problem a payload diagnostic reports.
 *
 * Same names as the specification's `ReportDiagnostic.code` values.
 */
export type PayloadDiagnosticCode = "missing-field" | "bad-value";

/**
 * One problem found by the walk (the payload of the specification's `ReportDiagnostic` effect). Every field
 * has the same name as the payload field it corresponds to.
 */
export interface PayloadDiagnostic {
  /** The kind of problem. Specification name: `ReportDiagnostic.code`. */
  readonly code: PayloadDiagnosticCode;
  /** The name of the effect the problem was found in. Specification name: `ReportDiagnostic.effect`. */
  readonly effect: string;
  /** The name of the field the problem is about. Specification name: `ReportDiagnostic.field`. */
  readonly field: string;
}
