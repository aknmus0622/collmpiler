/**
 * Vocabulary of the value writer: the values it is handed, the position it reports, and the dependency
 * it is given.
 */

/**
 * Position of the writer. Corresponds to the specification's states:
 *
 * - `"ready"`: `READY`
 */
export type ValueWriterState = "ready";

/**
 * What a constant is. Corresponds to the `kind` input of the specification's `Constant` command and to
 * the `kind` of its `WriteConstant` effect, with the same spellings.
 */
export type ConstantKind = "string" | "number" | "boolean";

/**
 * A constant written in a specification. Corresponds to the input of the specification's `Constant`
 * command and to the payload of its `WriteConstant` effect, member for member (`kind`, `text`, `number`,
 * `flag`). All four members are always present, whatever the `kind`.
 */
export interface Constant {
  readonly kind: ConstantKind;
  /** The command's `text`: holds the value of a `"string"` constant. */
  readonly text: string;
  /** The command's `number`: holds the value of a `"number"` constant. */
  readonly number: number;
  /** The command's `flag`: holds the value of a `"boolean"` constant. */
  readonly flag: boolean;
}

/**
 * What kind of thing a reference identified by a single name refers to. Corresponds to the `target`
 * input of the specification's `Reference` command, with the same spellings, without `"decision"`.
 */
export type NamedReferenceTarget = "input" | "data" | "query" | "calculation";

/**
 * What kind of thing a reference refers to. Corresponds to the `target` input of the specification's
 * `Reference` command, with the same spellings.
 */
export type ReferenceTarget = NamedReferenceTarget | "decision";

/**
 * A reference to something a specification declares. Corresponds to the input of the specification's
 * `Reference` command:
 *
 * - `target` is the command's `target`, with the same spellings;
 * - on every target but `"decision"`, `name` is the command's `name` (the command's `table` and `column`
 *   are unused for it);
 * - on `"decision"`, `table` and `column` are the command's `table` and `column` (the command's `name`
 *   is unused for it).
 */
export type Reference =
  | { readonly target: NamedReferenceTarget; readonly name: string }
  | { readonly target: "decision"; readonly table: string; readonly column: string };

/** Dependency: the receiver of the values the writer writes into the intermediate representation. */
export interface ValueSink {
  /**
   * Called synchronously, from inside the command that writes it, once per written constant.
   * Corresponds to the specification's `WriteConstant` effect; the argument is its payload.
   */
  writeConstant(constant: Constant): void;

  /**
   * Called synchronously, from inside the command that writes it, once per written reference.
   * Corresponds to the specification's `WriteReference` effect; `text` is the payload's `text`.
   */
  writeReference(text: string): void;

  /**
   * Called synchronously, from inside the command that writes it, once per written state.
   * Corresponds to the specification's `WriteWasState` effect; `state` is the payload's `state`.
   */
  writeWasState(state: string): void;
}
