import { afterRejection, nextAttempt, nextRound, planRun } from "./plan.ts";
import type { Grader, Phase, PipelineLimits, PipelineState, SessionLauncher, Workspace } from "./types.ts";

/**
 * Reconciles one component with its specification, phase by phase. It is driven from outside: `start`
 * once, then one call per finished check (`designChecked`, `wiringChecked`, `implementationChecked`) or
 * finished grading (`currentCodeGraded`), each reporting the verdict of the work the pipeline asked for
 * last.
 *
 * One instance is one run. A new instance starts in the specification's initial state with nothing
 * remembered. Each method below performs one command of the specification; a command returns nothing, and
 * its outcome is observed through `state`, the data getters, and the calls made on the dependencies. Calls
 * on the dependencies are made synchronously, in the order the specification lists the effects.
 */
export class Pipeline {
  private readonly workspace: Workspace;
  private readonly sessions: SessionLauncher;
  private readonly grader: Grader;
  private currentState: PipelineState = "idle";
  private currentRound: number | undefined = undefined;
  private currentAttempt: number | undefined = undefined;
  private currentIncremental: boolean | undefined = undefined;
  private attemptLimit: number | undefined = undefined;
  private roundLimit: number | undefined = undefined;

  /**
   * @param workspace answers the queries `hasProductionCode`, `boundaryChanged` and `hasAdapter`, and
   *   receives the effect `DiscardCode`
   * @param sessions receives the effect `StartSession`
   * @param grader receives the effect `GradeCurrentCode`
   */
  constructor(workspace: Workspace, sessions: SessionLauncher, grader: Grader) {
    this.workspace = workspace;
    this.sessions = sessions;
    this.grader = grader;
  }

  /** The current state. `PipelineState` lists the specification name of each value. */
  get state(): PipelineState {
    return this.currentState;
  }

  /** The specification's `data.round`; `undefined` until a command has stored it. */
  get round(): number | undefined {
    return this.currentRound;
  }

  /** The specification's `data.attempt`; `undefined` until a command has stored it. */
  get attempt(): number | undefined {
    return this.currentAttempt;
  }

  /** The specification's `data.incremental`; `undefined` until a command has stored it. */
  get incremental(): boolean | undefined {
    return this.currentIncremental;
  }

  /** The specification's `data.maxAttempts`; `undefined` until a command has stored it. */
  get maxAttempts(): number | undefined {
    return this.attemptLimit;
  }

  /** The specification's `data.maxRounds`; `undefined` until a command has stored it. */
  get maxRounds(): number | undefined {
    return this.roundLimit;
  }

  /**
   * Performs the command `Start`.
   *
   * @param limits the command's input; `PipelineLimits` documents how it maps to the command's
   *   `attemptsPerPhase` and `rounds`
   */
  start(limits: PipelineLimits): void {
    const plan = planRun({
      hasProductionCode: this.workspace.hasProductionCode(),
      boundaryChanged: this.workspace.boundaryChanged(),
      hasAdapter: this.workspace.hasAdapter(),
    });
    this.currentRound = 1;
    this.currentIncremental = plan.incremental;
    this.attemptLimit = limits.attemptsPerPhase;
    this.roundLimit = limits.rounds;
    if (plan.phase === undefined) {
      this.gradeCurrentCode();
    } else {
      this.enterPhase(plan.phase);
    }
  }

  /**
   * Performs the command `DesignChecked`.
   *
   * @param passed the command's `passed`
   */
  designChecked(passed: boolean): void {
    if (passed) {
      this.enterPhase("wiring");
    } else {
      this.rejected("design");
    }
  }

  /**
   * Performs the command `WiringChecked`.
   *
   * @param passed the command's `passed`
   */
  wiringChecked(passed: boolean): void {
    if (!passed) {
      this.rejected("wiring");
    } else if (this.currentIncremental) {
      this.gradeCurrentCode();
    } else {
      this.enterPhase("implementation");
    }
  }

  /**
   * Performs the command `CurrentCodeGraded`.
   *
   * @param passed the command's `passed`
   */
  currentCodeGraded(passed: boolean): void {
    if (passed) {
      this.currentState = "done";
    } else {
      this.enterPhase("implementation");
    }
  }

  /**
   * Performs the command `ImplementationChecked`.
   *
   * @param passed the command's `passed`
   */
  implementationChecked(passed: boolean): void {
    if (passed) {
      this.currentState = "done";
    } else {
      this.rejected("implementation");
    }
  }

  /** Moves to `phase` and starts its first session in the current round. */
  private enterPhase(phase: Phase): void {
    this.currentAttempt = 1;
    this.currentState = phase;
    this.sessions.startSession(phase, this.currentRound!, this.currentAttempt);
  }

  /** Moves to grading and has the code graded as it is, in the current round. */
  private gradeCurrentCode(): void {
    this.currentAttempt = 1;
    this.currentState = "grading";
    this.grader.gradeCurrentCode(this.currentRound!);
  }

  /** Applies the outcome of a rejected check of `phase`. */
  private rejected(phase: Phase): void {
    const outcome = afterRejection({
      attempt: this.currentAttempt!,
      maxAttempts: this.attemptLimit!,
      round: this.currentRound!,
      maxRounds: this.roundLimit!,
    });
    if (outcome === "retry-phase") {
      this.currentAttempt = nextAttempt(this.currentAttempt!);
      this.sessions.startSession(phase, this.currentRound!, this.currentAttempt);
    } else if (outcome === "new-round") {
      this.currentRound = nextRound(this.currentRound!);
      if (!this.currentIncremental) {
        this.workspace.discardCode();
      }
      this.enterPhase("design");
    } else {
      this.currentState = "failed";
    }
  }
}
