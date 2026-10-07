/**
 * The business decisions of the pipeline as pure functions: they take plain values, return plain values,
 * and touch no dependency. The `Pipeline` class (see `pipeline.ts`) gathers the inputs, calls these, and
 * carries out what they return.
 *
 * The rules themselves are in the specification, not in these comments.
 */

import type { Phase, PipelineState, Progress, RunLimits, SessionRequest, WorkspaceFacts } from "./types.ts";

/**
 * What a command leads to: the state to move to, what to remember, and what to tell the dependencies.
 *
 * The side effects are carried out in the order: `discardCode`, then `startSession`, then `gradeRound`.
 */
export interface Step {
  /** The state the pipeline is in after the command (specification: `goTo`). */
  readonly state: PipelineState;
  /** The remembered data after the command (specification: the data with the outcome's `set` applied). */
  readonly progress: Progress;
  /** `true` when the workspace must be told to discard the code (specification effect `DiscardCode`). */
  readonly discardCode: boolean;
  /** The session to start, or `null` for none (specification effect `StartSession`). */
  readonly startSession: SessionRequest | null;
  /**
   * The round number to have the current code graded for, or `null` for no grading (specification effect
   * `GradeCurrentCode`).
   */
  readonly gradeRound: number | null;
}

/**
 * The values of one row of the specification's `plan` decision table.
 */
export interface StartPlan {
  /** Specification column: `plan.incremental`. */
  readonly incremental: boolean;
  /** Specification column: `plan.phase`; `null` where the table gives no phase. */
  readonly phase: Phase | null;
}

/**
 * Looks up the specification's `plan` decision table.
 *
 * @param facts the workspace's answers at the moment of starting.
 * @returns the values of the row that applies.
 */
export function planFor(facts: WorkspaceFacts): StartPlan {
  if (!facts.hasProductionCode) {
    return { incremental: false, phase: "design" };
  }
  if (facts.boundaryChanged) {
    return { incremental: true, phase: "design" };
  }
  if (!facts.hasAdapter) {
    return { incremental: true, phase: "wiring" };
  }
  return { incremental: true, phase: null };
}

/** The round a run begins in. */
const FIRST_ROUND = 1;

/** The attempt every phase begins with. */
const FIRST_ATTEMPT = 1;

/** The state in which the pipeline waits for the check result of a session of `phase`. */
function waitingStateOf(phase: Phase): PipelineState {
  if (phase === "design") {
    return "DESIGN";
  }
  if (phase === "wiring") {
    return "WIRING";
  }
  return "IMPLEMENTATION";
}

/** A step that starts a session of `phase` for the round and attempt in `progress`. */
function launch(phase: Phase, progress: Progress): Step {
  return {
    state: waitingStateOf(phase),
    progress,
    discardCode: false,
    startSession: { phase, round: progress.round, attempt: progress.attempt },
    gradeRound: null,
  };
}

/** A step that has the current code graded for the round in `progress`. */
function grade(progress: Progress): Step {
  return { state: "GRADING", progress, discardCode: false, startSession: null, gradeRound: progress.round };
}

/** A step that ends the run in `state` without telling the dependencies anything. */
function rest(state: PipelineState, progress: Progress): Step {
  return { state, progress, discardCode: false, startSession: null, gradeRound: null };
}

/**
 * Decides what the specification's `Start` command leads to.
 *
 * @param limits the limits given with the start command.
 * @param facts the workspace's answers at the moment of starting.
 * @returns the state to enter, the data to remember, and the side effects to perform.
 */
export function decideStart(limits: RunLimits, facts: WorkspaceFacts): Step {
  const plan = planFor(facts);
  const progress: Progress = {
    round: FIRST_ROUND,
    attempt: FIRST_ATTEMPT,
    maxRounds: limits.rounds,
    maxAttempts: limits.attemptsPerPhase,
    incremental: plan.incremental,
  };
  if (plan.phase === null) {
    return grade(progress);
  }
  return launch(plan.phase, progress);
}

/**
 * Decides what a check result for a working session leads to. Covers the specification's commands
 * `DesignChecked`, `WiringChecked` and `ImplementationChecked`, selected by `phase`.
 *
 * @param phase the phase whose session was checked.
 * @param passed whether the check passed.
 * @param progress the data remembered before the command.
 * @returns the state to enter, the data to remember, and the side effects to perform.
 */
export function decideAfterCheck(phase: Phase, passed: boolean, progress: Progress): Step {
  if (passed) {
    const settled: Progress = { ...progress, attempt: FIRST_ATTEMPT };
    if (phase === "design") {
      return launch("wiring", settled);
    }
    if (phase === "wiring") {
      return progress.incremental ? grade(settled) : launch("implementation", settled);
    }
    return rest("DONE", progress);
  }
  if (progress.attempt < progress.maxAttempts) {
    return launch(phase, { ...progress, attempt: nextAttempt(progress) });
  }
  if (progress.round < progress.maxRounds) {
    const restarted = launch("design", { ...progress, round: nextRound(progress), attempt: FIRST_ATTEMPT });
    return { ...restarted, discardCode: !progress.incremental };
  }
  return rest("FAILED", progress);
}

/**
 * Decides what a grade of the current code leads to (specification command `CurrentCodeGraded`).
 *
 * @param passed whether the grading passed.
 * @param progress the data remembered before the command.
 * @returns the state to enter, the data to remember, and the side effects to perform.
 */
export function decideAfterGrading(passed: boolean, progress: Progress): Step {
  if (passed) {
    return rest("DONE", progress);
  }
  return launch("implementation", { ...progress, attempt: FIRST_ATTEMPT });
}

/**
 * The specification's calculation `nextAttempt`.
 *
 * @param progress the data remembered before the command.
 */
export function nextAttempt(progress: Progress): number {
  return progress.attempt + 1;
}

/**
 * The specification's calculation `nextRound`.
 *
 * @param progress the data remembered before the command.
 */
export function nextRound(progress: Progress): number {
  return progress.round + 1;
}
