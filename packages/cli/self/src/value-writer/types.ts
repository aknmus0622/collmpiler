/**
 * Vocabulary of the value writer: the values it is handed, what it writes for them, and the position it
 * reports.
 */

/**
 * Position of the writer. Corresponds to the specification's states:
 *
 * - `"ready"`: `READY`
 */
export type ValueWriterState = "ready";

/**
 * A constant written in a specification: any JSON value, `null` included. Corresponds to the
 * specification's `value` type (the `constant` alternative of the `Write` command's `value`, and the
 * `constant` alternative of its answer).
 */
export type ConstantValue =
  | null
  | boolean
  | number
  | string
  | readonly ConstantValue[]
  | { readonly [key: string]: ConstantValue };

/**
 * What kind of thing a reference identified by a single name refers to. Corresponds to the `target`
 * of the `reference` alternative of the specification's `Write` input, with the same spellings.
 */
export type NamedReferenceTarget = "input" | "data" | "query" | "calculation";

/**
 * What kind of thing a reference refers to: a `NamedReferenceTarget`, or `"decision"` for a column of a
 * decision table (the `column` alternative of the specification's `Write` input).
 */
export type ReferenceTarget = NamedReferenceTarget | "decision";

/**
 * A reference to something a specification declares. Covers two alternatives of the `value` input of
 * the specification's `Write` command:
 *
 * - `reference` (a reference by name): `target` is its `target`, with the same spellings, and `name` is
 *   its `name`;
 * - `column` (a column of a decision table): `target` is `"decision"`, and `table` and `column` are its
 *   `table` and `column`.
 */
export type Reference =
  | { readonly target: NamedReferenceTarget; readonly name: string }
  | { readonly target: "decision"; readonly table: string; readonly column: string };

/**
 * One value of a specification, to be written. Corresponds to the `value` input of the specification's
 * `Write` command; `kind` says which alternative it is:
 *
 * - `"constant"`: the `constant` alternative; `constant` is the value itself;
 * - `"reference"`: the `reference` alternative or the `column` alternative; `Reference` says how;
 * - `"was"`: the `was` alternative; `states` is its list of state names, in order.
 */
export type SpecValue =
  | { readonly kind: "constant"; readonly constant: ConstantValue }
  | { readonly kind: "reference"; readonly reference: Reference }
  | { readonly kind: "was"; readonly states: readonly string[] };

/**
 * What is written for one value. Corresponds to the answer of the specification's `Write` command;
 * `kind` says which alternative it is:
 *
 * - `"constant"`: the `constant` alternative; `constant` is the written value;
 * - `"reference"`: the `reference` alternative; `text` is the written text;
 * - `"was"`: the `was` alternative; `states` is the written list of state names, in order.
 */
export type WrittenValue =
  | { readonly kind: "constant"; readonly constant: ConstantValue }
  | { readonly kind: "reference"; readonly text: string }
  | { readonly kind: "was"; readonly states: readonly string[] };
