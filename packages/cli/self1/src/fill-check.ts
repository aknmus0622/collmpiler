/**
 * Fill check: decides what a prose fragment inside a body becomes.
 *
 * Corresponds to the specification component `fill-check`. It has no state
 * and no dependencies; its only entry is the query `Fragment`, implemented here
 * by the pure function {@link fillCheck}.
 */

/**
 * Specification query `fill-check.Fragment` (calculation `fragment`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 *
 * @param fragment the fragment to decide on and what is under its name
 *                 (the specification's parameters, as one record).
 * @returns what the fragment becomes (the specification's result).
 */
export function fillCheck(fragment: FillFragment): FillOutcome {
  const { kind, inline, entry, byInterpretation } = fragment;
  // One component has one namespace: a name used under another heading clashes.
  if (entry === "elsewhere") return "clash";
  if (inline) {
    // The interpretation writing an entry next to an inline expression overwrites it.
    return byInterpretation && entry !== "none" ? "overwrite" : "inline";
  }
  if (entry === "none" || entry === "prose") return "prose-left";
  if (entry === "method") return "fill";
  // An expression is the content of a condition only; the others must be methods.
  return kind === "is" ? "fill" : "not-a-method";
}

/**
 * The input of the `Fragment` query: one prose fragment inside a body.
 * Each field is the specification parameter of the same name.
 */
export interface FillFragment {
  /** What the fragment is (specification parameter `kind`). */
  kind: FragmentKind;
  /** Whether the fragment's expression is written together with it (specification parameter `inline`). */
  inline: boolean;
  /** What is already under the fragment's name (specification parameter `entry`). */
  entry: FragmentEntry;
  /** Whether that entry was written by the interpretation (specification parameter `byInterpretation`). */
  byInterpretation: boolean;
}

/**
 * What kind of fragment it is (specification parameter `kind`).
 *
 * - `"is"`: a condition (something that holds or not).
 * - `"does"`: something that happens.
 * - `"value"`: a value.
 */
export type FragmentKind = "is" | "does" | "value";

/**
 * What is under the fragment's name (specification parameter `entry`).
 *
 * - `"none"`: nothing.
 * - `"elsewhere"`: something under another heading that Layer 1 wrote.
 * - `"prose"`: prose.
 * - `"method"`: a method.
 * - `"expression"`: an expression.
 */
export type FragmentEntry = "none" | "elsewhere" | "prose" | "method" | "expression";

/**
 * What the fragment becomes (the specification's result of `Fragment`).
 *
 * - `"inline"`: its inline expression is used.
 * - `"fill"`: the entry under its name is its content.
 * - `"prose-left"`: it stays prose.
 * - `"overwrite"`: the interpretation overwrote an entry for it.
 * - `"clash"`: its name is already used elsewhere in the component's one namespace.
 * - `"not-a-method"`: the entry under its name is an expression where a method is needed.
 */
export type FillOutcome = "inline" | "fill" | "prose-left" | "overwrite" | "clash" | "not-a-method";
