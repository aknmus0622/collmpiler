/**
 * Shared vocabulary of the value writer.
 *
 * The value writer writes the values of a specification into its intermediate representation, one value at
 * a time: each constant, each reference to something the specification declares, and each state listed by a
 * reference to the state before a command is handed to the writer, which writes it out. This file holds only
 * types; it has no behaviour.
 */

/**
 * The state of the writer. The name is exactly the specification's state name.
 *
 * - `READY`: the writer accepts values (the starting state, and the only one).
 */
export type ValueWriterState = "READY";

/**
 * What a constant is.
 *
 * Same names as the specification's `Constant.kind` and `WriteConstant.kind` values.
 */
export type ConstantKind = "string" | "number" | "boolean";

/**
 * A constant written in a specification. It is both the input of the specification's `Constant` command and
 * the payload of its `WriteConstant` effect; every field has the same name as the command input and the
 * payload field it corresponds to. All four fields are always present, whatever `kind` is.
 */
export interface Constant {
  /** What the constant is. Specification names: `Constant.kind`, `WriteConstant.kind`. */
  readonly kind: ConstantKind;
  /** Holds the value of a string constant. Specification names: `Constant.text`, `WriteConstant.text`. */
  readonly text: string;
  /** Holds the value of a number constant. Specification names: `Constant.number`, `WriteConstant.number`. */
  readonly number: number;
  /** Holds the value of a boolean constant. Specification names: `Constant.flag`, `WriteConstant.flag`. */
  readonly flag: boolean;
}

/**
 * The kind of thing a reference refers to, for the things that are referred to by one name.
 *
 * Same names as the specification's `Reference.target` values other than `"decision"`.
 */
export type NamedTarget = "input" | "data" | "query" | "calculation";

/**
 * A reference to something a specification declares (the input of the specification's `Reference` command).
 *
 * `target` is the command's `target` input. A reference to a column of a decision table (`target` is
 * `"decision"`) carries the command's `table` and `column` inputs; every other reference carries the
 * command's `name` input. The command inputs a reference does not carry are not part of it.
 */
export type Reference =
  | {
      /** The kind of thing referred to. Specification name: `Reference.target`. */
      readonly target: NamedTarget;
      /** The name of the thing referred to. Specification name: `Reference.name`. */
      readonly name: string;
    }
  | {
      /** Specification name: `Reference.target`. */
      readonly target: "decision";
      /** The name of the decision table. Specification name: `Reference.table`. */
      readonly table: string;
      /** The name of the column of that table. Specification name: `Reference.column`. */
      readonly column: string;
    };

/** The kind of thing a reference refers to. Same names as the specification's `Reference.target` values. */
export type ReferenceTarget = Reference["target"];
