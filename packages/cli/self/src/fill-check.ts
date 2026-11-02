/**
 * Decides what one prose fragment inside a body becomes.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `fill-check`.
 */

/**
 * What sort of thing the fragment is. Specification name: parameter `kind`; the
 * values are the specification's own.
 *
 * - `"is"`: a condition.
 * - `"does"`: something that happens.
 * - `"value"`: a value.
 */
export type FragmentKind = "is" | "does" | "value";

/**
 * What is under the fragment's name. Specification name: parameter `entry`; the
 * values are the specification's own.
 *
 * - `"none"`: nothing.
 * - `"elsewhere"`: something Layer 1 wrote under another heading.
 * - `"prose"`: prose.
 * - `"method"`: a method.
 * - `"expression"`: an expression.
 */
export type FragmentEntry = "none" | "elsewhere" | "prose" | "method" | "expression";

/**
 * What the fragment becomes. Specification name: the result of the query
 * `Fragment`; the values are the specification's own.
 *
 * - `"inline"`: the expression written with the fragment is what it becomes.
 * - `"fill"`: the entry under its name is what it becomes.
 * - `"prose-left"`: it stays prose.
 * - `"overwrite"`: an entry of the interpretation collides with the fragment.
 * - `"clash"`: its name collides with another use of that name.
 * - `"not-a-method"`: the entry under its name is of a form this fragment cannot take.
 */
export type FragmentOutcome =
  | "inline"
  | "fill"
  | "prose-left"
  | "overwrite"
  | "clash"
  | "not-a-method";

/**
 * Everything known about one fragment. The field names are the specification's
 * parameter names.
 */
export interface FragmentFacts {
  /** The fragment's kind (specification parameter `kind`). */
  kind: FragmentKind;
  /** Whether the fragment's expression is written with it (specification parameter `inline`). */
  inline: boolean;
  /** What is under the fragment's name (specification parameter `entry`). */
  entry: FragmentEntry;
  /** Whether that entry was written by the interpretation (specification parameter `byInterpretation`). */
  byInterpretation: boolean;
}

/**
 * Performs the specification's query `Fragment` (`fill-check.Fragment`).
 *
 * Accepts any combination of the four facts and always answers. Reads no state,
 * so the same facts always give the same answer.
 *
 * @param facts the fragment's four facts, one field per specification parameter.
 * @returns what the fragment becomes.
 */
export function decideFragment(facts: FragmentFacts): FragmentOutcome {
  const { kind, inline, entry, byInterpretation } = facts;
  if (entry === "elsewhere") {
    return "clash";
  }
  if (inline) {
    return byInterpretation && entry !== "none" ? "overwrite" : "inline";
  }
  if (entry === "none" || entry === "prose") {
    return "prose-left";
  }
  if (entry === "method") {
    return "fill";
  }
  return kind === "is" ? "fill" : "not-a-method";
}
