/**
 * The dependencies of the pipeline, described in the pipeline's own terms. The pipeline receives one
 * implementation of each through its constructor and never reaches for anything else.
 *
 * All methods are synchronous. The methods that tell a dependency to do something only launch the work;
 * the result of that work comes back to the pipeline later as a separate command.
 */

import type { SessionRequest } from "./types.ts";

/**
 * The directory tree that holds the component being produced.
 *
 * The three questions are asked only while the pipeline handles its start command. The pipeline asks all
 * three, once each, every time it is started, and does not keep the answers afterwards.
 */
export interface Workspace {
  /**
   * Asked: is there production code for the component already?
   *
   * Specification query: `hasProductionCode`.
   */
  hasProductionCode(): boolean;

  /**
   * Asked: does the component's boundary differ from the one the previous run worked from?
   *
   * Specification query: `boundaryChanged`.
   */
  boundaryChangedSincePreviousRun(): boolean;

  /**
   * Asked: is there an adapter connecting the production code to the test harness?
   *
   * Specification query: `hasAdapter`.
   */
  hasAdapter(): boolean;

  /**
   * Told: throw away the code produced so far. Takes no arguments.
   *
   * Specification effect: `DiscardCode` (empty payload). When the pipeline both discards the code and
   * starts a session while handling one command, this call comes first.
   */
  discardCode(): void;
}

/**
 * Starts the working sessions in which the code is designed, wired, or implemented.
 */
export interface SessionLauncher {
  /**
   * Told: start one working session.
   *
   * Specification effect: `StartSession`, whose payload fields `phase`, `round` and `attempt` are the
   * fields of `session` with the same names.
   *
   * @param session which phase to work on, and the round and attempt numbers the session belongs to.
   */
  startSession(session: SessionRequest): void;
}

/**
 * Grades the code as it currently stands, without any working session.
 */
export interface Grader {
  /**
   * Told: grade the current code.
   *
   * Specification effect: `GradeCurrentCode`, whose payload field `round` is the argument.
   *
   * @param round the round number the grading belongs to.
   */
  gradeCurrentCode(round: number): void;
}

/** Everything the pipeline needs from outside, passed to its constructor as one object. */
export interface PipelineDependencies {
  /** Asked about the existing code when the pipeline is started; told to discard the code. */
  readonly workspace: Workspace;
  /** Told to start working sessions. */
  readonly sessions: SessionLauncher;
  /** Told to grade the current code. */
  readonly grader: Grader;
}
