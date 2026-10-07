/** Entry point: re-exports the whole public shape of the production code. */

export type {
  Phase,
  PipelineState,
  Progress,
  RunLimits,
  SessionRequest,
  WorkspaceFacts,
} from "./types.ts";
export type { Grader, PipelineDependencies, SessionLauncher, Workspace } from "./ports.ts";
export type { StartPlan, Step } from "./decisions.ts";
export { decideAfterCheck, decideAfterGrading, decideStart, nextAttempt, nextRound, planFor } from "./decisions.ts";
export { Pipeline } from "./pipeline.ts";
