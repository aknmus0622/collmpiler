/**
 * Vocabulary of the type check: the facts it is given, the findings it emits, and the dependencies it is
 * given.
 *
 * The check has no states of its own: it is always in the specification's single state `READY`.
 */

/**
 * Classification of a finding. Corresponds to the `code` of the specification's `Report` effect, with the
 * same spellings.
 */
export type TypeFindingCode =
  | "empty-enum"
  | "empty-one-of"
  | "min-above-max"
  | "around-outside"
  | "mixed-column"
  | "promise-kind"
  | "promise-input"
  | "failure-unknown"
  | "failure-not-may-fail"
  | "failure-not-asked"
  | "name-collision";

/**
 * One finding emitted by the check: what was just given is wrong, for this reason. Corresponds to the payload
 * of the specification's `Report` effect, member for member (`code`, `owner`).
 */
export interface TypeFinding {
  readonly code: TypeFindingCode;
  /**
   * What had already claimed the name, as stored in a {@link NameClaim}'s `owner`; only meaningful for
   * `"name-collision"`, the empty string for every other code.
   */
  readonly owner: string;
}

/**
 * The kind of a type given on its own. Corresponds to the `kind` input of the specification's `Type`
 * command, with the same spellings:
 *
 * - `"enum"`: an enumeration
 * - `"one-of"`: a oneOf
 * - `"number"`: a number type
 * - `"other"`: any other type
 */
export type TypeKind = "enum" | "one-of" | "number" | "other";

/**
 * A type, on its own (types inside it are given separately). Corresponds to the input of the specification's
 * `Type` command, member for member.
 */
export interface TypeInfo {
  /** Which kind of type it is. */
  readonly kind: TypeKind;
  /** Number of members (of an enumeration) or variants (of a oneOf), 0 to 1000. */
  readonly members: number;
  /** Whether the type (a number type) has a minimum. */
  readonly hasMin: boolean;
  /** Its minimum; meaningful only when `hasMin` is `true`. */
  readonly min: number;
  /** Whether the type (a number type) has a maximum. */
  readonly hasMax: boolean;
  /** Its maximum; meaningful only when `hasMax` is `true`. */
  readonly max: number;
}

/**
 * The bounds remembered from the type last given, against which the thresholds that follow are checked.
 * Corresponds to the specification's data fields `boundedBelow`, `lowest`, `boundedAbove` and `highest`.
 */
export interface NumberBounds {
  /** The specification's `data.boundedBelow`: whether the number type last given has a minimum. */
  readonly boundedBelow: boolean;
  /** The specification's `data.lowest`: its minimum. */
  readonly lowest: number;
  /** The specification's `data.boundedAbove`: whether the number type last given has a maximum. */
  readonly boundedAbove: boolean;
  /** The specification's `data.highest`: its maximum. */
  readonly highest: number;
}

/**
 * The kind of one value of a decision-table column. Corresponds to the `kind` input of the specification's
 * `Cell` command, with the same spellings; `"null"` stands for a row that does not use the column.
 */
export type CellKind = "number" | "string" | "boolean" | "null";

/**
 * The kind of the answer of a query that declares a promise. Corresponds to the `output` input of the
 * specification's `Promise` command, with the same spellings (`"structured"` is a structured value, `"enum"`
 * an enumeration).
 */
export type AnswerKind = "structured" | "enum" | "boolean" | "string" | "integer" | "number";

/**
 * A promise a query declares about its answers. Corresponds to the `promise` input of the specification's
 * `Promise` command, with the same spellings.
 */
export type PromiseName = "fresh" | "increasing";

/**
 * A query that declares a promise. Corresponds to the input of the specification's `Promise` command, member
 * for member.
 */
export interface PromiseInfo {
  /** The kind of the query's answer. */
  readonly output: AnswerKind;
  /** The promise it declares. */
  readonly promise: PromiseName;
  /** Whether the query takes an input. */
  readonly takesInput: boolean;
}

/**
 * What is known of the query named by a condition that a query failed. Corresponds to the input of the
 * specification's `Failure` command, member for member.
 */
export interface FailureInfo {
  /** Whether a query was asked (through an `asks` entry) by that name. */
  readonly asked: boolean;
  /** Whether a query of that name is declared. */
  readonly declared: boolean;
  /** Whether the query can fail (declares `mayFail`). */
  readonly mayFail: boolean;
  /** Whether the query takes an input. */
  readonly takesInput: boolean;
}

/**
 * What claims a name. Corresponds to the `owner` input of the specification's `Claim` command, with the same
 * spellings: `"data"` (a data field), `"queries"` (a query without input), `"asks"` (an asked answer),
 * `"parts"` (a part) or `"input"` (a command input).
 */
export type ClaimOwner = "data" | "queries" | "asks" | "parts" | "input";

/**
 * The owner stored for the reserved name claimed by `beginClaims` (the specification's "reserved").
 */
export type ReservedOwner = "reserved";

/**
 * A name being claimed. Corresponds to the input of the specification's `Claim` command, member for member.
 */
export interface ClaimInfo {
  /** The name claimed (any string). */
  readonly name: string;
  /** What claims it. */
  readonly owner: ClaimOwner;
  /** Whether this is a shared claim (one that another claim of the same kind of owner may share). */
  readonly shared: boolean;
}

/**
 * A name claimed so far, with what claimed it. Corresponds to one entry of the specification's `data.claims`
 * (`name`, `owner`). `owner` is one of the {@link ClaimOwner} spellings or the {@link ReservedOwner}.
 */
export interface NameClaim {
  readonly name: string;
  readonly owner: string;
}

/** Dependency: the receiver of the findings the check emits. */
export interface TypeFindingSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted finding, in the order
   * the findings are emitted. Corresponds to the specification's `Report` effect; the argument is its payload.
   */
  report(finding: TypeFinding): void;
}
