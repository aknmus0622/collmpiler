import { decisionTable } from "@clp/core";

// Which phase a run starts with is decided from what the output already holds.
// `phase` is the phase of the first agent session; `null` where the run starts by grading instead.
export const Plan = decisionTable({
  "There is no production code yet": { phase: "design", incremental: false },
  "There is production code, and the boundary differs from the previous run": { phase: "design", incremental: true },
  "There is production code, the boundary is unchanged, and there is no adapter": { phase: "wiring", incremental: true },
  otherwise: { phase: null, incremental: true },
});
