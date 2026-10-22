/**
 * Usage check: decides which declared things are never used.
 *
 * Corresponds to the specification component `usage-check`. It has no state
 * and no dependencies; its one query is implemented here by a pure function
 * that answers the same result for the same argument and touches nothing:
 *
 * - `Declared` → {@link declaredUsage}
 */

/**
 * The kind of thing declared (the specification parameter `kind` of
 * `Declared`). Each value is the specification value of the same name.
 *
 * - `"state"`: a state field of a component.
 * - `"query"`: a query of the outside world.
 * - `"command"`: a command of the outside world.
 */
export type DeclaredKind = "state" | "query" | "command";

/**
 * The input of the `Declared` query: one declared thing and how it is used.
 * Each field is the specification parameter of the same name.
 */
export interface DeclaredFacts {
  /** What kind of thing is declared (specification parameter `kind`). */
  kind: DeclaredKind;
  /** Whether anything reads it (for a query: asks it) (specification parameter `read`). */
  read: boolean;
  /** Whether anything writes to it (for a command: calls it) (specification parameter `written`). */
  written: boolean;
}

/**
 * The verdict on a declared thing (the specification's result of `Declared`,
 * calculation `declared`). Each value is the specification value of the same
 * name.
 *
 * - `"none"`: nothing to report.
 * - `"never-read"`: reported for a state field that goes unused.
 * - `"never-asked"`: reported for a query of the outside world that goes unused.
 * - `"never-called"`: reported for a command of the outside world that goes unused.
 */
export type DeclaredUsage = "none" | "never-read" | "never-asked" | "never-called";

/**
 * Specification query `usage-check.Declared` (calculation `declared`).
 *
 * Judges whether one declared thing is never used.
 *
 * @param declared what is declared and whether it is read and written (the
 *   specification's parameters, as one record).
 * @returns `"none"`, or the kind of non-use found.
 */
export function declaredUsage(declared: DeclaredFacts): DeclaredUsage {
  const { kind, read, written } = declared;
  if (kind === "state" && !read) return "never-read";
  if (kind === "query" && !read) return "never-asked";
  if (kind === "command" && !written) return "never-called";
  return "none";
}
