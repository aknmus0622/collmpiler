import { conditions, decisions, otherwise, states } from "@clp/core";

export const State = states(["IDLE", "DESIGN", "WIRING", "GRADING", "IMPLEMENTATION", "DONE", "FAILED"]);

export const PlanIf = conditions({
  thereNoProductionCodeYet: "There is no production code yet",
  thereProductionCodeBoundaryDiffers: "There is production code, and the boundary differs from the previous run",
  thereProductionCodeBoundaryUnchanged: "There is production code, the boundary is unchanged, and there is no adapter",
});

// Which phase a run starts with is decided from what the output already holds.
// `phase` is the phase of the first agent session; `null` where the run starts by grading instead.
// `next` is the state the pipeline goes to.
export const Decision = decisions({
  plan: [
    PlanIf.thereNoProductionCodeYet.then({ phase: "design", next: State.DESIGN, incremental: false }),
    PlanIf.thereProductionCodeBoundaryDiffers.then({ phase: "design", next: State.DESIGN, incremental: true }),
    PlanIf.thereProductionCodeBoundaryUnchanged.then({ phase: "wiring", next: State.WIRING, incremental: true }),
    otherwise({ phase: null, next: State.GRADING, incremental: true }),
  ],
});
