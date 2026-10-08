/**
 * The pipeline itself: a state machine that is driven by commands, remembers its progress, and talks to
 * its dependencies.
 */

import { decideAfterCheck, decideAfterGrading, decideStart } from "./decisions.ts";
import type { Step } from "./decisions.ts";
import type { PipelineDependencies } from "./ports.ts";
import type { PipelineState, Progress, RunLimits, WorkspaceFacts } from "./types.ts";

/**
 * Drives the production of one component's code.
 *
 * Usage:
 *
 * 1. Construct it with its dependencies. A new pipeline is in state `IDLE` and remembers nothing.
 * 2. Call `start` once.
 * 3. Each time a dependency finishes the work the pipeline launched, report the result with the matching
 *    method: `designChecked`, `wiringChecked`, `implementationChecked` or `currentCodeGraded`.
 * 4. Read `state` and `progress` at any time to see where the run stands.
 *
 * Every command method is synchronous and returns nothing; whatever it tells the dependencies has been
 * told by the time it returns, in the order the specification lists the effects. Each command applies only
 * in the state named in its comment; calling it in any other state is a usage error with unspecified
 * behaviour.
 */
export class Pipeline {
  private readonly dependencies: PipelineDependencies;

  /**
   * The current state. Deliberately not assigned in the skeleton: whoever writes the bodies gives it its
   * starting value (an initialiser may be added to this declaration).
   */
  private currentState: PipelineState = "IDLE";

  /** The remembered data; absent until the pipeline has been started. */
  private currentProgress: Progress | null = null;

  /**
   * @param dependencies the workspace that is asked about the existing code and told to discard it, the
   *   launcher that is told to start sessions, and the grader that is told to grade the current code.
   */
  constructor(dependencies: PipelineDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * The current state, under the specification's own state names (see `PipelineState` for what each one
   * means). Reading it has no side effect.
   */
  get state(): PipelineState {
    return this.currentState;
  }

  /**
   * The data remembered between commands (the specification's `data`; see `Progress` for the fields), or
   * `null` while nothing has been remembered yet, that is, before `start`. Reading it has no side effect.
   */
  get progress(): Progress | null {
    return this.currentProgress;
  }

  /**
   * Specification command `Start`. Applies in state `IDLE`.
   *
   * Asks the workspace about the existing code, remembers the limits, and launches the first piece of
   * work.
   *
   * @param limits `limits.rounds` is the command's `rounds` input and `limits.attemptsPerPhase` is its
   *   `attemptsPerPhase` input.
   */
  start(limits: RunLimits): void {
    const workspace = this.dependencies.workspace;
    const facts: WorkspaceFacts = {
      hasProductionCode: workspace.hasProductionCode(),
      boundaryChanged: workspace.boundaryChangedSincePreviousRun(),
      hasAdapter: workspace.hasAdapter(),
    };
    this.carryOut(decideStart(limits, facts));
  }

  /**
   * Specification command `DesignChecked`. Applies in state `DESIGN`.
   *
   * Reports the check result of the design session that was last started.
   *
   * @param passed the command's `passed` input: `true` when the check passed, `false` when it was
   *   rejected.
   */
  designChecked(passed: boolean): void {
    this.carryOut(decideAfterCheck("design", passed, this.remembered()));
  }

  /**
   * Specification command `WiringChecked`. Applies in state `WIRING`.
   *
   * Reports the check result of the wiring session that was last started.
   *
   * @param passed the command's `passed` input: `true` when the check passed, `false` when it was
   *   rejected.
   */
  wiringChecked(passed: boolean): void {
    this.carryOut(decideAfterCheck("wiring", passed, this.remembered()));
  }

  /**
   * Specification command `ImplementationChecked`. Applies in state `IMPLEMENTATION`.
   *
   * Reports the check result of the implementation session that was last started.
   *
   * @param passed the command's `passed` input: `true` when the check passed, `false` when it was
   *   rejected.
   */
  implementationChecked(passed: boolean): void {
    this.carryOut(decideAfterCheck("implementation", passed, this.remembered()));
  }

  /**
   * Specification command `CurrentCodeGraded`. Applies in state `GRADING`.
   *
   * Reports the result of the grading that was last requested from the grader.
   *
   * @param passed the command's `passed` input: `true` when the grading passed, `false` otherwise.
   */
  currentCodeGraded(passed: boolean): void {
    this.carryOut(decideAfterGrading(passed, this.remembered()));
  }

  /** The remembered data, for the commands that apply only after `start`. */
  private remembered(): Progress {
    if (this.currentProgress === null) {
      throw new Error("the pipeline has not been started");
    }
    return this.currentProgress;
  }

  /** Tells the dependencies what `step` asks for, then moves to its state and remembers its data. */
  private carryOut(step: Step): void {
    if (step.discardCode) {
      this.dependencies.workspace.discardCode();
    }
    if (step.startSession !== null) {
      this.dependencies.sessions.startSession(step.startSession);
    }
    if (step.gradeRound !== null) {
      this.dependencies.grader.gradeCurrentCode(step.gradeRound);
    }
    this.currentState = step.state;
    this.currentProgress = step.progress;
  }
}
