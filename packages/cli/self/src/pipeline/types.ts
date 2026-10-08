/**
 * Vocabulary of the pipeline: the position it reports, the phases it runs, the limits it is started with,
 * and the dependencies it is given.
 */

/**
 * Position of the pipeline. Corresponds to the specification's states:
 *
 * - `"idle"`: `IDLE`
 * - `"design"`: `DESIGN`
 * - `"wiring"`: `WIRING`
 * - `"grading"`: `GRADING`
 * - `"implementation"`: `IMPLEMENTATION`
 * - `"done"`: `DONE`
 * - `"failed"`: `FAILED`
 */
export type PipelineState = "idle" | "design" | "wiring" | "grading" | "implementation" | "done" | "failed";

/**
 * A phase an agent session works on. Corresponds to the `phase` of the specification's `StartSession`
 * effect, with the same spellings.
 */
export type Phase = "design" | "wiring" | "implementation";

/**
 * The limits a run is started with. Corresponds to the input of the specification's `Start` command,
 * member for member (`attemptsPerPhase`, `rounds`). Both are whole numbers.
 */
export interface PipelineLimits {
  readonly attemptsPerPhase: number;
  readonly rounds: number;
}

/**
 * Dependency: the place where the component's code lives. The pipeline consults it each time it needs an
 * answer and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface Workspace {
  /** Corresponds to the query `hasProductionCode` (no input); returns its answer. */
  hasProductionCode(): boolean;

  /** Corresponds to the query `boundaryChanged` (no input); returns its answer. */
  boundaryChanged(): boolean;

  /** Corresponds to the query `hasAdapter` (no input); returns its answer. */
  hasAdapter(): boolean;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `DiscardCode` effect, which has no payload.
   */
  discardCode(): void;
}

/** Dependency: the launcher of agent sessions. */
export interface SessionLauncher {
  /**
   * Called synchronously, from inside the command that performs it, once per session started.
   * Corresponds to the specification's `StartSession` effect; the arguments are its payload's `phase`,
   * `round` and `attempt`.
   */
  startSession(phase: Phase, round: number, attempt: number): void;
}

/** Dependency: the grader of the production code as it is, without an agent. */
export interface Grader {
  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `GradeCurrentCode` effect; the argument is its payload's `round`.
   */
  gradeCurrentCode(round: number): void;
}
