import { service, value } from "@clp/core/v1";

// What happens with one call of an event (packages/cli/src/v1/outcome.ts, used by `execute` in v1/eval.ts): an event
// calls other components in order; each call goes to the outside world (an effect, recorded) or to a component inside
// the system (it changes in the same step). Evaluating the call's condition is the caller's.
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): what it decides is a value of the oracle's run, so in use it
// must agree with Stage 0 (R4).
export const OutcomeApply = service("Decides what happens with each call an event makes.", {
  queries: {
    Call(external: boolean, guard: "none" | "holds" | "not", touched: boolean): "effect" | "call" | "skip" | "twice" {
      return value.call(
        "A call of the event, in order. A call with a condition that does not hold is skipped. Otherwise a call of the outside " +
          "world is an effect, and a call of a component inside the system is made, unless that component was already changed in " +
          "this step: then it is called twice in one step, which the specification must not do.",
      );
    },
  },
});
