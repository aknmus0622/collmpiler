/**
 * The value writer: writes one value of a specification into its
 * intermediate representation (IR), one value at a time.
 *
 * Corresponds to the specification component "value-writer". It asks nothing
 * of its environment, tells it nothing, and remembers nothing between
 * commands. It has no states of its own (the specification's only state is
 * `READY`); `write` may be called at any time.
 *
 * Command -> function:
 *   `Write` -> `writeValue` (also available as the method `ValueWriter.write`)
 */

/** Any JSON value: null, a boolean, a number, a string, a list, or a record. Spec type `value`. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [field: string]: JsonValue };

/**
 * What a reference by name refers to (spec field `target` of variant
 * `reference`): an input of the command, remembered data, a query answer, or
 * a calculation. Values identical to the specification's.
 */
export type ReferenceTarget = "input" | "data" | "query" | "calculation";

/**
 * The value to write (spec input `value` of `Write`, a oneOf). The
 * discriminant `kind` names the specification's variant; the other fields
 * are that variant's fields, with the specification's names.
 */
export type SpecValue =
  /** Spec variant `constant`: a constant, given as it is (`null` included). */
  | { kind: "constant"; constant: JsonValue }
  /** Spec variant `reference`: a reference by name (`name`) to something of kind `target`. */
  | { kind: "reference"; target: ReferenceTarget; name: string }
  /** Spec variant `column`: a reference to the column `column` of the decision table `table`. */
  | { kind: "column"; table: string; column: string }
  /** Spec variant `was`: a reference to the state before a command, listing the states (`was`) in order. */
  | { kind: "was"; was: string[] };

/**
 * What is written (spec output of `Write`, a oneOf). The discriminant `kind`
 * names the specification's output variant:
 * - `constant`: the constant, as written (`value`);
 * - `reference`: the reference written as one text (`value`); answered both
 *   for a reference by name and for a reference to a decision-table column;
 * - `was`: the list of states, in order (`value`).
 */
export type WrittenValue =
  | { kind: "constant"; value: JsonValue }
  | { kind: "reference"; value: string }
  | { kind: "was"; value: string[] };

/**
 * The kind of a reference, which decides the prefix of its text (spec
 * decision table `form`): a reference by name gives its `target`; a
 * reference to a decision-table column is `"decision"`.
 */
export type ReferenceForm = ReferenceTarget | "decision";

/** Writes values of a specification into the IR. Stateless; one object may be shared. */
export class ValueWriter {
  /** Spec command `Write`: answers what is written for `value` (spec input `value`). See `writeValue`. */
  write(value: SpecValue): WrittenValue {
    return writeValue(value);
  }
}

/** Spec command `Write` as a pure function: answers what is written for `value`. */
export function writeValue(value: SpecValue): WrittenValue {
  switch (value.kind) {
    case "constant":
      return { kind: "constant", value: value.constant };
    case "reference":
    case "column":
      return { kind: "reference", value: referenceText(value) };
    case "was":
      return { kind: "was", value: [...value.was] };
  }
}

/** Spec decision table `form`, column `prefix`: the prefix that starts the text of a reference of this form. */
export function referencePrefix(form: ReferenceForm): string {
  switch (form) {
    case "calculation":
      return "calculation:";
    case "query":
      return "query:";
    case "input":
      return "input:";
    case "data":
      return "data:";
    default:
      return "decision:";
  }
}

/**
 * Spec calculation `referenceText`: the one text a reference is written as.
 * `value` is a reference by name or a reference to a decision-table column.
 */
export function referenceText(value: Extract<SpecValue, { kind: "reference" | "column" }>): string {
  if (value.kind === "reference") return referencePrefix(value.target) + value.name;
  return referencePrefix("decision") + value.table + "." + value.column;
}
