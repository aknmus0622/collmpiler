/**
 * Outcome apply: decides what happens with each call an event makes.
 *
 * Corresponds to the specification component `outcome-apply`. It has no state
 * and no dependencies; its only entry is the query `Call`, implemented here
 * by the pure function {@link outcomeApply}.
 */

/**
 * Specification query `outcome-apply.Call` (calculation `call`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 * Asked once for each call an event makes, in the order the event lists them.
 *
 * @param call the call to decide on (the specification's parameters, as one record).
 * @returns what happens with the call (the specification's result).
 */
export function outcomeApply(call: EventCall): CallOutcome {
  if (call.guard === "not") return "skip";
  if (call.external) return "effect";
  return call.touched ? "twice" : "call";
}

/**
 * The input of the `Call` query: one call made by an event.
 * Each field is the specification parameter of the same name.
 */
export interface EventCall {
  /** Whether the called component is the outside world (specification parameter `external`). */
  external: boolean;
  /** The call's own condition (specification parameter `guard`). */
  guard: CallGuard;
  /** Whether the called component was already changed in this step (specification parameter `touched`). */
  touched: boolean;
}

/**
 * The call's own condition (specification parameter `guard`).
 *
 * - `"none"`: the call has no condition.
 * - `"holds"`: the call has a condition, and it holds.
 * - `"not"`: the call has a condition, and it does not hold.
 */
export type CallGuard = "none" | "holds" | "not";

/**
 * What happens with the call (the specification's result of `Call`).
 *
 * - `"effect"`: it is an effect on the outside world.
 * - `"call"`: the component inside the system is called in this step.
 * - `"skip"`: the call is not made.
 * - `"twice"`: the component would be called twice in one step, which a
 *   specification must not do.
 */
export type CallOutcome = "effect" | "call" | "skip" | "twice";
