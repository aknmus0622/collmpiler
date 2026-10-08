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
export type { Diagnostic, DiagnosticCode, ReferenceCheckState, WalkMemory } from "./reference-check-types.ts";
export type { Declarations, DiagnosticReporter, ReferenceCheckDependencies } from "./reference-check-ports.ts";
export type { ReferenceOutcome } from "./reference-check-decisions.ts";
export { decideFinish, decideReference, nextErrors } from "./reference-check-decisions.ts";
export { ReferenceCheck } from "./reference-check.ts";
export type {
  PayloadCheckState,
  PayloadDiagnostic,
  PayloadDiagnosticCode,
  ValueKind,
} from "./payload-check-types.ts";
export type {
  EffectDeclarations,
  GivenPayloads,
  PayloadCheckDependencies,
  PayloadDiagnosticReporter,
} from "./payload-check-ports.ts";
export type { EnterEffectOutcome } from "./payload-check-decisions.ts";
export { decideDeclaredField, decideEnterEffect, decideGivenField, kindFits } from "./payload-check-decisions.ts";
export { PayloadCheck } from "./payload-check.ts";
