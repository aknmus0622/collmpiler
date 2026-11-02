/**
 * Decides how the adapter contract is written: the text of one type, the notes
 * one query of the outside world carries, and which sections the contract has.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It has queries only, no commands.
 * It corresponds to the specification's component `text-plan`.
 */

/**
 * A promise a query of the outside world may make. Specification name:
 * parameter `promise` of the query `Notes`; the values are the specification's
 * own.
 *
 * - `"none"`: the query makes no promise.
 * - `"fresh"`: the query promises never to answer the same value twice.
 * - `"increasing"`: the query promises never to answer less than before.
 */
export type QueryPromise = "none" | "fresh" | "increasing";

/**
 * One note on a query in the contract. Specification name: the elements of the
 * result of the query `Notes`; the values are the specification's own.
 *
 * - `"fresh"`: a note on the promise of the same name.
 * - `"increasing"`: a note on the promise of the same name.
 * - `"may-fail"`: a note that asking the query can fail.
 */
export type QueryNote = "fresh" | "increasing" | "may-fail";

/**
 * The facts about one query of the outside world. The field names are the
 * specification's parameter names.
 */
export interface NoteFacts {
  /** Whether asking the query can fail (specification parameter `mayFail`). */
  mayFail: boolean;
  /** The promise the query makes (specification parameter `promise`). */
  promise: QueryPromise;
}

/**
 * The facts about the system a contract describes. The field names are the
 * specification's parameter names; the counts are integers, zero or more.
 */
export interface SectionFacts {
  /** How many commands answer (specification parameter `answering`). */
  answering: number;
  /** Whether JSON values appear (specification parameter `json`). */
  json: boolean;
  /** How many queries there are (specification parameter `queries`). */
  queries: number;
  /** Whether the system restarts (specification parameter `restarts`). */
  restarts: boolean;
  /** How many routes there are (specification parameter `routes`). */
  routes: number;
  /** How many sorts of atoms there are (specification parameter `sorts`). */
  sorts: number;
}

/**
 * Which sections the contract has: each field is true when the section is
 * present. Specification name: the result of the query `Sections`; the field
 * names are the specification's own.
 */
export interface ContractSections {
  /** The section on the answers of commands. */
  commandOutput: boolean;
  /** The section on the JSON type. */
  json: boolean;
  /** The section on queries. */
  queries: boolean;
  /** The section on restarts. */
  restarts: boolean;
  /** The section on routes. */
  routes: boolean;
  /** The section on the sorts of atoms. */
  sorts: boolean;
}

/**
 * The kind of a type being written. Specification name: parameter `kind` of the
 * query `TypeText`; the values are the specification's own.
 *
 * - `"int"`, `"string"`, `"bool"`: the plain value types.
 * - `"json"`: any JSON value.
 * - `"enum"`: an enumeration.
 * - `"atom"`: an identifier of some sort.
 * - `"optional"`: a value or nothing.
 * - `"list"`, `"set"`, `"map"`, `"record"`: the composite types.
 */
export type WrittenKind =
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
 * One field of a record, its type already written. Specification name: the
 * elements of parameter `entries`; the field names are the specification's own.
 */
export interface RecordEntry {
  /** The field's name. */
  name: string;
  /** Whether the name can be written as it stands, rather than as a JSON string. */
  plain: boolean;
  /** The field's type, already written. */
  text: string;
}

/**
 * One type to write, with what is inside it already written. The field names
 * are the specification's parameter names. Every field is always present; each
 * kind reads only the ones that describe it, and the others may hold anything
 * of their type (an empty string or an empty list, say).
 */
export interface TypeFacts {
  /** The kind of type (specification parameter `kind`). */
  kind: WrittenKind;
  /** A record's fields, in order (specification parameter `entries`). */
  entries: RecordEntry[];
  /** The written type inside an optional, list or set, or a map's written value type (specification parameter `inner`). */
  inner: string;
  /** A map's written key type (specification parameter `key`). */
  key: string;
  /** An enumeration's members, each already written, in order (specification parameter `members`). */
  members: string[];
  /** An atom's sort name (specification parameter `name`). */
  name: string;
}

/**
 * Performs the specification's query `Notes` (`text-plan.Notes`).
 *
 * Accepts any combination of the facts and always answers. Reads no state, so
 * the same facts always give the same answer. Ask once per query of the outside
 * world.
 *
 * @param facts the query's two facts, one field per specification parameter.
 * @returns the notes the query carries, in the order the contract writes them; possibly none.
 */
export function decideNotes(facts: NoteFacts): QueryNote[] {
  const promised: QueryNote[] = facts.promise === "none" ? [] : [facts.promise];
  return facts.mayFail ? [...promised, "may-fail"] : promised;
}

/**
 * Performs the specification's query `Sections` (`text-plan.Sections`).
 *
 * Accepts any combination of the facts and always answers. Reads no state, so
 * the same facts always give the same answer. Ask once per contract.
 *
 * @param facts the system's six facts, one field per specification parameter.
 * @returns which sections the contract has.
 */
export function decideSections(facts: SectionFacts): ContractSections {
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
 * Performs the specification's query `TypeText` (`text-plan.TypeText`).
 *
 * Writes one level of a type: to write a nested type, write what is inside it
 * first and pass the result in. Reads no state, so the same facts always give
 * the same answer.
 *
 * @param facts the type to write, one field per specification parameter.
 * @returns the type as it appears in the contract.
 */
export function writeType(facts: TypeFacts): string {
  switch (facts.kind) {
    case "int":
      return "number";
    case "string":
      return "string";
    case "bool":
      return "boolean";
    case "json":
      return "Json";
    case "enum":
      return facts.members.length === 0 ? "never" : facts.members.join(" | ");
    case "atom":
      return facts.name;
    case "optional":
      return `${facts.inner} | null`;
    case "list":
    case "set":
      return needsParentheses(facts.inner) ? `(${facts.inner})[]` : `${facts.inner}[]`;
    case "map":
      return `${OPENING_BRACE} key: ${facts.key}; value: ${facts.inner} }[]`;
    case "record":
      return writeRecord(facts.entries);
  }
}

/** What a written record or map opens with: its own delimiters enclose any "|" or "&" inside it. */
const OPENING_BRACE = "{";

/** Whether a written type must be parenthesised before "[]" can follow it. */
function needsParentheses(written: string): boolean {
  return (written.includes("|") || written.includes("&")) && !written.startsWith(OPENING_BRACE);
}

function writeRecord(entries: RecordEntry[]): string {
  if (entries.length === 0) return "Record<string, never>";
  return `${OPENING_BRACE} ${entries.map(writeEntry).join("; ")} }`;
}

function writeEntry(entry: RecordEntry): string {
  const name = entry.plain ? entry.name : `"${entry.name}"`;
  return `${name}: ${entry.text}`;
}
