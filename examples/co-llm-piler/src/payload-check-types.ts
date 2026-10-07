/**
 * Shared vocabulary of the payload check.
 *
 * The payload check is driven through the effects a specification performs as a walk: each effect is entered
 * and left in turn, and while the walk is inside an effect every field the specification gives to it and
 * every field the effect declares is handed to the check. Each mismatch found on the way is reported. This
 * file holds only types; it has no behaviour.
 */

/**
 * Where the walk currently is. The names are exactly the specification's state names.
 *
 * - `OUTSIDE`: the walk is between effects (the starting state).
 * - `IN_EFFECT`: the walk is inside an effect that the specification declares.
 * - `IN_UNKNOWN_EFFECT`: the walk is inside an effect that the specification does not declare.
 */
export type PayloadCheckState = "OUTSIDE" | "IN_EFFECT" | "IN_UNKNOWN_EFFECT";

/**
 * The kind of a value: either the kind of the value a specification gives to a field, or the kind of value
 * a declared field takes.
 *
 * Same names as the specification's `GivenField.kind` values and the answers of its `fieldKind` query.
 */
export type ValueKind = "boolean" | "integer" | "number" | "string" | "enum";

/**
 * The kind of problem a payload diagnostic reports.
 *
 * Same names as the specification's `ReportDiagnostic.code` values.
 */
export type PayloadDiagnosticCode = "unknown-effect" | "missing-field" | "bad-value";

/**
 * One problem found by the walk (the payload of the specification's `ReportDiagnostic` effect). Every field
 * has the same name as the payload field it corresponds to.
 */
export interface PayloadDiagnostic {
  /** The kind of problem. Specification name: `ReportDiagnostic.code`. */
  readonly code: PayloadDiagnosticCode;
  /** The name of the effect the problem was found in. Specification name: `ReportDiagnostic.effect`. */
  readonly effect: string;
  /**
   * The name of the field the problem is about; the empty string when the problem is about the effect as a
   * whole. Specification name: `ReportDiagnostic.field`.
   */
  readonly field: string;
}
