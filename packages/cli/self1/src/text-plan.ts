/**
 * Text plan: decides how types are written in the adapter contract, which
 * notes a query of the outside world carries, and which sections the
 * contract has.
 *
 * Corresponds to the specification component `text-plan`. It has no state
 * and no dependencies; each of its queries is implemented here by a pure
 * function that answers the same result for the same arguments and touches
 * nothing:
 *
 * - `Notes` → {@link queryNotes}
 * - `Sections` → {@link contractSections}
 * - `TypeText` → {@link typeText}
 */

/**
 * The promise a query of the outside world makes (specification parameter
 * `promise` of `Notes`).
 *
 * - `"none"`: it promises nothing.
 * - `"fresh"`: it never answers the same value twice.
 * - `"increasing"`: it never answers less than before.
 */
export type QueryPromise = "none" | "fresh" | "increasing";

/**
 * One note a query of the outside world carries in the contract (an element
 * of the specification's result of `Notes`).
 *
 * - `"fresh"`, `"increasing"`: the query's promise.
 * - `"may-fail"`: asking the query can fail.
 */
export type QueryNote = "fresh" | "increasing" | "may-fail";

/**
 * Specification query `text-plan.Notes` (calculation `notes`).
 *
 * Asked once for each query of the outside world written in the contract.
 *
 * @param promise what the query promises (specification parameter `promise`).
 * @param mayFail whether asking the query can fail (specification parameter
 *   `mayFail`).
 * @returns the notes the query carries, in the order they are written (the
 *   specification's result; may be empty).
 */
export function queryNotes(promise: QueryPromise, mayFail: boolean): QueryNote[] {
  const notes: QueryNote[] = [];
  if (promise === "fresh") notes.push("fresh");
  else if (promise === "increasing") notes.push("increasing");
  if (mayFail) notes.push("may-fail");
  return notes;
}

/**
 * What is counted about a system to decide which sections its contract has
 * (the parameters of the specification query `Sections`). Each field is the
 * specification parameter of the same name.
 */
export interface ContractFacts {
  /** How many commands answer something (specification parameter `answering`). */
  answering: number;
  /** Whether JSON values appear anywhere in the contract (specification parameter `json`). */
  json: boolean;
  /** How many queries there are (specification parameter `queries`). */
  queries: number;
  /** Whether the system keeps what it remembers across a restart (specification parameter `restarts`). */
  restarts: boolean;
  /** How many HTTP routes there are (specification parameter `routes`). */
  routes: number;
  /** How many sorts of atoms (identifiers) there are (specification parameter `sorts`). */
  sorts: number;
}

/**
 * Which sections the contract has (the specification's result of
 * `Sections`). Each field is `true` when that section is written.
 */
export interface ContractSections {
  /** The section on what commands answer (specification field `commandOutput`). */
  commandOutput: boolean;
  /** The section defining the JSON type (specification field `json`). */
  json: boolean;
  /** The section on queries (specification field `queries`). */
  queries: boolean;
  /** The section on restarting the system (specification field `restarts`). */
  restarts: boolean;
  /** The section on HTTP routes (specification field `routes`). */
  routes: boolean;
  /** The section on sorts of atoms (specification field `sorts`). */
  sorts: boolean;
}

/**
 * Specification query `text-plan.Sections` (calculation `sections`).
 *
 * Asked once per contract, before it is written.
 *
 * @param facts what is counted about the system (the specification's
 *   parameters, as one record).
 * @returns which sections the contract has.
 */
export function contractSections(facts: ContractFacts): ContractSections {
  return {
    commandOutput: facts.answering > 0,
    json: facts.json,
    queries: facts.queries > 0,
    restarts: facts.restarts,
    routes: facts.routes > 0,
    sorts: facts.sorts > 0,
  };
}

/**
 * The kind of a type, at its outermost level (specification parameter `kind`
 * of `TypeText`). Each value is the specification type constructor of the
 * same name: `"int"`, `"string"`, `"bool"`, `"json"` are plain values;
 * `"enum"` an enumeration of literals; `"atom"` an opaque identifier of some
 * sort; `"optional"` a value or null; `"list"`, `"set"`, `"map"`, `"record"`
 * the composite kinds.
 */
export type TypeTextKind =
  | "int"
  | "string"
  | "bool"
  | "json"
  | "enum"
  | "atom"
  | "optional"
  | "list"
  | "set"
  | "map"
  | "record";

/**
 * One field of a record type, already written (an element of the
 * specification parameter `entries` of `TypeText`).
 */
export interface FieldText {
  /** The field's name, as in the specification (specification field `name`). */
  name: string;
  /**
   * Whether the name can be written as a bare TypeScript identifier
   * (specification field `plain`).
   */
  plain: boolean;
  /** The field's type, already written (specification field `text`). */
  text: string;
}

/**
 * One type to write, with everything inside it already written (the
 * parameters of the specification query `TypeText`). Each field is the
 * specification parameter of the same name; only the fields that matter for
 * `kind` are read, the others may be empty.
 */
export interface TypeParts {
  /** The kind of the type (specification parameter `kind`). */
  kind: TypeTextKind;
  /**
   * For an enumeration: its members, each already written as a TypeScript
   * literal, in order (specification parameter `members`).
   */
  members: string[];
  /** For an atom: the name of its sort (specification parameter `name`). */
  name: string;
  /**
   * For an optional value, a list, a set, or a map: the type inside it (for a
   * map, its value type), already written (specification parameter `inner`).
   */
  inner: string;
  /** For a map: its key type, already written (specification parameter `key`). */
  key: string;
  /** For a record: its fields, in order (specification parameter `entries`). */
  entries: FieldText[];
}

/**
 * Specification query `text-plan.TypeText` (calculation `typeText`).
 *
 * Writes one type as TypeScript text. Asked bottom-up: the parts inside a
 * type are written first and passed in `parts`.
 *
 * @param parts the type's kind and its parts already written.
 * @returns the TypeScript text of the type.
 */
export function typeText(parts: TypeParts): string {
  switch (parts.kind) {
    case "int":
      return "number";
    case "string":
      return "string";
    case "bool":
      return "boolean";
    case "json":
      return "Json";
    case "enum":
      if (parts.members.length === 0) return "never";
      return parts.members.slice(0, MAX_WRITTEN).join(" | ");
    case "atom":
      return parts.name;
    case "optional":
      return parts.inner + " | null";
    case "list":
    case "set":
      return elementText(parts.inner) + "[]";
    case "map":
      return "{ key: " + parts.key + "; value: " + parts.inner + " }[]";
    case "record":
      if (parts.entries.length === 0) return "Record<string, never>";
      return "{ " + parts.entries.slice(0, MAX_WRITTEN).map(fieldText).join("; ") + " }";
  }
}

/** How many members of an enumeration, or fields of a record, are written at most. */
const MAX_WRITTEN = 8;

/** The element type of a list or set, parenthesized when `[]` would bind to only part of it. */
function elementText(inner: string): string {
  const compound = inner.includes("|") || inner.includes("&");
  return compound && !inner.startsWith("{") ? "(" + inner + ")" : inner;
}

/** One field of a record as `name: text`, quoting a name that is not plain. */
function fieldText(entry: FieldText): string {
  const name = entry.plain ? entry.name : '"' + entry.name + '"';
  return name + ": " + entry.text;
}
