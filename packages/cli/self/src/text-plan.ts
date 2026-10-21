/**
 * Decides what the texts given to agents are made of: how a type is written
 * in TypeScript in the contract, which notes a query carries, and which
 * sections a contract or a request to an agent includes.
 *
 * Corresponds to the specification component "text-plan". The component has
 * no state of its own (it is always in the specification state `READY`) and
 * keeps no data between calls: each specification command is one pure
 * function below. The function takes the command's input fields as a single
 * object (field names identical to the specification's) and returns the
 * command's answer (answer values identical to the specification's). It asks
 * nothing of its environment and performs no effects.
 *
 * Command -> function:
 *   `ContractSections` -> `contractSections`
 *   `QueryNotes`       -> `queryNotes`
 *   `RequestSections`  -> `requestSections`
 *   `TypeText`         -> `typeText`
 */

import type { Phase } from "./gate-rules.ts";

export type { Phase };

// ---------------------------------------------------------------------------
// ContractSections
// ---------------------------------------------------------------------------

/** Input of `ContractSections`: counts and facts about the component the contract is written for. */
export interface ContractFacts {
  /** How many commands answer with something (spec `outputs`, 0..100). */
  outputs: number;
  /** How many contained components there are (spec `parts`, 0..100). */
  parts: number;
  /** Whether the system keeps something across a restart (spec `restarts`). */
  restarts: boolean;
  /** How many commands have a route (spec `routes`, 0..100). */
  routes: number;
}

/** Answer of `ContractSections`: for each optional section of the contract, whether it is included. */
export interface ContractSectionsPlan {
  /** The section on what commands answer with (spec `commandOutput`). */
  commandOutput: boolean;
  /** The note about the dependencies of contained components (spec `partsNote`). */
  partsNote: boolean;
  /** The section on storage and restart (spec `restarts`). */
  restarts: boolean;
  /** The section on routes (spec `routes`). */
  routes: boolean;
}

/** Performs `ContractSections`: which optional sections the contract for the given component includes. */
export function contractSections(facts: ContractFacts): ContractSectionsPlan {
  return {
    commandOutput: facts.outputs > 0,
    partsNote: facts.parts > 0,
    restarts: facts.restarts,
    routes: facts.routes > 0,
  };
}

// ---------------------------------------------------------------------------
// QueryNotes
// ---------------------------------------------------------------------------

/** What the environment guarantees about a query's answers (spec `promise`); `"none"` when nothing. */
export type QueryPromise = "none" | "fresh" | "increasing";

/** One note a query carries in the contract; values identical to the specification's. */
export type QueryNote = "fresh" | "increasing" | "may-fail";

/** Input of `QueryNotes`: facts about one query. */
export interface QueryFacts {
  /** Whether asking the query can fail (spec `mayFail`). */
  mayFail: boolean;
  /** The query's promise (spec `promise`). */
  promise: QueryPromise;
}

/** Performs `QueryNotes`: the notes the given query carries in the contract, in the order they are written. */
export function queryNotes(query: QueryFacts): QueryNote[] {
  const notes: QueryNote[] = [];
  if (query.promise !== "none") notes.push(query.promise);
  if (query.mayFail) notes.push("may-fail");
  return notes;
}

// ---------------------------------------------------------------------------
// RequestSections
// ---------------------------------------------------------------------------

/**
 * Which feedback section a request includes (spec calculation `feedback`):
 *   `"none"`             no feedback section.
 *   `"current-code"`     feedback about the code as it was before any session.
 *   `"previous-attempt"` feedback about the previous attempt.
 */
export type FeedbackSection = "none" | "current-code" | "previous-attempt";

/** Input of `RequestSections`: facts about the request being written. */
export interface RequestFacts {
  /** Which attempt this is, counting from 1 (spec `attempt`, 1..10). */
  attempt: number;
  /** Whether there is feedback to give (spec `hasFeedback`). */
  hasFeedback: boolean;
  /** How many other components of the same system there are (spec `others`, 0..100). */
  others: number;
  /** How many files of contained components there are (spec `partFiles`, 0..100). */
  partFiles: number;
  /** The pipeline phase the request is for (spec `phase`). */
  phase: Phase;
}

/** Answer of `RequestSections`: which optional sections the request includes. */
export interface RequestSectionsPlan {
  /** Whether the components this one contains are listed (spec `contained`). */
  contained: boolean;
  /** Which feedback section is included (spec `feedback`). */
  feedback: FeedbackSection;
  /** Whether the other components of the same system are listed (spec `others`). */
  others: boolean;
}

/** The feedback section: none without feedback, about the current code on attempt 1, else about the previous attempt. */
function feedbackSection(hasFeedback: boolean, attempt: number): FeedbackSection {
  if (!hasFeedback) return "none";
  return attempt === 1 ? "current-code" : "previous-attempt";
}

/** Performs `RequestSections`: which optional sections the given request to an agent includes. */
export function requestSections(facts: RequestFacts): RequestSectionsPlan {
  const listing = facts.phase !== "wiring";
  return {
    contained: listing && facts.partFiles > 0,
    feedback: feedbackSection(facts.hasFeedback, facts.attempt),
    others: listing && facts.others > 0,
  };
}

// ---------------------------------------------------------------------------
// TypeText
// ---------------------------------------------------------------------------

/**
 * The kind of type to write (spec `kind`):
 *   `"value"`     any JSON value.
 *   `"one-of"`    one of several named variants (variants in `entries`).
 *   `"optional"`  a value or null (inner type in `inner`).
 *   `"list"`      a sequence (element type in `inner`).
 *   `"record"`    a value with fields (fields in `entries`).
 *   `"enum"`      one of fixed literal members (in `members`).
 *   `"string"`, `"number"` those primitives (`"number"` covers integers too).
 *   `"primitive"` any other primitive, named by `name`.
 */
export type TypeKind = "value" | "one-of" | "optional" | "list" | "record" | "enum" | "string" | "number" | "primitive";

/** One field of a record, or one variant of a oneOf, with its type already written. */
export interface TypeEntry {
  /** The field's or variant's name. */
  name: string;
  /** Whether the field may be null (meaningful for record fields). */
  optional: boolean;
  /** The TypeScript text of its type, already written. */
  text: string;
}

/**
 * Input of `TypeText`: a type to write, with the texts of the types inside it
 * already written. Only the fields relevant to `kind` matter; callers pass
 * empty values (`""`, `[]`) for the others.
 */
export interface TypeTextFacts {
  /** Fields of a record or variants of a oneOf (spec `entries`), in any order. */
  entries: TypeEntry[];
  /** Text of the inner type of an optional value or a list (spec `inner`). */
  inner: string;
  /** What kind of type it is (spec `kind`). */
  kind: TypeKind;
  /** Members of an enumeration, each already written as a literal (spec `members`). */
  members: string[];
  /** Name of the primitive, for kind `"primitive"` (spec `name`). */
  name: string;
}

/** The text written for any JSON value. */
const ANY_VALUE_TEXT = "null | boolean | number | string | unknown[] | { [field: string]: unknown }";

/** The entries in the order of their names. */
function byName(entries: TypeEntry[]): TypeEntry[] {
  return [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Whether a list's element text must be parenthesized before `[]`. */
function needsParentheses(inner: string): boolean {
  return (inner.includes(" ") || inner.includes("|")) && !inner.startsWith("{");
}

/** Performs `TypeText`: the TypeScript text of the given type, as written in the contract. */
export function typeText(type: TypeTextFacts): string {
  switch (type.kind) {
    case "value":
      return ANY_VALUE_TEXT;
    case "one-of": {
      const variants = byName(type.entries).map((entry) => `{ ${entry.name}: ${entry.text} }`);
      return variants.length === 0 ? "never" : variants.join(" | ");
    }
    case "optional":
      return `${type.inner} | null`;
    case "list":
      return `${needsParentheses(type.inner) ? `(${type.inner})` : type.inner}[]`;
    case "record": {
      const fields = byName(type.entries).map(
        (entry) => `${entry.name}: ${entry.text}${entry.optional ? " | null" : ""}`,
      );
      return fields.length === 0 ? "{}" : `{ ${fields.join("; ")} }`;
    }
    case "enum":
      return type.members.length === 0 ? "never" : type.members.join(" | ");
    case "string":
      return "string";
    case "number":
      return "number";
    case "primitive":
      return type.name;
  }
}
