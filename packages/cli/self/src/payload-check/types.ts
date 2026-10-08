/**
 * Vocabulary of the payload check: the values it is fed, the position it reports, the diagnostics it
 * emits, and the dependencies it is given.
 */

/**
 * The type a declaration assigns to a field. Corresponds to the answer of the specification's `fieldKind`
 * query, with the same spellings. `"enum"` is the answer for a field restricted to a closed list of
 * strings.
 */
export type FieldType = "boolean" | "integer" | "number" | "string" | "enum";

/**
 * The type of a payload value when only its type is available. Corresponds to the `type` input of the
 * specification's `Typed` command, with the same spellings.
 */
export type ValueType = "boolean" | "integer" | "number" | "string";

/**
 * A literal payload value. Corresponds to the input of the specification's `Constant` command:
 *
 * - `kind` is the command's `kind`, with the same spellings;
 * - on a `"string"`, `text` is the command's `text`;
 * - on an `"integer"` or a `"number"`, `value` is the command's `number`;
 * - a `"boolean"` has no further member (the command's `text` and `number` are unused for it).
 */
export type ConstantValue =
  | { readonly kind: "boolean" }
  | { readonly kind: "integer"; readonly value: number }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "string"; readonly text: string };

/**
 * Position of the walk. Corresponds to the specification's states:
 *
 * - `"outside"`: `OUTSIDE`
 * - `"in-effect"`: `IN_EFFECT`
 * - `"in-unknown-effect"`: `IN_UNKNOWN_EFFECT`
 * - `"in-field"`: `IN_FIELD`
 * - `"in-settled-field"`: `IN_SETTLED_FIELD`
 */
export type PayloadCheckState =
  | "outside"
  | "in-effect"
  | "in-unknown-effect"
  | "in-field"
  | "in-settled-field";

/**
 * Classification of a diagnostic. Corresponds to the `code` of the specification's `ReportDiagnostic`
 * effect, with the same spellings.
 */
export type PayloadDiagnosticCode = "missing-field" | "bad-value";

/**
 * One diagnostic emitted by the check. Corresponds to the payload of the specification's
 * `ReportDiagnostic` effect, member for member (`code`, `effect`, `field`).
 */
export interface PayloadDiagnostic {
  readonly code: PayloadDiagnosticCode;
  /** Effect name the diagnostic is attached to. */
  readonly effect: string;
  /** Field name the diagnostic is attached to. */
  readonly field: string;
}

/**
 * Dependency: the catalogue of effect declarations. The check consults it each time it needs an answer
 * and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface EffectDeclarations {
  /**
   * Lookup of an effect by name.
   * Corresponds to the query `effectDeclared` with input `{ name: effect }`; returns its answer.
   */
  declaresEffect(effect: string): boolean;

  /**
   * Lookup of a field by effect name and field name.
   * Corresponds to the query `fieldDeclared` with input `{ effect, field }`; returns its answer.
   */
  declaresField(effect: string, field: string): boolean;

  /**
   * The type assigned to the field identified by effect name and field name.
   * Corresponds to the query `fieldKind` with input `{ effect, field }`; returns its answer.
   */
  fieldType(effect: string, field: string): FieldType;

  /**
   * Lower bound of the field identified by effect name and field name.
   * Combines the queries `hasMinimum` and `minimum`, both with input `{ effect, field }`: returns
   * `undefined` where `hasMinimum` answers false, and the answer of `minimum` where `hasMinimum` answers
   * true.
   */
  minimum(effect: string, field: string): number | undefined;

  /**
   * Upper bound of the field identified by effect name and field name.
   * Combines the queries `hasMaximum` and `maximum`, both with input `{ effect, field }`: returns
   * `undefined` where `hasMaximum` answers false, and the answer of `maximum` where `hasMaximum` answers
   * true.
   */
  maximum(effect: string, field: string): number | undefined;

  /**
   * Membership test of a string against the closed list of the field identified by effect name and
   * field name.
   * Corresponds to the query `memberOf` with input `{ effect, field, value }`; returns its answer.
   */
  isMember(effect: string, field: string, value: string): boolean;
}

/**
 * Dependency: the payloads written in the specification under check. The check consults it each time it
 * needs an answer and keeps no copy of the answers.
 */
export interface GivenPayload {
  /**
   * Lookup of a payload entry by effect name and field name.
   * Corresponds to the query `fieldGiven` with input `{ effect, field }`; returns its answer.
   */
  givesField(effect: string, field: string): boolean;
}

/** Dependency: the receiver of the diagnostics the check emits. */
export interface PayloadDiagnosticSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted diagnostic.
   * Corresponds to the specification's `ReportDiagnostic` effect; the argument is its payload.
   */
  report(diagnostic: PayloadDiagnostic): void;
}
