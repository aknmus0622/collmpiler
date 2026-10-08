import type { Phase } from "./types.ts";

/**
 * Snapshot of the workspace, as needed by `planRun`. The pipeline assembles it from the answers of
 * `Workspace`.
 */
export interface WorkspaceFacts {
  /** The `hasProductionCode` answer. */
  readonly hasProductionCode: boolean;
  /** The `boundaryChanged` answer. */
  readonly boundaryChanged: boolean;
  /** The `hasAdapter` answer. */
  readonly hasAdapter: boolean;
}

/** The chosen row of the specification's `plan` decision table, column for column. */
export interface RunPlan {
  /** The `phase` column; `undefined` where the table gives `null`. */
  readonly phase: Phase | undefined;
  /** The `incremental` column. */
  readonly incremental: boolean;
}

/**
 * Where a run stands when a check has been rejected. Assembled from the pipeline's remembered data
 * (`data.attempt`, `data.maxAttempts`, `data.round`, `data.maxRounds`).
 */
export interface Progress {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly round: number;
  readonly maxRounds: number;
}

/**
 * What follows a rejected check. Names the outcome of the `DesignChecked`, `WiringChecked` and
 * `ImplementationChecked` commands that applies:
 *
 * - `"retry-phase"`: the outcome that starts a session of the same phase again;
 * - `"new-round"`: the outcome that starts a design session in a new round;
 * - `"give-up"`: the outcome that goes to `FAILED`.
 */
export type RejectionOutcome = "retry-phase" | "new-round" | "give-up";

/**
 * Pure decision. Corresponds to the specification's `plan` decision table.
 *
 * @param workspace the workspace answers the table's conditions are about
 * @returns the values of the row that applies
 */
export function planRun(workspace: WorkspaceFacts): RunPlan {
  if (!workspace.hasProductionCode) {
    return { phase: "design", incremental: false };
  }
  if (workspace.boundaryChanged) {
    return { phase: "design", incremental: true };
  }
  if (!workspace.hasAdapter) {
    return { phase: "wiring", incremental: true };
  }
  return { phase: undefined, incremental: true };
}

/**
 * Pure decision. Chooses among the outcomes the specification gives for a rejected check.
 *
 * @param progress the remembered attempt and round numbers and their limits
 * @returns the outcome that applies
 */
export function afterRejection(progress: Progress): RejectionOutcome {
  if (progress.attempt < progress.maxAttempts) {
    return "retry-phase";
  }
  if (progress.round < progress.maxRounds) {
    return "new-round";
  }
  return "give-up";
}

/**
 * Pure calculation. Corresponds to the specification's `nextAttempt`.
 *
 * @param attempt the current attempt number (`data.attempt`)
 */
export function nextAttempt(attempt: number): number {
  return attempt + 1;
}

/**
 * Pure calculation. Corresponds to the specification's `nextRound`.
 *
 * @param round the current round number (`data.round`)
 */
export function nextRound(round: number): number {
  return round + 1;
}
