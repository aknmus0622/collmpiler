/**
 * Shared vocabulary of the code-generation pipeline.
 *
 * The pipeline drives one component through up to three kinds of working session (design, wiring,
 * implementation), has each session's result checked, and retries within limits. This file holds only
 * types; it has no behaviour.
 */

/**
 * The kind of working session the pipeline can ask for.
 *
 * Same names as the specification's `StartSession.phase` values.
 */
export type Phase = "design" | "wiring" | "implementation";

/**
 * Where the pipeline currently is. The names are exactly the specification's state names.
 *
 * - `IDLE`: nothing has been started yet (the starting state).
 * - `DESIGN`: a design session is running; the pipeline waits for its check result.
 * - `WIRING`: a wiring session is running; the pipeline waits for its check result.
 * - `GRADING`: the existing code is being graded; the pipeline waits for the grade.
 * - `IMPLEMENTATION`: an implementation session is running; the pipeline waits for its check result.
 * - `DONE`: finished successfully. No further command applies.
 * - `FAILED`: gave up. No further command applies.
 */
export type PipelineState =
  | "IDLE"
  | "DESIGN"
  | "WIRING"
  | "GRADING"
  | "IMPLEMENTATION"
  | "DONE"
  | "FAILED";

/**
 * The retry limits given when the pipeline is started (the input of the specification's `Start` command).
 */
export interface RunLimits {
  /** How many rounds the run may use. Specification name: `rounds` (remembered as `maxRounds`). */
  readonly rounds: number;
  /**
   * How many attempts each phase may use within one round. Specification name: `attemptsPerPhase`
   * (remembered as `maxAttempts`).
   */
  readonly attemptsPerPhase: number;
}

/**
 * What the pipeline remembers between commands (the specification's `data`). Every field has the same
 * name as the specification's data field it corresponds to.
 */
export interface Progress {
  /** The current round number, counted from 1. Specification name: `round`. */
  readonly round: number;
  /** The current attempt number within the current phase, counted from 1. Specification name: `attempt`. */
  readonly attempt: number;
  /** The limit of rounds remembered from the start of the run. Specification name: `maxRounds`. */
  readonly maxRounds: number;
  /** The limit of attempts per phase remembered from the start of the run. Specification name: `maxAttempts`. */
  readonly maxAttempts: number;
  /**
   * `true` when the run changes code that already existed, `false` when the code is being written from
   * nothing. Specification name: `incremental`.
   */
  readonly incremental: boolean;
}

/** Identifies one working session: which phase, in which round, which attempt. */
export interface SessionRequest {
  /** Specification name: `StartSession.phase`. */
  readonly phase: Phase;
  /** Specification name: `StartSession.round`. */
  readonly round: number;
  /** Specification name: `StartSession.attempt`. */
  readonly attempt: number;
}

/**
 * What the workspace looked like at the moment the pipeline was started: the answers of the three
 * questions of the `Workspace` dependency (see `ports.ts`) gathered into one value, so that the start
 * decision can be a pure function.
 */
export interface WorkspaceFacts {
  /** Answer of `Workspace.hasProductionCode()`. Specification query: `hasProductionCode`. */
  readonly hasProductionCode: boolean;
  /** Answer of `Workspace.boundaryChangedSincePreviousRun()`. Specification query: `boundaryChanged`. */
  readonly boundaryChanged: boolean;
  /** Answer of `Workspace.hasAdapter()`. Specification query: `hasAdapter`. */
  readonly hasAdapter: boolean;
}
