/**
 * Vocabulary of the payload check: the values it is fed, the position it reports, the diagnostics it
 * emits, and the dependencies it is given.
 */

/**
 * What a declaration says a field takes. Corresponds to the answer of the specification's `fieldKind`
 * query, with the same spellings. `"enum"` denotes an enumeration of string literals, `"value"` an
 * unrestricted (untyped) field, and `"structured"` a record, a list or a similar composite type.
 */
export type FieldType = "boolean" | "integer" | "number" | "string" | "enum" | "value" | "structured";

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
 * Origin of the value written for the current field. Corresponds to the `kind` input of the
 * specification's `Source` command, with the same spellings: a literal (`"constant"`), an input of the
 * command (`"input"`), stored component data (`"data"`), or any other kind of expression (`"other"`).
 */
export type ValueSource = "constant" | "input" | "data" | "other";

/**
 * Which construct of the specification under check a slot belongs to (a slot is a place where that
 * specification writes values). Corresponds to the `kind` input of the specification's `EnterSlot` command
 * and to `data.slotKind`, with the same spellings, named after the IR keys they come from:
 *
 * - `"effect"`: an `emits` entry's payload;
 * - `"asks"`: an `asks` entry's input;
 * - `"calls"`: a `calls` entry's input (a command on a part);
 * - `"set"`: an outcome's `set`;
 * - `"responds"`: an outcome's `responds`;
 * - `"change"`: an outcome's `adds` / `removes` target (which part list it touches);
 * - `"adds"`: the starting `data` of an `adds` entry;
 * - `"initially"`: the `model.initial` values;
 * - `"onlyWhen"`: an `emits` entry's `onlyWhen`.
 */
export type SlotKind =
  | "effect"
  | "asks"
  | "calls"
  | "set"
  | "responds"
  | "change"
  | "adds"
  | "initially"
  | "onlyWhen";

/**
 * How a command's answer is written in the specification under check. Corresponds to the `given` input of
 * `EnterSlot`: no answer (`"none"`), one single value (`"single"`), or a value per field (`"fields"`).
 */
export type GivenShape = "none" | "single" | "fields";

/**
 * What shape of answer a command declares. Corresponds to the `output` input of `EnterSlot`: no output
 * (`"none"`), a single value (`"single"`), a record of fields (`"fields"`), or one of several variants
 * (`"variant"`).
 */
export type OutputShape = "none" | "single" | "fields" | "variant";

/**
 * Everything known about a slot when the walk enters it. Corresponds, member for member and with the same
 * names, to the input of the specification's `EnterSlot` command. Members that do not apply to the slot's
 * kind are still present; their value is then irrelevant.
 */
export interface Slot {
  /** The kind of slot (`kind`). */
  readonly kind: SlotKind;
  /**
   * `declared`: true when the thing the slot names (effect, query, part, ...) exists in the model of the
   * specification under check.
   */
  readonly declared: boolean;
  /** `commandDeclared`: for a `"calls"` slot, true when the named part lists the named command. */
  readonly commandDeclared: boolean;
  /** `keyedOk`: for a `"calls"` slot, true when the use of `at` agrees with the part's `by`. */
  readonly keyedOk: boolean;
  /** For a command's answer: how the answer is written (`given`). */
  readonly given: GivenShape;
  /** For a command's answer written as fields: how many fields are given (`givenCount`). */
  readonly givenCount: number;
  /** For a command's answer: the shape the command declares for it (`output`). */
  readonly output: OutputShape;
}

/**
 * Position of the walk. Corresponds to the specification's states:
 *
 * - `"outside"`: `OUTSIDE`, no slot entered (initial, and after `leaveSlot`);
 * - `"inactive"`: `INACTIVE`, inside a slot that is skipped;
 * - `"active"`: `ACTIVE`, inside a slot that is examined, no current field yet;
 * - `"checking"`: `CHECKING`, the current field is under examination;
 * - `"settled"`: `SETTLED`, the current field already received its diagnostic.
 */
export type PayloadCheckState = "outside" | "inactive" | "active" | "checking" | "settled";

/**
 * Classification of a diagnostic. Corresponds to the `code` of the specification's `Report` effect, with
 * the same spellings.
 */
export type PayloadDiagnosticCode =
  | "unknown-target"
  | "keyed-mismatch"
  | "unknown-command"
  | "missing-field"
  | "unknown-field"
  | "bad-source"
  | "mismatch"
  | "no-output"
  | "missing-response"
  | "wrong-shape";

/**
 * One diagnostic emitted by the check, about the slot being walked. Corresponds to the payload of the
 * specification's `Report` effect, member for member (`code`, `field`).
 */
export interface PayloadDiagnostic {
  readonly code: PayloadDiagnosticCode;
  /** Field name the diagnostic is attached to; `""` when it concerns the slot itself. */
  readonly field: string;
}

/**
 * Dependency: what the slot currently being walked declares. Every question is about a field of that slot;
 * whoever supplies this object knows which slot the walk is in. The check consults it each time it needs an
 * answer and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface SlotDeclarations {
  /**
   * True when `field` is among the field names in the current slot's declaration.
   * Corresponds to the query `fieldDeclared` with input `{ field }`; returns its answer.
   */
  declaresField(field: string): boolean;

  /**
   * The declared type of the field.
   * Corresponds to the query `fieldKind` with input `{ field }`; returns its answer.
   */
  fieldType(field: string): FieldType;

  /**
   * True when the field's declaration marks it optional (nullable).
   * Corresponds to the query `fieldOptional` with input `{ field }`; returns its answer.
   */
  isOptional(field: string): boolean;

  /**
   * Lower bound of the field.
   * Combines the queries `hasMinimum` and `minimum`, both with input `{ field }`: returns `undefined` where
   * `hasMinimum` answers false, and the answer of `minimum` where `hasMinimum` answers true.
   */
  minimum(field: string): number | undefined;

  /**
   * Upper bound of the field.
   * Combines the queries `hasMaximum` and `maximum`, both with input `{ field }`: returns `undefined` where
   * `hasMaximum` answers false, and the answer of `maximum` where `hasMaximum` answers true.
   */
  maximum(field: string): number | undefined;

  /**
   * Membership test of a string against the field's enumeration of allowed strings.
   * Corresponds to the query `memberOf` with input `{ field, value }`; returns its answer.
   */
  isMember(field: string, value: string): boolean;
}

/**
 * Dependency: the values written in the specification under check for the slot currently being walked.
 * The check consults it each time it needs an answer and keeps no copy of the answers.
 */
export interface GivenSlot {
  /**
   * True when the specification under check writes something for `field` in the current slot.
   * Corresponds to the query `fieldGiven` with input `{ field }`; returns its answer.
   */
  givesField(field: string): boolean;
}

/** Dependency: the receiver of the diagnostics the check emits. */
export interface PayloadDiagnosticSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted diagnostic.
   * Corresponds to the specification's `Report` effect; the argument is its payload.
   */
  report(diagnostic: PayloadDiagnostic): void;
}
