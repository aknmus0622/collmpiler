/**
 * Reconciles one component with its specification, phase by phase: each phase is
 * an agent session followed by a check.
 *
 * Nothing here does the work itself. The pipeline looks at what the output
 * directory holds when it starts, tells its driver what to do next, and the driver
 * does it and reports the result by calling the matching command of the pipeline.
 * The whole conversation is therefore: call a command of `Pipeline`, see which
 * `PipelineDriver` methods it called and in what order, read `status()`, and call
 * the next command.
 *
 * It corresponds to the specification's component `pipeline`; `OutputDirectory`
 * corresponds to its external component `output` and `PipelineDriver` to its
 * external component `pipeline-driver`. It keeps nothing across a restart: a new
 * instance starts over.
 */

import type { SessionPhase } from "./gate-rules.ts";

/**
 * Where the pipeline stands. Specification name: state field `status`; the values
 * are the specification's own.
 *
 * - `"IDLE"`: nothing has started yet.
 * - `"DESIGN"`: a design session is under way; its check is reported through
 *   `Pipeline.designChecked`.
 * - `"WIRING"`: a wiring session is under way; its check is reported through
 *   `Pipeline.wiringChecked`.
 * - `"GRADING"`: the current code is being graded; the grade is reported through
 *   `Pipeline.currentCodeGraded`.
 * - `"IMPLEMENTATION"`: an implementation session is under way; its check is
 *   reported through `Pipeline.implementationChecked`.
 * - `"DONE"`: the pipeline is over and the component is reconciled.
 * - `"FAILED"`: the pipeline is over and has given up.
 */
export type PipelineStatus =
  | "IDLE"
  | "DESIGN"
  | "WIRING"
  | "GRADING"
  | "IMPLEMENTATION"
  | "DONE"
  | "FAILED";

/**
 * The numbers and the plan the pipeline runs with, and how far it has got. The
 * field names are those of the specification's state field `memory`.
 */
export interface PipelineMemory {
  /** The number of the running attempt within its phase (`attempt`). */
  attempt: number;
  /** How many attempts each phase may take (`attemptsPerPhase`). */
  attemptsPerPhase: number;
  /** Whether the plan is to change existing code rather than write it from nothing (`incremental`). */
  incremental: boolean;
  /** The number of the running round (`round`). */
  round: number;
  /** How many rounds the pipeline may take (`rounds`). */
  rounds: number;
}

/**
 * Everything the pipeline remembers, one field per state field of the
 * specification, under the same names.
 */
export interface PipelineState {
  /** The limits, the plan's kind, the round and the attempt (`memory`). */
  memory: PipelineMemory;
  /** Where the pipeline stands (`status`). */
  status: PipelineStatus;
}

/**
 * The numbers the pipeline runs with. The field names are the parameter names of
 * the specification's command `Start`.
 */
export interface PipelineLimits {
  /** How many attempts each phase may take (specification parameter `attemptsPerPhase`). */
  attemptsPerPhase: number;
  /** How many rounds the pipeline may take (specification parameter `rounds`). */
  rounds: number;
}

/**
 * The session to start. The field names are the parameter names of the
 * specification's driver command `StartSession`.
 */
export interface PipelineSessionRequest {
  /** The number of the attempt within its phase (specification parameter `attempt`). */
  attempt: number;
  /** The phase of the session (specification parameter `phase`). */
  phase: SessionPhase;
  /** The number of the round (specification parameter `round`). */
  round: number;
}

/**
 * What the output directory holds, as one snapshot. The field names are the
 * specification's queries of `output`, in lower camel case.
 */
export interface OutputFacts {
  /** Whether the boundary differs from the previous run (specification query `BoundaryChanged`). */
  boundaryChanged: boolean;
  /** Whether there is an adapter (specification query `HasAdapter`). */
  hasAdapter: boolean;
  /** Whether there is production code (specification query `HasProductionCode`). */
  hasProductionCode: boolean;
}

/**
 * Where the pipeline starts. Specification name: the result of the decision table
 * `plan`, with the same field names.
 */
export interface PipelinePlan {
  /** Whether existing code is being changed, to be remembered in `PipelineMemory.incremental`. */
  incremental: boolean;
  /** The status the pipeline takes when it starts. */
  next: "DESIGN" | "WIRING" | "GRADING";
  /** The phase of the first session; `null` when the plan has no session to start. */
  phase: "design" | "wiring" | null;
}

/**
 * What the pipeline asks about the output directory; it corresponds to the
 * specification's external component `output`, with one method per query under the
 * same name in lower camel case.
 *
 * The methods only answer and cannot fail. They are asked only from inside
 * `Pipeline.start`, in any order and possibly more than once, so a stand-in should
 * answer every one of them, and the same way throughout that call.
 */
export interface OutputDirectory {
  /** Whether the boundary differs from the previous run (specification query `BoundaryChanged`). */
  boundaryChanged(): boolean;
  /** Whether the output directory holds an adapter (specification query `HasAdapter`). */
  hasAdapter(): boolean;
  /** Whether the output directory holds production code (specification query `HasProductionCode`). */
  hasProductionCode(): boolean;
}

/**
 * What the pipeline needs done in the outside world; it corresponds to the
 * specification's external component `pipeline-driver`, with one method per command
 * under the same name in lower camel case.
 *
 * Within one pipeline command the methods are called in the specification's order,
 * so order matters and a stand-in should record it. None of them answers: each
 * returns nothing, and the driver reports back by calling a command of `Pipeline`
 * after the pipeline's command has returned, never from inside one of these methods.
 */
export interface PipelineDriver {
  /** Discards the code written so far (specification command `DiscardCode`). */
  discardCode(): void;
  /**
   * Grades the current code (specification command `GradeCurrentCode`); the driver
   * reports through `Pipeline.currentCodeGraded`.
   *
   * @param round the number of the round (specification parameter `round`).
   */
  gradeCurrentCode(round: number): void;
  /**
   * Starts a session (specification command `StartSession`); the driver reports
   * through the command of `Pipeline` that belongs to the session's phase:
   * `designChecked`, `wiringChecked` or `implementationChecked`.
   *
   * @param request which attempt of which phase, in which round.
   */
  startSession(request: PipelineSessionRequest): void;
}

/**
 * Decides where the pipeline starts (specification decision table `plan`). A pure
 * function: it looks at nothing but its argument.
 *
 * @param facts what the output directory holds.
 * @returns the plan.
 */
export function decidePlan(facts: OutputFacts): PipelinePlan {
  if (!facts.hasProductionCode) {
    return { incremental: false, next: "DESIGN", phase: "design" };
  }
  if (facts.boundaryChanged) {
    return { incremental: true, next: "DESIGN", phase: "design" };
  }
  if (!facts.hasAdapter) {
    return { incremental: true, next: "WIRING", phase: "wiring" };
  }
  return { incremental: true, next: "GRADING", phase: null };
}

/** What a rejected check leads to: the state to take and what to ask of the driver. */
interface RejectionOutcome {
  /** The state the pipeline takes. */
  state: PipelineState;
  /** Whether the code written so far is thrown away. */
  discardCode: boolean;
  /** The session to start; `null` when the pipeline gives up. */
  session: PipelineSessionRequest | null;
}

/**
 * Decides what follows a rejected check: the phase is repeated while it has attempts
 * left, then the pipeline restarts from design while it has rounds left, then it
 * gives up. Only code written from nothing is discarded on a restart.
 *
 * @param state the state before the rejection.
 * @param phase the phase whose check rejected it.
 * @returns what the rejection leads to.
 */
function decideRejection(state: PipelineState, phase: SessionPhase): RejectionOutcome {
  const { memory } = state;
  if (memory.attempt < memory.attemptsPerPhase) {
    const attempt = memory.attempt + 1;
    return {
      state: { memory: { ...memory, attempt }, status: state.status },
      discardCode: false,
      session: { attempt, phase, round: memory.round },
    };
  }
  if (memory.round < memory.rounds) {
    const round = memory.round + 1;
    return {
      state: { memory: { ...memory, attempt: 1, round }, status: "DESIGN" },
      discardCode: !memory.incremental,
      session: { attempt: 1, phase: "design", round },
    };
  }
  return { state: { memory, status: "FAILED" }, discardCode: false, session: null };
}

/**
 * One run of the pipeline for one component. Create one with
 * `new Pipeline(output, driver)`; it starts in the specification's initial state.
 *
 * Each method other than `status` and `state` performs one command of the
 * specification. A command's `requires` limits when it may be called and with what;
 * other calls are never made. Each returns nothing: what the command leads to is
 * seen in the calls on the driver and in `status()`.
 */
export class Pipeline {
  private readonly output: OutputDirectory;
  private readonly driver: PipelineDriver;
  private current: PipelineState = {
    memory: { attempt: 0, attemptsPerPhase: 0, incremental: false, round: 0, rounds: 0 },
    status: "IDLE",
  };

  /**
   * @param output asked what the output directory holds when the pipeline starts.
   * @param driver told what to do next, for as long as the pipeline lives.
   */
  constructor(output: OutputDirectory, driver: PipelineDriver) {
    this.output = output;
    this.driver = driver;
  }

  /**
   * Answers the specification's query `Status`. It only reads, and may be called at
   * any point.
   *
   * @returns where the pipeline stands.
   */
  status(): PipelineStatus {
    return this.current.status;
  }

  /**
   * Reads what the pipeline remembers. It only reads, and may be called at any point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): PipelineState {
    return { memory: { ...this.current.memory }, status: this.current.status };
  }

  /**
   * Performs the specification's command `Start`: the pipeline starts. This is the
   * one command that asks the output directory.
   *
   * @param limits the numbers to run with.
   */
  start(limits: PipelineLimits): void {
    const plan = decidePlan({
      boundaryChanged: this.output.boundaryChanged(),
      hasAdapter: this.output.hasAdapter(),
      hasProductionCode: this.output.hasProductionCode(),
    });
    this.current = {
      memory: {
        attempt: 1,
        attemptsPerPhase: limits.attemptsPerPhase,
        incremental: plan.incremental,
        round: 1,
        rounds: limits.rounds,
      },
      status: plan.next,
    };
    if (plan.phase === null) {
      this.driver.gradeCurrentCode(1);
    } else {
      this.driver.startSession({ attempt: 1, phase: plan.phase, round: 1 });
    }
  }

  /**
   * Performs the specification's command `DesignChecked`: the driver's answer to a
   * session of phase `"design"`, once its check is over.
   *
   * @param passed whether the check passed the phase (specification parameter `passed`).
   */
  designChecked(passed: boolean): void {
    if (passed) {
      this.enterPhase("WIRING", "wiring");
    } else {
      this.reject("design");
    }
  }

  /**
   * Performs the specification's command `WiringChecked`: the driver's answer to a
   * session of phase `"wiring"`, once its check is over.
   *
   * @param passed whether the check passed the phase (specification parameter `passed`).
   */
  wiringChecked(passed: boolean): void {
    if (!passed) {
      this.reject("wiring");
    } else if (this.current.memory.incremental) {
      this.current = { memory: { ...this.current.memory, attempt: 1 }, status: "GRADING" };
      this.driver.gradeCurrentCode(this.current.memory.round);
    } else {
      this.enterPhase("IMPLEMENTATION", "implementation");
    }
  }

  /**
   * Performs the specification's command `ImplementationChecked`: the driver's
   * answer to a session of phase `"implementation"`, once its check is over.
   *
   * @param passed whether the check passed the phase (specification parameter `passed`).
   */
  implementationChecked(passed: boolean): void {
    if (passed) {
      this.current = { ...this.current, status: "DONE" };
    } else {
      this.reject("implementation");
    }
  }

  /**
   * Performs the specification's command `CurrentCodeGraded`: the driver's answer
   * to `gradeCurrentCode`.
   *
   * @param passed whether the current code passed (specification parameter `passed`).
   */
  currentCodeGraded(passed: boolean): void {
    if (passed) {
      this.current = { ...this.current, status: "DONE" };
    } else {
      this.enterPhase("IMPLEMENTATION", "implementation");
    }
  }

  /** Moves on to the first attempt of a phase, within the running round. */
  private enterPhase(status: PipelineStatus, phase: SessionPhase): void {
    const { round } = this.current.memory;
    this.current = { memory: { ...this.current.memory, attempt: 1 }, status };
    this.driver.startSession({ attempt: 1, phase, round });
  }

  /** Carries out what a rejected check of the phase leads to. */
  private reject(phase: SessionPhase): void {
    const outcome = decideRejection(this.current, phase);
    this.current = outcome.state;
    if (outcome.discardCode) {
      this.driver.discardCode();
    }
    if (outcome.session !== null) {
      this.driver.startSession(outcome.session);
    }
  }
}
