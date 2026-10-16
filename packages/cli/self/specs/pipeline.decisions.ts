import { conditions, decisions, otherwise } from "@clp/core";
export const PlanIf = conditions({
  thereNoProductionCodeYet: "There is no production code yet",
  thereProductionCodeBoundaryDiffers: "There is production code, and the boundary differs from the previous run",
  thereProductionCodeBoundaryUnchanged: "There is production code, the boundary is unchanged, and there is no adapter",
});

// Which phase a run starts with is decided from what the output already holds.
// `phase` is the phase of the first agent session; `null` where the run starts by grading instead.
export const Decision = decisions({
  plan: [
    PlanIf.thereNoProductionCodeYet.then({ phase: "design", incremental: false }),
    PlanIf.thereProductionCodeBoundaryDiffers.then({ phase: "design", incremental: true }),
    PlanIf.thereProductionCodeBoundaryUnchanged.then({ phase: "wiring", incremental: true }),
    otherwise({ phase: null, incremental: true }),
  ],
});
