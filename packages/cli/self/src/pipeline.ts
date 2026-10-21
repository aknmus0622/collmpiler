/**
 * How one component is reconciled with its specification: which phases
 * (design, wiring, implementation) are run as agent sessions, how a rejected
 * check repeats a phase, and how a phase that runs out of attempts restarts
 * the pipeline from design in a new round.
 *
 * Corresponds to the specification component "pipeline". One `Pipeline`
 * object drives one reconciliation. It does no work itself: whoever owns it
 * runs the sessions and the checks when told to by its `PipelineListener`,
 * and reports each check's result back by calling the matching method.
 * Facts about the workspace are asked of a `PipelineWorkspace` when needed.
 * Nothing is kept across a restart of the system.
 *
 * Command -> method:
 *   `Start`                 -> `start`
 *   `DesignChecked`         -> `designChecked`
 *   `WiringChecked`         -> `wiringChecked`
 *   `ImplementationChecked` -> `implementationChecked`
 *   `CurrentCodeGraded`     -> `currentCodeGraded`
 *
 * Query -> workspace method:
 *   `hasProductionCode` -> `PipelineWorkspace.hasProductionCode`
 *   `boundaryChanged`   -> `PipelineWorkspace.boundaryChanged`
 *   `hasAdapter`        -> `PipelineWorkspace.hasAdapter`
 *
 * Effect -> listener method:
 *   `StartSession`     -> `PipelineListener.startSession`
 *   `GradeCurrentCode` -> `PipelineListener.gradeCurrentCode`
 *   `DiscardCode`      -> `PipelineListener.discardCode`
 *
 * The specification's calculations, decision table and conditions are the
 * exported pure functions at the end of this file.
 */

import type { Phase } from "./gate-rules.ts";

export type { Phase };

/**
 * Where the pipeline stands; values identical to the specification's states.
 *   `"IDLE"`           nothing has been done yet (the starting state); `start` may be called.
 *   `"DESIGN"`         a design session is running; the owner answers with `designChecked`.
 *   `"WIRING"`         a wiring session is running; the owner answers with `wiringChecked`.
 *   `"GRADING"`        the current code is being graded without an agent; the owner answers with `currentCodeGraded`.
 *   `"IMPLEMENTATION"` an implementation session is running; the owner answers with `implementationChecked`.
 *   `"DONE"`           the component fits its specification (final).
 *   `"FAILED"`         attempts and rounds ran out (final).
 */
export type PipelineState =
  | "IDLE"
  | "DESIGN"
  | "WIRING"
  | "GRADING"
  | "IMPLEMENTATION"
  | "DONE"
  | "FAILED";

/** Input of `start` (spec command `Start`). Field names identical to the specification's. */
export interface PipelineLimits {
  /** How many attempts each phase has, 1 to 3 (remembered as spec data `maxAttempts`). */
  attemptsPerPhase: number;
  /** How many rounds the pipeline has, 1 to 3 (remembered as spec data `maxRounds`). */
  rounds: number;
}

/**
 * What the pipeline remembers between commands (spec `model.data`; field
 * names identical to the specification's). Meaningful only after `start`.
 */
export interface PipelineProgress {
  /** The running round, from 1. */
  round: number;
  /** The running attempt within the current phase, from 1. */
  attempt: number;
  /** The limit of attempts per phase (from `PipelineLimits.attemptsPerPhase`). */
  maxAttempts: number;
  /** The limit of rounds (from `PipelineLimits.rounds`). */
  maxRounds: number;
  /** Whether existing code is being changed, i.e. the code was not written from nothing (decided by `start`). */
  incremental: boolean;
}

/** Payload of the `StartSession` effect. Field names identical to the specification's. */
export interface SessionStart {
  /** Which phase's agent session to run. */
  phase: Phase;
  /** The round the session belongs to, 1 to 4. */
  round: number;
  /** The attempt of that phase this session is, 1 to 4. */
  attempt: number;
}

/**
 * Dependency: answers questions about the workspace (spec queries). Asked
 * only by `start`, at the moment the answer is needed; answers are never
 * cached and may differ from one run to the next.
 */
export interface PipelineWorkspace {
  /** Spec query `hasProductionCode`: whether the component already has production code. */
  hasProductionCode(): boolean;
  /** Spec query `boundaryChanged`: whether the component's boundary differs from the one the previous run worked from. */
  boundaryChanged(): boolean;
  /** Spec query `hasAdapter`: whether a test adapter for the component exists. */
  hasAdapter(): boolean;
}

/**
 * Dependency: told what the pipeline does to its environment (spec effects).
 * Each method is told synchronously from within the command method that
 * emits it, in the specification's order.
 */
export interface PipelineListener {
  /** Spec effect `StartSession`: run an agent session of this phase, round and attempt, check it, and answer with the matching `...Checked` method. */
  startSession(start: SessionStart): void;
  /** Spec effect `GradeCurrentCode`: grade the production code as it is, without an agent, in the given round (1 to 4), and answer with `currentCodeGraded`. */
  gradeCurrentCode(round: number): void;
  /** Spec effect `DiscardCode`: throw away the production code written so far (no payload). */
  discardCode(): void;
}

/**
 * Drives one reconciliation. Starts in `"IDLE"`. Each method performs one
 * specification command; calling a method in a state the command is not
 * listed for has unspecified behaviour.
 */
export class Pipeline {
  private readonly workspace: PipelineWorkspace;
  private readonly listener: PipelineListener;
  private current: PipelineState = "IDLE";
  private remembered: PipelineProgress = {
    round: 1,
    attempt: 1,
    maxAttempts: 1,
    maxRounds: 1,
    incremental: false,
  };

  /**
   * @param workspace asked about the workspace when `start` needs it.
   * @param listener receives every effect of the pipeline.
   */
  constructor(workspace: PipelineWorkspace, listener: PipelineListener) {
    this.workspace = workspace;
    this.listener = listener;
  }

  /** Current state of the pipeline (spec state names). */
  get state(): PipelineState {
    return this.current;
  }

  /** What the pipeline currently remembers (spec data); a copy. Meaningful only after `start`. */
  get progress(): PipelineProgress {
    return { ...this.remembered };
  }

  /**
   * Spec command `Start` (from `"IDLE"`): remembers the limits, asks the
   * workspace what plan applies, and either tells `startSession` for the
   * plan's phase or tells `gradeCurrentCode`; moves to the plan's state.
   */
  start(limits: PipelineLimits): void {
    const plan = planFor(this.askPlanFacts());
    this.remembered = {
      round: 1,
      attempt: 1,
      maxAttempts: limits.attemptsPerPhase,
      maxRounds: limits.rounds,
      incremental: plan.incremental,
    };
    if (plan.phase !== null) {
      this.listener.startSession({ phase: plan.phase, round: 1, attempt: 1 });
    } else {
      this.listener.gradeCurrentCode(1);
    }
    this.current = plan.next;
  }

  /**
   * Spec command `DesignChecked` (in `"DESIGN"`): answer to a design
   * session; `passed` is whether its check passed. May tell `discardCode`
   * and/or `startSession`, and may change the state.
   */
  designChecked(passed: boolean): void {
    if (!passed) {
      this.checkRejected("design");
      return;
    }
    this.remembered.attempt = 1;
    this.listener.startSession({ phase: "wiring", round: this.remembered.round, attempt: 1 });
    this.current = "WIRING";
  }

  /**
   * Spec command `WiringChecked` (in `"WIRING"`): answer to a wiring
   * session; `passed` is whether its check passed. May tell `discardCode`,
   * `startSession` or `gradeCurrentCode`, and may change the state.
   */
  wiringChecked(passed: boolean): void {
    if (!passed) {
      this.checkRejected("wiring");
      return;
    }
    this.remembered.attempt = 1;
    if (this.remembered.incremental) {
      this.listener.gradeCurrentCode(this.remembered.round);
      this.current = "GRADING";
    } else {
      this.listener.startSession({ phase: "implementation", round: this.remembered.round, attempt: 1 });
      this.current = "IMPLEMENTATION";
    }
  }

  /**
   * Spec command `ImplementationChecked` (in `"IMPLEMENTATION"`): answer to
   * an implementation session; `passed` is whether its check passed. May
   * tell `discardCode` and/or `startSession`, and may change the state.
   */
  implementationChecked(passed: boolean): void {
    if (!passed) {
      this.checkRejected("implementation");
      return;
    }
    this.current = "DONE";
  }

  /**
   * Spec command `CurrentCodeGraded` (in `"GRADING"`): answer to
   * `gradeCurrentCode`; `passed` is whether the current code passed. May
   * tell `startSession`, and changes the state.
   */
  currentCodeGraded(passed: boolean): void {
    if (passed) {
      this.current = "DONE";
      return;
    }
    this.listener.startSession({ phase: "implementation", round: this.remembered.round, attempt: 1 });
    this.current = "IMPLEMENTATION";
  }

  /** The workspace facts, each asked only when the plan reads it. */
  private askPlanFacts(): PlanFacts {
    const workspace = this.workspace;
    return {
      get hasProductionCode() {
        return workspace.hasProductionCode();
      },
      get boundaryChanged() {
        return workspace.boundaryChanged();
      },
      get hasAdapter() {
        return workspace.hasAdapter();
      },
    };
  }

  /** A rejected check: repeat the phase, else restart from design in a new round, else fail. */
  private checkRejected(phase: Phase): void {
    const progress = this.remembered;
    if (attemptsRemain(progress)) {
      const attempt = nextAttempt(progress);
      this.listener.startSession({ phase, round: progress.round, attempt });
      progress.attempt = attempt;
    } else if (roundsRemain(progress)) {
      const round = nextRound(progress);
      if (!progress.incremental) {
        this.listener.discardCode();
      }
      this.listener.startSession({ phase: "design", round, attempt: 1 });
      progress.attempt = 1;
      progress.round = round;
      this.current = "DESIGN";
    } else {
      this.current = "FAILED";
    }
  }
}

/** Facts about the workspace that the spec decision table `plan` is decided from (the answers of the spec queries). */
export interface PlanFacts {
  /** Answer of `PipelineWorkspace.hasProductionCode`. */
  hasProductionCode: boolean;
  /** Answer of `PipelineWorkspace.boundaryChanged`. */
  boundaryChanged: boolean;
  /** Answer of `PipelineWorkspace.hasAdapter`. */
  hasAdapter: boolean;
}

/** One row of the spec decision table `plan` (column names identical to the specification's). */
export interface Plan {
  /** The phase whose session `start` begins with, or `null` when `start` grades the current code instead. */
  phase: Phase | null;
  /** The state `start` moves to. */
  next: PipelineState;
  /** The value remembered as `PipelineProgress.incremental`. */
  incremental: boolean;
}

/** Pure decision: spec decision table `plan`, used by `start`. */
export function planFor(facts: PlanFacts): Plan {
  if (!facts.hasProductionCode) {
    return { phase: "design", next: "DESIGN", incremental: false };
  }
  if (facts.boundaryChanged) {
    return { phase: "design", next: "DESIGN", incremental: true };
  }
  if (!facts.hasAdapter) {
    return { phase: "wiring", next: "WIRING", incremental: true };
  }
  return { phase: null, next: "GRADING", incremental: true };
}

/** Pure calculation: spec calculation `nextAttempt`, from what is remembered. */
export function nextAttempt(progress: PipelineProgress): number {
  return progress.attempt + 1;
}

/** Pure calculation: spec calculation `nextRound`, from what is remembered. */
export function nextRound(progress: PipelineProgress): number {
  return progress.round + 1;
}

/** Pure condition: spec condition "Attempts remain in this phase", from what is remembered. */
export function attemptsRemain(progress: PipelineProgress): boolean {
  return progress.attempt < progress.maxAttempts;
}

/** Pure condition: spec condition "Rounds remain", from what is remembered. */
export function roundsRemain(progress: PipelineProgress): boolean {
  return progress.round < progress.maxRounds;
}
