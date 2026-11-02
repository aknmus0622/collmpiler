/**
 * The specification's component `usage-check`: one pure function, `checkDeclared`.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 */

/**
 * What kind of thing was declared. Specification name: parameter `kind`; the
 * values are the specification's own.
 *
 * - `"state"`: a field a component remembers.
 * - `"query"`: a question put to an external component.
 * - `"command"`: an effect on an external component.
 */
export type DeclaredKind = "state" | "query" | "command";

/**
 * What is decided about a declared thing. Specification name: the result of the
 * query `Declared`; the values are the specification's own.
 *
 * - `"none"`: there is nothing to report.
 * - `"never-read"`, `"never-asked"`, `"never-called"`: the three findings that
 *   can be reported, each named after the use that is missing.
 */
export type DeclaredOutcome =
  | "none"
  | "never-read"
  | "never-asked"
  | "never-called";

/**
 * Everything known about one declared thing. The field names are the
 * specification's parameter names.
 */
export interface DeclaredFacts {
  /** What kind of thing was declared (specification parameter `kind`). */
  kind: DeclaredKind;
  /** Whether anything reads the thing (specification parameter `read`). */
  read: boolean;
  /** Whether anything writes to the thing (specification parameter `written`). */
  written: boolean;
}

/**
 * Performs the specification's query `Declared` (`usage-check.Declared`).
 *
 * Accepts any combination of the three facts and always answers. Reads no state,
 * so the same facts always give the same answer. Ask once per declared thing.
 *
 * @param facts the declared thing's three facts, one field per specification
 *   parameter.
 * @returns what is decided about the declared thing.
 */
export function checkDeclared(facts: DeclaredFacts): DeclaredOutcome {
  const { kind, read, written } = facts;
  if (kind === "state" && !read) return "never-read";
  if (kind === "query" && !read) return "never-asked";
  if (kind === "command" && !written) return "never-called";
  return "none";
}
