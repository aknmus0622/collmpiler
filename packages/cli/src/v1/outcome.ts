// What happens with one call of an event (1.0): the Stage 0 of the grading component outcome-apply (R1). Given the
// facts about the call, the answer is what the simulator does with it. Nothing else belongs in this file (a change
// here makes the component's pass record unusable: R5).
//
//   external … the callee is the outside world (an effect) rather than a component inside the system
//   guard    … the call has no condition, or its condition holds, or does not
//   touched  … the callee (inside) was already changed in this step

export type CallFacts = { external: boolean; guard: "none" | "holds" | "not"; touched: boolean };
export type CallDecision = "effect" | "call" | "skip" | "twice";

export function callStage0({ external, guard, touched }: CallFacts): CallDecision {
  if (guard === "not") return "skip";
  if (external) return "effect";
  return touched ? "twice" : "call";
}
