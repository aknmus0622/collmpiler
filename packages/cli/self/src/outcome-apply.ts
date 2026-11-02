/**
 * Classifies one entry of an event's call list, so that whoever runs the event
 * knows how to treat that entry.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `outcome-apply`.
 */

/**
 * Where the call's condition stands. Specification name: parameter `guard`; the
 * values are the specification's own.
 *
 * - `"none"`: the entry carries no `when`.
 * - `"holds"`: the entry carries a `when`, and it evaluated to true.
 * - `"not"`: the entry carries a `when`, and it evaluated to false.
 */
export type CallGuard = "none" | "holds" | "not";

/**
 * How the runner treats the entry. Specification name: the result of the query
 * `Call`; the values are the specification's own.
 *
 * - `"effect"`: the runner records it as an action against an external component.
 * - `"call"`: the runner performs it on the contained component, within the step.
 * - `"skip"`: the runner passes over it.
 * - `"twice"`: the runner reports a repeated invocation, which is a fault in the
 *   model being run rather than in this code.
 */
export type CallOutcome = "effect" | "call" | "skip" | "twice";

/**
 * The facts about one entry of the call list. The field names are the
 * specification's parameter names.
 */
export interface CallFacts {
  /** True when the target is an `external` component, false when it is a contained one (specification parameter `external`). */
  external: boolean;
  /** The state of the entry's `when` (specification parameter `guard`). */
  guard: CallGuard;
  /** True when the current step has previously modified the target's state (specification parameter `touched`). */
  touched: boolean;
}

/**
 * Performs the specification's query `Call` (`outcome-apply.Call`).
 *
 * Accepts any combination of the three facts and always answers. Reads no state,
 * so the same facts always give the same answer. Ask once per entry of the list.
 *
 * @param facts the entry's three facts, one field per specification parameter.
 * @returns how the runner treats the entry.
 */
export function decideCall(facts: CallFacts): CallOutcome {
  if (facts.guard === "not") {
    return "skip";
  }
  if (facts.external) {
    return "effect";
  }
  return facts.touched ? "twice" : "call";
}
