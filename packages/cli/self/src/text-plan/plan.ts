import type {
  ContractFacts,
  ContractSections,
  FeedbackSection,
  QueryNote,
  QueryPromise,
  RequestFacts,
  RequestSections,
  TypeShape,
} from "./types.ts";

/**
 * Pure calculation. Corresponds to the specification's `hasCommandOutput`.
 *
 * @param outputs how many commands answer with something
 * @returns whether the contract has the section on what commands answer with
 */
export function hasCommandOutput(outputs: number): boolean {
  return outputs > 0;
}

/**
 * Pure calculation. Corresponds to the specification's `hasParts`.
 *
 * @param parts how many contained components there are
 * @returns whether the contract has the note about the dependencies of contained components
 */
export function hasParts(parts: number): boolean {
  return parts > 0;
}

/**
 * Pure calculation. Corresponds to the specification's `hasRoutes`.
 *
 * @param routes how many commands have an HTTP route
 * @returns whether the contract has the section on routes
 */
export function hasRoutes(routes: number): boolean {
  return routes > 0;
}

/**
 * Pure decision: which optional sections a contract includes. Answer of the specification's
 * `ContractSections` command.
 *
 * @param facts the facts about the component; `ContractFacts` says how they correspond to the spec
 * @returns the sections; `ContractSections` says how its fields correspond to the spec
 */
export function contractSections(facts: ContractFacts): ContractSections {
  return {
    commandOutput: hasCommandOutput(facts.outputs),
    partsNote: hasParts(facts.parts),
    restarts: facts.restarts,
    routes: hasRoutes(facts.routes),
  };
}

/**
 * Pure calculation. Corresponds to the specification's `queryNotes`.
 *
 * @param promise what the environment guarantees about the query's answers
 * @param mayFail whether asking the query can fail
 * @returns the notes the query carries in the contract, in the order they are written
 */
export function queryNotes(promise: QueryPromise, mayFail: boolean): QueryNote[] {
  const notes: QueryNote[] = [];
  if (promise !== "none") notes.push(promise);
  if (mayFail) notes.push("may-fail");
  return notes;
}

/**
 * Pure calculation. Corresponds to the specification's `feedback`.
 *
 * @param facts the facts about the request; only `attempt` and `hasFeedback` are read
 * @returns what the feedback section of the request is about
 */
export function feedbackSection(facts: RequestFacts): FeedbackSection {
  if (!facts.hasFeedback) return "none";
  return facts.attempt === 1 ? "current-code" : "previous-attempt";
}

/**
 * Pure calculation. Corresponds to the specification's `listsContained`.
 *
 * @param facts the facts about the request; only `phase` and `partFiles` are read
 * @returns whether the request lists the components this one contains
 */
export function listsContained(facts: RequestFacts): boolean {
  return facts.phase !== "wiring" && facts.partFiles > 0;
}

/**
 * Pure calculation. Corresponds to the specification's `listsOthers`.
 *
 * @param facts the facts about the request; only `phase` and `others` are read
 * @returns whether the request lists the other components of the same system
 */
export function listsOthers(facts: RequestFacts): boolean {
  return facts.phase !== "wiring" && facts.others > 0;
}

/**
 * Pure decision: which optional sections a request to an agent includes. Answer of the specification's
 * `RequestSections` command.
 *
 * @param facts the facts about the request; `RequestFacts` says how they correspond to the spec
 * @returns the sections; `RequestSections` says how its fields correspond to the spec
 */
export function requestSections(facts: RequestFacts): RequestSections {
  return {
    contained: listsContained(facts),
    feedback: feedbackSection(facts),
    others: listsOthers(facts),
  };
}

/**
 * Pure calculation. Corresponds to the specification's `typeText`.
 *
 * @param shape the type to write, with the types inside it already written; `TypeShape` says how it
 *   corresponds to the spec's `TypeText` input
 * @returns the TypeScript text of the type
 */
export function typeText(shape: TypeShape): string {
  switch (shape.kind) {
    case "value":
      return ANY_VALUE_TEXT;
    case "one-of": {
      const variants = byName(shape.variants).map((v) => `{ ${v.name}: ${v.text} }`);
      return variants.length === 0 ? "never" : variants.join(" | ");
    }
    case "optional":
      return `${shape.inner} | null`;
    case "list":
      return needsParentheses(shape.inner) ? `(${shape.inner})[]` : `${shape.inner}[]`;
    case "record": {
      const fields = byName(shape.fields).map(
        (f) => `${f.name}: ${f.text}${f.optional ? " | null" : ""}`,
      );
      return fields.length === 0 ? "{}" : `{ ${fields.join("; ")} }`;
    }
    case "enum":
      return shape.members.length === 0 ? "never" : shape.members.join(" | ");
    case "string":
      return "string";
    case "number":
      return "number";
    case "primitive":
      return shape.name;
  }
}

/** The fixed text of a type that admits any value. */
const ANY_VALUE_TEXT = "null | boolean | number | string | unknown[] | { [field: string]: unknown }";

/** The entries in the order of their names (by code unit), leaving the given array as it is. */
function byName<T extends { readonly name: string }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** Whether a list's element text must be put in parentheses before `[]`. */
function needsParentheses(inner: string): boolean {
  return (inner.includes(" ") || inner.includes("|")) && !inner.startsWith("{");
}
