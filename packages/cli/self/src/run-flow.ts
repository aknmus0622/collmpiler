/**
 * Run flow: decides how `clp run` proceeds, from the specs to verified code. It
 * says what to do next, where an answer leads, and how the run ends; the work
 * itself is done by the driver.
 *
 * Corresponds to the specification component `run-flow`. Nothing it keeps is
 * durable, it serves no HTTP routes, and the specification has no queries. Its
 * state is {@link RunFlowState}; it relies on one dependency, the driver
 * ({@link RunDriver}, specification component `run-driver`), which it tells what
 * to do and which never answers directly.
 *
 * Each specification command is a pure step function (`*Step`) that takes the
 * state before the command and answers the state after it together with the
 * calls to make on the driver, in order ({@link RunFlowStep}). {@link RunFlow}
 * keeps the state, runs those functions and makes the calls on its driver.
 *
 * Use: `start` once; then, each time the driver has finished what it was asked
 * for, send the command that reports its result (see {@link RunFlowStatus} for
 * which commands each status waits for) until the status is `"DONE"`. Commands
 * are only sent in the status that waits for them; other inputs are never sent
 * and need no handling.
 */

/**
 * Where the run is (specification state field `status`). The names are the
 * specification's.
 *
 * - `"IDLE"`: not started yet; `start` comes next.
 * - `"CHECKING"`: Layer 1 is being checked; `layer1Checked` comes next.
 * - `"CANDIDATES"`: the next split candidate was asked for; `candidate` or
 *   `noMoreCandidates` comes next.
 * - `"PROPOSING"`: an agent is proposing a split of a candidate; `proposed` comes
 *   next.
 * - `"SPLIT_ASKED"`: the person is being asked about a proposed split;
 *   `splitAnswered` comes next.
 * - `"INTERPRETING"`: a file is being interpreted; `interpreted` comes next.
 * - `"QUESTIONS"`: the next open question was asked for; `question` or
 *   `noMoreQuestions` comes next.
 * - `"QUESTION_ASKED"`: the person is being asked a question; `questionAnswered`
 *   comes next.
 * - `"PLACING"`: supplements are being placed; `supplementsPlaced` comes next.
 * - `"CONFIRMING"`: the person is being asked to confirm the supplements;
 *   `supplementsConfirmed` comes next.
 * - `"ACCEPTING"`: the interpretations are being accepted; `accepted` comes next.
 * - `"APPLYING"`: the code is being brought into agreement; `applied` comes next.
 * - `"DONE"`: the run has ended; no command comes any more.
 */
export type RunFlowStatus =
  | "IDLE"
  | "CHECKING"
  | "CANDIDATES"
  | "PROPOSING"
  | "SPLIT_ASKED"
  | "INTERPRETING"
  | "QUESTIONS"
  | "QUESTION_ASKED"
  | "PLACING"
  | "CONFIRMING"
  | "ACCEPTING"
  | "APPLYING"
  | "DONE";

/**
 * Everything the run flow remembers (the specification's `state`). Each field has
 * the name of the specification state field it holds.
 */
export interface RunFlowState {
  /** The number of the current round (state `round`). */
  readonly round: number;
  /** The most rounds the run may take, or `null` while none was given (state `roundLimit`). */
  readonly roundLimit: number | null;
  /** Whether a split was accepted in this round (state `splitAccepted`). */
  readonly splitAccepted: boolean;
  /** Where the run is (state `status`). */
  readonly status: RunFlowStatus;
  /** Whether a question was supplemented in this round (state `supplemented`). */
  readonly supplemented: boolean;
  /** Whether supplements are written without asking the person (state `writeUnasked`). */
  readonly writeUnasked: boolean;
}

/** The state the run flow starts from (the specification's `init`). */
export function initialRunFlowState(): RunFlowState {
  return {
    round: 0,
    roundLimit: null,
    splitAccepted: false,
    status: "IDLE",
    supplemented: false,
    writeUnasked: false,
  };
}

/** What came of asking an agent to split a candidate (parameter `outcome` of specification `Proposed`). */
export type ProposalOutcome = "none" | "proposal" | "agent-failed";

/** The person's answer about a proposed split (parameter `answer` of specification `SplitAnswered`). */
export type SplitAnswer = "accept" | "decline" | "stop";

/** What came of interpreting (parameter `outcome` of specification `Interpreted`). */
export type InterpretOutcome = "up-to-date" | "interpreted" | "failed" | "agent-failed";

/** The person's answer to a question (parameter `answer` of specification `QuestionAnswered`). */
export type QuestionAnswer = "accept" | "supplement" | "stop";

/** What came of bringing the code into agreement (parameter `outcome` of specification `Applied`). */
export type ApplyOutcome = "pass" | "fail" | "agent-failed" | "spec-error";

/** Why the run ended (parameter `reason` of specification `run-driver.Finish`). The names are the specification's. */
export type RunFinishReason =
  | "passed"
  | "layer1"
  | "split-agent"
  | "interpret-failed"
  | "interpret-agent"
  | "person"
  | "unplaced"
  | "not-written"
  | "not-accepted"
  | "not-verified"
  | "apply-agent"
  | "spec"
  | "rounds";

/**
 * The driver (specification component `run-driver`, external): does what the
 * flow asks for. Each method is one of its specification commands; the flow calls
 * them, in order, during one of its own commands. None of them answers anything:
 * the result comes back later, not from inside the call, as a command on
 * {@link RunFlow}.
 */
export interface RunDriver {
  /** Checks that Layer 1 reads (specification `CheckLayer1`). The result comes back as `layer1Checked`. */
  checkLayer1(): void;
  /** Asks for the next split candidate (specification `NextCandidate`). The result comes back as `candidate` or `noMoreCandidates`. */
  nextCandidate(): void;
  /** Asks an agent how to split the candidate (specification `Propose`). The result comes back as `proposed`. */
  propose(): void;
  /** Asks the person about the proposed split (specification `AskSplit`). The result comes back as `splitAnswered`. */
  askSplit(): void;
  /** Writes the accepted split (specification `WriteSplit`). */
  writeSplit(): void;
  /** Records that the person refused the split (specification `Decline`). */
  decline(): void;
  /** Tells that interpreting begins (specification `StartInterpreting`). */
  startInterpreting(): void;
  /** Interprets the next file (specification `Interpret`). The result comes back as `interpreted`. */
  interpret(): void;
  /** Reads the open questions (specification `ReadQuestions`). */
  readQuestions(): void;
  /** Asks for the next question (specification `NextQuestion`). The result comes back as `question` or `noMoreQuestions`. */
  nextQuestion(): void;
  /** Asks the person the question (specification `AskQuestion`). The result comes back as `questionAnswered`. */
  askQuestion(): void;
  /** Marks the reading in question as reviewed (specification `MarkReviewed`). */
  markReviewed(): void;
  /** Places the supplements (specification `PlaceSupplements`). The result comes back as `supplementsPlaced`. */
  placeSupplements(): void;
  /** Asks the person to confirm the supplements (specification `ConfirmSupplements`). The result comes back as `supplementsConfirmed`. */
  confirmSupplements(): void;
  /** Writes the supplements (specification `WriteSupplements`). */
  writeSupplements(): void;
  /** Tells that the questions of this round are done (specification `QuestionsDone`). */
  questionsDone(): void;
  /** Accepts the interpretations (specification `Accept`). The result comes back as `accepted`. */
  accept(): void;
  /** Brings the code into agreement (specification `Apply`). The result comes back as `applied`. */
  apply(): void;
  /**
   * Ends the run (specification `Finish`).
   *
   * @param reason why the run ended (specification parameter `reason`).
   */
  finish(reason: RunFinishReason): void;
}

/**
 * One call the flow makes on its driver: `call` names the {@link RunDriver}
 * method, the other fields are its arguments.
 */
export type RunDriverCall =
  | { readonly call: "checkLayer1" }
  | { readonly call: "nextCandidate" }
  | { readonly call: "propose" }
  | { readonly call: "askSplit" }
  | { readonly call: "writeSplit" }
  | { readonly call: "decline" }
  | { readonly call: "startInterpreting" }
  | { readonly call: "interpret" }
  | { readonly call: "readQuestions" }
  | { readonly call: "nextQuestion" }
  | { readonly call: "askQuestion" }
  | { readonly call: "markReviewed" }
  | { readonly call: "placeSupplements" }
  | { readonly call: "confirmSupplements" }
  | { readonly call: "writeSupplements" }
  | { readonly call: "questionsDone" }
  | { readonly call: "accept" }
  | { readonly call: "apply" }
  | { readonly call: "finish"; readonly reason: RunFinishReason };

/** Makes one call on the driver. */
export function callRunDriver(driver: RunDriver, call: RunDriverCall): void {
  if (call.call === "finish") {
    driver.finish(call.reason);
  } else {
    driver[call.call]();
  }
}

/** The result of a step function: the state after the command and the calls to make on the driver, in order. */
export interface RunFlowStep {
  readonly state: RunFlowState;
  readonly calls: readonly RunDriverCall[];
}

// ---------------------------------------------------------------------------
// Step functions: one per specification command, pure

/** The reason the run ends with, for each outcome of bringing the code into agreement. */
const APPLY_FINISH_REASONS: Readonly<Record<ApplyOutcome, RunFinishReason>> = {
  pass: "passed",
  fail: "not-verified",
  "agent-failed": "apply-agent",
  "spec-error": "spec",
};

/** The run ends now, for the given reason. */
function finished(state: RunFlowState, reason: RunFinishReason): RunFlowStep {
  return { state: { ...state, status: "DONE" }, calls: [{ call: "finish", reason }] };
}

/** The next round starts, unless it would go past the limit: then the run ends. */
function nextRound(state: RunFlowState): RunFlowStep {
  if (state.round >= state.roundLimit!) return finished(state, "rounds");
  return {
    state: {
      ...state,
      round: state.round + 1,
      splitAccepted: false,
      status: "CHECKING",
      supplemented: false,
    },
    calls: [{ call: "checkLayer1" }],
  };
}

/** The supplements are written, the questions are done, and the next round starts. */
function writeSupplements(state: RunFlowState): RunFlowStep {
  const next = nextRound(state);
  return {
    state: next.state,
    calls: [{ call: "writeSupplements" }, { call: "questionsDone" }, ...next.calls],
  };
}

/**
 * Specification command `Start`: a run starts.
 *
 * @param rounds the most rounds the run may take (specification parameter `rounds`).
 * @param yes    whether supplements are written without asking (specification parameter `yes`).
 */
export function startStep(state: RunFlowState, rounds: number, yes: boolean): RunFlowStep {
  return {
    state: {
      round: state.round + 1,
      roundLimit: rounds,
      splitAccepted: false,
      status: "CHECKING",
      supplemented: false,
      writeUnasked: yes,
    },
    calls: [{ call: "checkLayer1" }],
  };
}

/**
 * Specification command `Layer1Checked`: the check of Layer 1 finished.
 *
 * @param ok whether Layer 1 reads (specification parameter `ok`).
 */
export function layer1CheckedStep(state: RunFlowState, ok: boolean): RunFlowStep {
  if (!ok) return finished(state, "layer1");
  return { state: { ...state, status: "CANDIDATES" }, calls: [{ call: "nextCandidate" }] };
}

/** Specification command `Candidate`: there is a next split candidate. */
export function candidateStep(state: RunFlowState): RunFlowStep {
  return { state: { ...state, status: "PROPOSING" }, calls: [{ call: "propose" }] };
}

/** Specification command `NoMoreCandidates`: the split candidates have run out. */
export function noMoreCandidatesStep(state: RunFlowState): RunFlowStep {
  if (state.splitAccepted) return nextRound(state);
  return {
    state: { ...state, status: "INTERPRETING" },
    calls: [{ call: "startInterpreting" }, { call: "interpret" }],
  };
}

/**
 * Specification command `Proposed`: the agent asked to split a candidate finished.
 *
 * @param outcome what came of it (specification parameter `outcome`).
 */
export function proposedStep(state: RunFlowState, outcome: ProposalOutcome): RunFlowStep {
  if (outcome === "none") {
    return { state: { ...state, status: "CANDIDATES" }, calls: [{ call: "nextCandidate" }] };
  }
  if (outcome === "proposal") {
    return { state: { ...state, status: "SPLIT_ASKED" }, calls: [{ call: "askSplit" }] };
  }
  return finished(state, "split-agent");
}

/**
 * Specification command `SplitAnswered`: the person answered about a proposed split.
 *
 * @param answer the person's answer (specification parameter `answer`).
 */
export function splitAnsweredStep(state: RunFlowState, answer: SplitAnswer): RunFlowStep {
  if (answer === "stop") return finished(state, "person");
  if (answer === "accept") {
    return {
      state: { ...state, splitAccepted: true, status: "CANDIDATES" },
      calls: [{ call: "writeSplit" }, { call: "nextCandidate" }],
    };
  }
  return {
    state: { ...state, status: "CANDIDATES" },
    calls: [{ call: "decline" }, { call: "nextCandidate" }],
  };
}

/**
 * Specification command `Interpreted`: interpreting finished one go.
 *
 * @param outcome what came of it (specification parameter `outcome`).
 */
export function interpretedStep(state: RunFlowState, outcome: InterpretOutcome): RunFlowStep {
  if (outcome === "interpreted") return { state, calls: [{ call: "interpret" }] };
  if (outcome === "up-to-date") {
    return {
      state: { ...state, status: "QUESTIONS" },
      calls: [{ call: "readQuestions" }, { call: "nextQuestion" }],
    };
  }
  return finished(state, outcome === "failed" ? "interpret-failed" : "interpret-agent");
}

/** Specification command `Question`: there is a next question. */
export function questionStep(state: RunFlowState): RunFlowStep {
  return { state: { ...state, status: "QUESTION_ASKED" }, calls: [{ call: "askQuestion" }] };
}

/** Specification command `NoMoreQuestions`: the questions have run out. */
export function noMoreQuestionsStep(state: RunFlowState): RunFlowStep {
  if (state.supplemented) {
    return { state: { ...state, status: "PLACING" }, calls: [{ call: "placeSupplements" }] };
  }
  return {
    state: { ...state, status: "ACCEPTING" },
    calls: [{ call: "questionsDone" }, { call: "accept" }],
  };
}

/**
 * Specification command `QuestionAnswered`: the person answered a question.
 *
 * @param answer the person's answer (specification parameter `answer`).
 */
export function questionAnsweredStep(state: RunFlowState, answer: QuestionAnswer): RunFlowStep {
  if (answer === "stop") return finished(state, "person");
  if (answer === "accept") {
    return {
      state: { ...state, status: "QUESTIONS" },
      calls: [{ call: "markReviewed" }, { call: "nextQuestion" }],
    };
  }
  return {
    state: { ...state, status: "QUESTIONS", supplemented: true },
    calls: [{ call: "nextQuestion" }],
  };
}

/**
 * Specification command `SupplementsPlaced`: placing the supplements finished.
 *
 * @param placed whether every supplement found a place (specification parameter `placed`).
 */
export function supplementsPlacedStep(state: RunFlowState, placed: boolean): RunFlowStep {
  if (!placed) return finished(state, "unplaced");
  if (state.writeUnasked) return writeSupplements(state);
  return { state: { ...state, status: "CONFIRMING" }, calls: [{ call: "confirmSupplements" }] };
}

/**
 * Specification command `SupplementsConfirmed`: the person answered whether the
 * supplements are to be written.
 *
 * @param yes the person's answer (specification parameter `yes`).
 */
export function supplementsConfirmedStep(state: RunFlowState, yes: boolean): RunFlowStep {
  if (!yes) return finished(state, "not-written");
  return writeSupplements(state);
}

/**
 * Specification command `Accepted`: accepting the interpretations finished.
 *
 * @param ok whether everything was accepted (specification parameter `ok`).
 */
export function acceptedStep(state: RunFlowState, ok: boolean): RunFlowStep {
  if (!ok) return finished(state, "not-accepted");
  return { state: { ...state, status: "APPLYING" }, calls: [{ call: "apply" }] };
}

/**
 * Specification command `Applied`: bringing the code into agreement finished.
 *
 * @param outcome what came of it (specification parameter `outcome`).
 */
export function appliedStep(state: RunFlowState, outcome: ApplyOutcome): RunFlowStep {
  return finished(state, APPLY_FINISH_REASONS[outcome]);
}

// ---------------------------------------------------------------------------
// The component

/**
 * The flow of one `clp run`. It starts in the initial state, keeps its state
 * between commands, and makes its calls on the driver synchronously, in order,
 * before the command method returns. No command answers anything; read
 * {@link RunFlow.state} to see where the run is.
 */
export class RunFlow {
  private readonly driver: RunDriver;
  private current: RunFlowState;

  /**
   * @param driver the driver told what to do next (specification `run-driver`).
   */
  constructor(driver: RunDriver) {
    this.driver = driver;
    this.current = initialRunFlowState();
  }

  /** The current state (all specification state fields, with the same names). */
  get state(): RunFlowState {
    return this.current;
  }

  /**
   * Starts the run (specification `Start`). The driver is told `checkLayer1`.
   *
   * @param rounds the most rounds the run may take (specification parameter `rounds`).
   * @param yes    whether supplements are written without asking (specification parameter `yes`).
   */
  start(rounds: number, yes: boolean): void {
    this.perform(startStep(this.current, rounds, yes));
  }

  /**
   * The check of Layer 1 finished (specification `Layer1Checked`). The driver is
   * told `nextCandidate` or `finish`.
   *
   * @param ok whether Layer 1 reads (specification parameter `ok`).
   */
  layer1Checked(ok: boolean): void {
    this.perform(layer1CheckedStep(this.current, ok));
  }

  /** There is a next split candidate (specification `Candidate`). The driver is told `propose`. */
  candidate(): void {
    this.perform(candidateStep(this.current));
  }

  /**
   * The split candidates have run out (specification `NoMoreCandidates`). The
   * driver is told `checkLayer1`, `finish`, or `startInterpreting` and `interpret`.
   */
  noMoreCandidates(): void {
    this.perform(noMoreCandidatesStep(this.current));
  }

  /**
   * The agent asked to split a candidate finished (specification `Proposed`). The
   * driver is told `nextCandidate`, `askSplit` or `finish`.
   *
   * @param outcome what came of it (specification parameter `outcome`).
   */
  proposed(outcome: ProposalOutcome): void {
    this.perform(proposedStep(this.current, outcome));
  }

  /**
   * The person answered about a proposed split (specification `SplitAnswered`). The
   * driver may be told `finish`, `writeSplit`, `decline` and `nextCandidate`.
   *
   * @param answer the person's answer (specification parameter `answer`).
   */
  splitAnswered(answer: SplitAnswer): void {
    this.perform(splitAnsweredStep(this.current, answer));
  }

  /**
   * Interpreting finished one go (specification `Interpreted`). The driver may be
   * told `interpret`, `readQuestions`, `nextQuestion` and `finish`.
   *
   * @param outcome what came of it (specification parameter `outcome`).
   */
  interpreted(outcome: InterpretOutcome): void {
    this.perform(interpretedStep(this.current, outcome));
  }

  /** There is a next question (specification `Question`). The driver is told `askQuestion`. */
  question(): void {
    this.perform(questionStep(this.current));
  }

  /**
   * The questions have run out (specification `NoMoreQuestions`). The driver may be
   * told `placeSupplements`, `questionsDone` and `accept`.
   */
  noMoreQuestions(): void {
    this.perform(noMoreQuestionsStep(this.current));
  }

  /**
   * The person answered a question (specification `QuestionAnswered`). The driver
   * may be told `finish`, `markReviewed` and `nextQuestion`.
   *
   * @param answer the person's answer (specification parameter `answer`).
   */
  questionAnswered(answer: QuestionAnswer): void {
    this.perform(questionAnsweredStep(this.current, answer));
  }

  /**
   * Placing the supplements finished (specification `SupplementsPlaced`). The
   * driver may be told `finish`, `writeSupplements`, `questionsDone`, `checkLayer1`
   * and `confirmSupplements`.
   *
   * @param placed whether every supplement found a place (specification parameter `placed`).
   */
  supplementsPlaced(placed: boolean): void {
    this.perform(supplementsPlacedStep(this.current, placed));
  }

  /**
   * The person answered whether the supplements are to be written (specification
   * `SupplementsConfirmed`). The driver may be told `finish`, `writeSupplements`,
   * `questionsDone` and `checkLayer1`.
   *
   * @param yes the person's answer (specification parameter `yes`).
   */
  supplementsConfirmed(yes: boolean): void {
    this.perform(supplementsConfirmedStep(this.current, yes));
  }

  /**
   * Accepting the interpretations finished (specification `Accepted`). The driver
   * is told `apply` or `finish`.
   *
   * @param ok whether everything was accepted (specification parameter `ok`).
   */
  accepted(ok: boolean): void {
    this.perform(acceptedStep(this.current, ok));
  }

  /**
   * Bringing the code into agreement finished (specification `Applied`). The driver
   * is told `finish`.
   *
   * @param outcome what came of it (specification parameter `outcome`).
   */
  applied(outcome: ApplyOutcome): void {
    this.perform(appliedStep(this.current, outcome));
  }

  /** Keeps the state of a step and makes its calls on the driver, in order. */
  private perform(step: RunFlowStep): void {
    this.current = step.state;
    for (const call of step.calls) callRunDriver(this.driver, call);
  }
}
