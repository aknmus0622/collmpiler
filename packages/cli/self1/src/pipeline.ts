/**
 * Pipeline: reconciles one component with its specification in up to three
 * phases (design, wiring, implementation). Each phase is an agent session that
 * the driver runs, followed by a check whose result comes back as a command.
 *
 * Corresponds to the specification component `pipeline`. Nothing it keeps is
 * durable, and it serves no HTTP routes. Its state is {@link PipelineState}; it
 * relies on two dependencies:
 *
 * - the output directory ({@link OutputDirectory}, specification component
 *   `output`), asked what it holds when the pipeline starts;
 * - the driver ({@link PipelineDriver}, specification component
 *   `pipeline-driver`), told which session to start, to grade the current code,
 *   or to discard the code.
 *
 * Each specification command is a pure step function (`*Step`) that takes the
 * state before the command and answers the state after it together with the
 * calls to make on the driver, in order ({@link PipelineStep}). The decision of
 * where the pipeline starts is the pure function {@link pipelinePlan}.
 * {@link Pipeline} keeps the state, asks the output directory, runs those
 * functions and makes the calls on its driver.
 *
 * Use: `start` once with the two limits; then, each time the driver has finished
 * what it was asked for, send the matching command (`designChecked`,
 * `wiringChecked`, `implementationChecked` after a session's check,
 * `currentCodeGraded` after grading) until the status is `"DONE"` or `"FAILED"`.
 * Commands are only sent in the status stated for each method; other inputs are
 * never sent and need no handling.
 */

import type { Phase } from "./gate-rules.ts";

export type { Phase };

/**
 * Where the pipeline is (specification state field `status`, also the answer of
 * the query `Status`). The names are the specification's.
 *
 * - `"IDLE"`: not started yet; `start` comes next.
 * - `"DESIGN"`: a design session has been started; `designChecked` comes next.
 * - `"WIRING"`: a wiring session has been started; `wiringChecked` comes next.
 * - `"GRADING"`: the driver was told to grade the current code;
 *   `currentCodeGraded` comes next.
 * - `"IMPLEMENTATION"`: an implementation session has been started;
 *   `implementationChecked` comes next.
 * - `"DONE"`: finished successfully; no command comes any more.
 * - `"FAILED"`: gave up; no command comes any more.
 */
export type PipelineStatus = "IDLE" | "DESIGN" | "WIRING" | "GRADING" | "IMPLEMENTATION" | "DONE" | "FAILED";

/**
 * The limits and counters the pipeline remembers (specification state field
 * `memory`). Each field has the name of the specification record field it holds.
 */
export interface PipelineMemory {
  /** The number of the current attempt within the current phase, from 1 (field `attempt`). */
  readonly attempt: number;
  /** The limit of attempts per phase given to `start` (field `attemptsPerPhase`). */
  readonly attemptsPerPhase: number;
  /**
   * Whether the plan changes existing production code rather than writing it from
   * nothing (field `incremental`).
   */
  readonly incremental: boolean;
  /** The number of the current round, from 1 (field `round`). */
  readonly round: number;
  /** The limit of rounds given to `start` (field `rounds`). */
  readonly rounds: number;
}

/**
 * Everything the pipeline remembers (the specification's `state`). Each field has
 * the name of the specification state field it holds.
 */
export interface PipelineState {
  /** The limits and counters (state `memory`). */
  readonly memory: PipelineMemory;
  /** Where the pipeline is (state `status`). */
  readonly status: PipelineStatus;
}

/** The state the pipeline starts from (the specification's `init`). */
export function initialPipelineState(): PipelineState {
  return {
    memory: { attempt: 0, attemptsPerPhase: 0, incremental: false, round: 0, rounds: 0 },
    status: "IDLE",
  };
}

/** The limits given to `start` (parameters of specification `Start`). */
export interface PipelineLimits {
  /** How many attempts each phase may take (specification parameter `attemptsPerPhase`). */
  readonly attemptsPerPhase: number;
  /** How many rounds the pipeline may take (specification parameter `rounds`). */
  readonly rounds: number;
}

/**
 * What the output directory holds, as far as the plan needs it: the answers of
 * the three {@link OutputDirectory} queries, gathered into one record.
 */
export interface OutputFacts {
  /** Whether there is production code (specification query `output.HasProductionCode`). */
  readonly hasProductionCode: boolean;
  /**
   * Whether the boundary of the production code differs from the previous run
   * (specification query `output.BoundaryChanged`).
   */
  readonly boundaryChanged: boolean;
  /** Whether there is an adapter to a test harness (specification query `output.HasAdapter`). */
  readonly hasAdapter: boolean;
}

/** The answer of the decision table `plan`: where the pipeline starts. */
export interface PipelinePlan {
  /** Whether the plan changes existing production code (result field `incremental`). */
  readonly incremental: boolean;
  /** The status the pipeline enters when it starts (result field `next`). */
  readonly next: "DESIGN" | "WIRING" | "GRADING";
  /**
   * The phase of the first session to start, or `null` when no session is
   * started and the current code is graded instead (result field `phase`).
   */
  readonly phase: "design" | "wiring" | null;
}

/**
 * Specification decision table `plan`. Pure.
 *
 * @param facts what the output directory holds (the specification asks the
 *              `output` queries; here their answers are passed in).
 */
export function pipelinePlan(facts: OutputFacts): PipelinePlan {
  if (!facts.hasProductionCode) return { incremental: false, next: "DESIGN", phase: "design" };
  if (facts.boundaryChanged) return { incremental: true, next: "DESIGN", phase: "design" };
  if (!facts.hasAdapter) return { incremental: true, next: "WIRING", phase: "wiring" };
  return { incremental: true, next: "GRADING", phase: null };
}

/**
 * The output directory (specification component `output`, external). Asked what
 * it holds; the pipeline asks only while performing `start`.
 */
export interface OutputDirectory {
  /** Whether there is production code (specification query `HasProductionCode`). */
  hasProductionCode(): boolean;
  /** Whether the boundary of the production code differs from the previous run (specification query `BoundaryChanged`). */
  boundaryChanged(): boolean;
  /** Whether there is an adapter to a test harness (specification query `HasAdapter`). */
  hasAdapter(): boolean;
}

/** Reads the three answers of the output directory into one record. */
export function readOutputFacts(output: OutputDirectory): OutputFacts {
  return {
    hasProductionCode: output.hasProductionCode(),
    boundaryChanged: output.boundaryChanged(),
    hasAdapter: output.hasAdapter(),
  };
}

/**
 * The driver (specification component `pipeline-driver`, external): runs what the
 * pipeline asks for. Each method is one of its specification commands; the
 * pipeline calls them, in order, during one of its own commands. None of them
 * answers anything; the result comes back later as a command on {@link Pipeline}.
 */
export interface PipelineDriver {
  /**
   * Starts an agent session (specification `StartSession`). Its check comes back
   * as `designChecked`, `wiringChecked` or `implementationChecked`, by phase.
   *
   * @param round   the round the session belongs to (specification parameter `round`).
   * @param attempt the attempt within the phase (specification parameter `attempt`).
   * @param phase   which phase the session is for (specification parameter `phase`).
   */
  startSession(round: number, attempt: number, phase: Phase): void;
  /**
   * Grades the current code without a session (specification `GradeCurrentCode`).
   * The grade comes back as `currentCodeGraded`.
   *
   * @param round the round the grading belongs to (specification parameter `round`).
   */
  gradeCurrentCode(round: number): void;
  /** Discards the production code written so far (specification `DiscardCode`). */
  discardCode(): void;
}

/**
 * One call the pipeline makes on its driver: `call` names the
 * {@link PipelineDriver} method, the other fields are its arguments.
 */
export type DriverCall =
  | { readonly call: "startSession"; readonly round: number; readonly attempt: number; readonly phase: Phase }
  | { readonly call: "gradeCurrentCode"; readonly round: number }
  | { readonly call: "discardCode" };

/** Makes one call on the driver. */
export function callDriver(driver: PipelineDriver, call: DriverCall): void {
  switch (call.call) {
    case "startSession":
      driver.startSession(call.round, call.attempt, call.phase);
      return;
    case "gradeCurrentCode":
      driver.gradeCurrentCode(call.round);
      return;
    case "discardCode":
      driver.discardCode();
      return;
  }
}

/** The result of a step function: the state after the command and the calls to make on the driver, in order. */
export interface PipelineStep {
  readonly state: PipelineState;
  readonly calls: readonly DriverCall[];
}

// ---------------------------------------------------------------------------
// Step functions: one per specification command, pure

/**
 * Specification command `Start`: the pipeline starts. Sent only in status
 * `"IDLE"`, with each limit from 1 to 3.
 *
 * @param limits the two limits (specification parameters `attemptsPerPhase` and `rounds`).
 * @param facts  what the output directory holds now (answers of the `output` queries).
 */
export function startStep(state: PipelineState, limits: PipelineLimits, facts: OutputFacts): PipelineStep {
  const plan = pipelinePlan(facts);
  const memory: PipelineMemory = {
    attempt: 1,
    attemptsPerPhase: limits.attemptsPerPhase,
    incremental: plan.incremental,
    round: 1,
    rounds: limits.rounds,
  };
  const calls: DriverCall[] =
    plan.phase === null
      ? [{ call: "gradeCurrentCode", round: 1 }]
      : [{ call: "startSession", round: 1, attempt: 1, phase: plan.phase }];
  return { state: { ...state, memory, status: plan.next }, calls };
}

/**
 * Specification command `DesignChecked`: the check of a design session finished.
 * Sent only in status `"DESIGN"`.
 *
 * @param passed whether the check accepted the session (specification parameter `passed`).
 */
export function designCheckedStep(state: PipelineState, passed: boolean): PipelineStep {
  if (passed) return enterPhase(state, "WIRING", "wiring");
  return rejected(state, "design");
}

/**
 * Specification command `WiringChecked`: the check of a wiring session finished.
 * Sent only in status `"WIRING"`.
 *
 * @param passed whether the check accepted the session (specification parameter `passed`).
 */
export function wiringCheckedStep(state: PipelineState, passed: boolean): PipelineStep {
  if (!passed) return rejected(state, "wiring");
  if (state.memory.incremental) {
    return {
      state: { ...state, memory: { ...state.memory, attempt: 1 }, status: "GRADING" },
      calls: [{ call: "gradeCurrentCode", round: state.memory.round }],
    };
  }
  return enterPhase(state, "IMPLEMENTATION", "implementation");
}

/**
 * Specification command `ImplementationChecked`: the check of an implementation
 * session finished. Sent only in status `"IMPLEMENTATION"`.
 *
 * @param passed whether the check accepted the session (specification parameter `passed`).
 */
export function implementationCheckedStep(state: PipelineState, passed: boolean): PipelineStep {
  if (passed) return { state: { ...state, status: "DONE" }, calls: [] };
  return rejected(state, "implementation");
}

/**
 * Specification command `CurrentCodeGraded`: grading the current code finished.
 * Sent only in status `"GRADING"`.
 *
 * @param passed whether the current code passed (specification parameter `passed`).
 */
export function currentCodeGradedStep(state: PipelineState, passed: boolean): PipelineStep {
  if (passed) return { state: { ...state, status: "DONE" }, calls: [] };
  return enterPhase(state, "IMPLEMENTATION", "implementation");
}

/** Enters a phase with its first attempt in the current round and starts its session. */
function enterPhase(state: PipelineState, status: PipelineStatus, phase: Phase): PipelineStep {
  const memory = { ...state.memory, attempt: 1 };
  return {
    state: { ...state, memory, status },
    calls: [{ call: "startSession", round: memory.round, attempt: 1, phase }],
  };
}

/**
 * A phase's check rejected its session: the phase repeats while attempts remain;
 * otherwise a new round restarts from design (discarding the code unless the plan
 * is incremental) while rounds remain; otherwise the pipeline fails.
 */
function rejected(state: PipelineState, phase: Phase): PipelineStep {
  const { memory } = state;
  if (memory.attempt < memory.attemptsPerPhase) {
    const attempt = memory.attempt + 1;
    return {
      state: { ...state, memory: { ...memory, attempt } },
      calls: [{ call: "startSession", round: memory.round, attempt, phase }],
    };
  }
  if (memory.round < memory.rounds) {
    const round = memory.round + 1;
    const calls: DriverCall[] = memory.incremental ? [] : [{ call: "discardCode" }];
    calls.push({ call: "startSession", round, attempt: 1, phase: "design" });
    return { state: { ...state, memory: { ...memory, attempt: 1, round }, status: "DESIGN" }, calls };
  }
  return { state: { ...state, status: "FAILED" }, calls: [] };
}

// ---------------------------------------------------------------------------
// The component

/**
 * The pipeline for one component. It starts in the initial state, keeps its
 * state between commands, and makes its calls on the driver synchronously, in
 * order, before the command method returns. No command answers anything; read
 * {@link Pipeline.status} (specification query `Status`) or
 * {@link Pipeline.state} to see where it is.
 */
export class Pipeline {
  private readonly output: OutputDirectory;
  private readonly driver: PipelineDriver;
  private current: PipelineState = initialPipelineState();

  /**
   * @param output the output directory, asked what it holds during `start` (specification `output`).
   * @param driver the driver told to start sessions, grade or discard code (specification `pipeline-driver`).
   */
  constructor(output: OutputDirectory, driver: PipelineDriver) {
    this.output = output;
    this.driver = driver;
  }

  /** The current state (all specification state fields, with the same names). */
  get state(): PipelineState {
    return this.current;
  }

  /** Where the pipeline is (specification query `Status`). */
  status(): PipelineStatus {
    return this.current.status;
  }

  /**
   * Starts the pipeline (specification `Start`). Sent only in status `"IDLE"`,
   * with each limit from 1 to 3. The output directory is asked what it holds;
   * the driver is then told to start a session (`startSession`) or to grade the
   * current code (`gradeCurrentCode`).
   *
   * @param limits the limit of attempts per phase and the limit of rounds
   *               (specification parameters `attemptsPerPhase` and `rounds`).
   */
  start(limits: PipelineLimits): void {
    this.apply(startStep(this.current, limits, readOutputFacts(this.output)));
  }

  /**
   * The check of a design session finished (specification `DesignChecked`). Sent
   * only in status `"DESIGN"`. The driver may be told `discardCode` and/or
   * `startSession`.
   *
   * @param passed whether the check accepted the session (specification parameter `passed`).
   */
  designChecked(passed: boolean): void {
    this.apply(designCheckedStep(this.current, passed));
  }

  /**
   * The check of a wiring session finished (specification `WiringChecked`). Sent
   * only in status `"WIRING"`. The driver may be told `discardCode`,
   * `startSession` or `gradeCurrentCode`.
   *
   * @param passed whether the check accepted the session (specification parameter `passed`).
   */
  wiringChecked(passed: boolean): void {
    this.apply(wiringCheckedStep(this.current, passed));
  }

  /**
   * The check of an implementation session finished (specification
   * `ImplementationChecked`). Sent only in status `"IMPLEMENTATION"`. The driver
   * may be told `discardCode` and/or `startSession`.
   *
   * @param passed whether the check accepted the session (specification parameter `passed`).
   */
  implementationChecked(passed: boolean): void {
    this.apply(implementationCheckedStep(this.current, passed));
  }

  /**
   * Grading the current code finished (specification `CurrentCodeGraded`). Sent
   * only in status `"GRADING"`. The driver may be told `startSession`.
   *
   * @param passed whether the current code passed (specification parameter `passed`).
   */
  currentCodeGraded(passed: boolean): void {
    this.apply(currentCodeGradedStep(this.current, passed));
  }

  /** Keeps the state after a step and makes its calls on the driver, in order. */
  private apply(step: PipelineStep): void {
    this.current = step.state;
    for (const call of step.calls) callDriver(this.driver, call);
  }
}
