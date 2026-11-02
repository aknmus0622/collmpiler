/**
 * Decides how `clp run` proceeds, from the specs to verified code.
 *
 * Nothing here does the work itself. The flow tells its driver what to do next;
 * the driver does it and reports the result by calling the matching command of
 * the flow. The whole conversation is therefore: call a command of `RunFlow`, see
 * which `RunDriver` methods it called and in what order, read `state()`, and call
 * the next command.
 *
 * It corresponds to the specification's component `run-flow`; the driver
 * corresponds to its external component `run-driver`. It keeps nothing across a
 * restart: a new instance starts over.
 */

/**
 * Where the flow stands. Specification name: state field `status`; the values are
 * the specification's own.
 *
 * - `"IDLE"`: nothing has started yet.
 * - `"CHECKING"`: Layer 1 is being checked.
 * - `"CANDIDATES"`: the flow is waiting to hear about the next split candidate.
 * - `"PROPOSING"`: an agent is being asked how to split a candidate.
 * - `"SPLIT_ASKED"`: the person is being asked about a proposed split.
 * - `"INTERPRETING"`: a file is being interpreted.
 * - `"QUESTIONS"`: the flow is waiting to hear about the next open question.
 * - `"QUESTION_ASKED"`: the person is being asked an open question.
 * - `"PLACING"`: supplements are being placed.
 * - `"CONFIRMING"`: the person is being asked to confirm the supplements.
 * - `"ACCEPTING"`: the interpretations are being accepted.
 * - `"APPLYING"`: the code is being brought into agreement.
 * - `"DONE"`: the run is over.
 */
export type RunStatus =
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
 * How the run ended. Specification name: parameter `reason` of the driver command
 * `Finish`; the values are the specification's own.
 *
 * - `"passed"`: the code passes.
 * - `"layer1"`: Layer 1 does not read.
 * - `"split-agent"`: the agent failed while proposing a split.
 * - `"interpret-failed"`: interpreting failed.
 * - `"interpret-agent"`: the agent failed while interpreting.
 * - `"person"`: the person stopped the run.
 * - `"unplaced"`: a supplement has no place.
 * - `"not-written"`: the person refused to have the supplements written.
 * - `"not-accepted"`: the interpretations could not be accepted.
 * - `"not-verified"`: the code does not pass.
 * - `"apply-agent"`: the agent failed while applying.
 * - `"spec"`: the specification is wrong.
 * - `"rounds"`: the run has no rounds left.
 */
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
 * What came of applying. Specification name: parameter `outcome` of the command
 * `Applied`; the values are the specification's own.
 *
 * - `"pass"`: the code passes.
 * - `"fail"`: the code does not pass.
 * - `"agent-failed"`: the agent failed.
 * - `"spec-error"`: the specification is wrong.
 */
export type ApplyOutcome = "pass" | "fail" | "agent-failed" | "spec-error";

/**
 * What came of asking to interpret. Specification name: parameter `outcome` of the
 * command `Interpreted`; the values are the specification's own.
 *
 * - `"up-to-date"`: there was nothing left to interpret.
 * - `"interpreted"`: a file was interpreted.
 * - `"failed"`: interpreting failed.
 * - `"agent-failed"`: the agent failed.
 */
export type InterpretOutcome = "up-to-date" | "interpreted" | "failed" | "agent-failed";

/**
 * What came of asking how to split a candidate. Specification name: parameter
 * `outcome` of the command `Proposed`; the values are the specification's own.
 *
 * - `"none"`: the agent has no proposal.
 * - `"proposal"`: the agent has a proposal.
 * - `"agent-failed"`: the agent failed.
 */
export type ProposalOutcome = "none" | "proposal" | "agent-failed";

/**
 * The person's answer to an open question. Specification name: parameter `answer`
 * of the command `QuestionAnswered`; the values are the specification's own.
 *
 * - `"accept"`: the reading is right.
 * - `"supplement"`: the person supplements the specs.
 * - `"stop"`: the person stops the run.
 */
export type QuestionAnswer = "accept" | "supplement" | "stop";

/**
 * The person's answer to a proposed split. Specification name: parameter `answer`
 * of the command `SplitAnswered`; the values are the specification's own.
 *
 * - `"accept"`: the person takes the split.
 * - `"decline"`: the person refuses the split.
 * - `"stop"`: the person stops the run.
 */
export type SplitAnswer = "accept" | "decline" | "stop";

/**
 * Everything the flow remembers, one field per state field of the specification,
 * under the same names. A field that is `null` has not been set yet.
 */
export interface RunFlowState {
  /** The number of the running round (`round`). */
  round: number;
  /** The most rounds the run may take (`roundLimit`). */
  roundLimit: number | null;
  /** Whether a split has been accepted in this round (`splitAccepted`). */
  splitAccepted: boolean;
  /** Where the flow stands (`status`). */
  status: RunStatus;
  /** Whether a question has been supplemented in this round (`supplemented`). */
  supplemented: boolean;
  /** Whether supplements are written without asking (`writeUnasked`). */
  writeUnasked: boolean;
}

/**
 * What the flow needs done in the outside world; it corresponds to the
 * specification's external component `run-driver`, with one method per command
 * under the same name in lower camel case.
 *
 * Within one flow command the methods are called in the specification's order, so
 * order matters and a stand-in should record it. None of them answers: each returns
 * nothing, and the driver reports back by calling a command of `RunFlow` after the
 * flow's command has returned, never from inside one of these methods. A method
 * below that names no answer expects none.
 */
export interface RunDriver {
  /** Accepts the interpretations (specification command `Accept`); answered with `RunFlow.accepted`. */
  accept(): void;
  /** Brings the code into agreement (specification command `Apply`); answered with `RunFlow.applied`. */
  apply(): void;
  /** Asks the person the current question (specification command `AskQuestion`); answered with `RunFlow.questionAnswered`. */
  askQuestion(): void;
  /** Asks the person about the proposed split (specification command `AskSplit`); answered with `RunFlow.splitAnswered`. */
  askSplit(): void;
  /** Checks Layer 1 (specification command `CheckLayer1`); answered with `RunFlow.layer1Checked`. */
  checkLayer1(): void;
  /** Asks the person to confirm the supplements (specification command `ConfirmSupplements`); answered with `RunFlow.supplementsConfirmed`. */
  confirmSupplements(): void;
  /** Records the refusal of the proposed split (specification command `Decline`). */
  decline(): void;
  /**
   * Ends the run (specification command `Finish`).
   *
   * @param reason how the run ended (specification parameter `reason`).
   */
  finish(reason: RunFinishReason): void;
  /** Interprets the next file (specification command `Interpret`); answered with `RunFlow.interpreted`. */
  interpret(): void;
  /** Marks the current reading as reviewed (specification command `MarkReviewed`). */
  markReviewed(): void;
  /** Looks for the next split candidate (specification command `NextCandidate`); answered with `RunFlow.candidate` or `RunFlow.noMoreCandidates`. */
  nextCandidate(): void;
  /** Looks for the next open question (specification command `NextQuestion`); answered with `RunFlow.question` or `RunFlow.noMoreQuestions`. */
  nextQuestion(): void;
  /** Places the supplements (specification command `PlaceSupplements`); answered with `RunFlow.supplementsPlaced`. */
  placeSupplements(): void;
  /** Asks an agent how to split the current candidate (specification command `Propose`); answered with `RunFlow.proposed`. */
  propose(): void;
  /** Tells that the questions are done (specification command `QuestionsDone`). */
  questionsDone(): void;
  /** Reads the open questions (specification command `ReadQuestions`). */
  readQuestions(): void;
  /** Tells that interpreting starts (specification command `StartInterpreting`). */
  startInterpreting(): void;
  /** Writes the accepted split (specification command `WriteSplit`). */
  writeSplit(): void;
  /** Writes the supplements (specification command `WriteSupplements`). */
  writeSupplements(): void;
}

/** How a run ends for each outcome of applying. */
const FINISH_OF_APPLY: Record<ApplyOutcome, RunFinishReason> = {
  pass: "passed",
  fail: "not-verified",
  "agent-failed": "apply-agent",
  "spec-error": "spec",
};

/**
 * What ending a round that changed Layer 1 leads to: the next round, with its
 * per-round flags cleared, or the end of the run when no round is left.
 */
function afterRound(flow: RunFlowState): RunFlowState {
  if (flow.round < flow.roundLimit!) {
    return {
      ...flow,
      round: flow.round + 1,
      splitAccepted: false,
      status: "CHECKING",
      supplemented: false,
    };
  }
  return { ...flow, status: "DONE" };
}

/**
 * One run of `clp run`. Create one with `new RunFlow(driver)`; it starts in the
 * specification's initial state.
 *
 * Each method other than `state` performs one command of the specification, under
 * the same name in lower camel case. A command's `requires` limits when it may be
 * called and with what; other calls are never made. Each returns nothing: what the
 * command leads to is seen in the calls on the driver and in `state()`.
 */
export class RunFlow {
  private readonly driver: RunDriver;
  private flow: RunFlowState = {
    round: 0,
    roundLimit: null,
    splitAccepted: false,
    status: "IDLE",
    supplemented: false,
    writeUnasked: false,
  };

  /**
   * @param driver told what to do next, for as long as the flow lives.
   */
  constructor(driver: RunDriver) {
    this.driver = driver;
  }

  /**
   * Reads what the flow remembers. It only reads, and may be called at any point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): RunFlowState {
    return { ...this.flow };
  }

  /**
   * Performs the specification's command `Start`: the run begins. This is the first
   * call of a run.
   *
   * @param rounds the most rounds the run may take (specification parameter `rounds`).
   * @param yes whether supplements are written without asking (specification parameter `yes`).
   */
  start(rounds: number, yes: boolean): void {
    this.flow = {
      round: this.flow.round + 1,
      roundLimit: rounds,
      splitAccepted: false,
      status: "CHECKING",
      supplemented: false,
      writeUnasked: yes,
    };
    this.driver.checkLayer1();
  }

  /**
   * Performs the specification's command `Layer1Checked`: the answer to
   * `RunDriver.checkLayer1`.
   *
   * @param ok whether Layer 1 reads (specification parameter `ok`).
   */
  layer1Checked(ok: boolean): void {
    if (ok) {
      this.moveTo("CANDIDATES");
      this.driver.nextCandidate();
    } else {
      this.finish("layer1");
    }
  }

  /**
   * Performs the specification's command `Candidate`: an answer to
   * `RunDriver.nextCandidate`, there is a candidate.
   */
  candidate(): void {
    this.moveTo("PROPOSING");
    this.driver.propose();
  }

  /**
   * Performs the specification's command `NoMoreCandidates`: an answer to
   * `RunDriver.nextCandidate`, there are no candidates left.
   */
  noMoreCandidates(): void {
    if (this.flow.splitAccepted) {
      this.flow = afterRound(this.flow);
      this.announceRoundEnd();
    } else {
      this.moveTo("INTERPRETING");
      this.driver.startInterpreting();
      this.driver.interpret();
    }
  }

  /**
   * Performs the specification's command `Proposed`: the answer to
   * `RunDriver.propose`.
   *
   * @param outcome what came of asking (specification parameter `outcome`).
   */
  proposed(outcome: ProposalOutcome): void {
    if (outcome === "none") {
      this.moveTo("CANDIDATES");
      this.driver.nextCandidate();
    } else if (outcome === "proposal") {
      this.moveTo("SPLIT_ASKED");
      this.driver.askSplit();
    } else {
      this.finish("split-agent");
    }
  }

  /**
   * Performs the specification's command `SplitAnswered`: the answer to
   * `RunDriver.askSplit`.
   *
   * @param answer the person's answer (specification parameter `answer`).
   */
  splitAnswered(answer: SplitAnswer): void {
    if (answer === "stop") {
      this.finish("person");
      return;
    }
    if (answer === "accept") {
      this.flow = { ...this.flow, splitAccepted: true, status: "CANDIDATES" };
      this.driver.writeSplit();
    } else {
      this.moveTo("CANDIDATES");
      this.driver.decline();
    }
    this.driver.nextCandidate();
  }

  /**
   * Performs the specification's command `Interpreted`: the answer to
   * `RunDriver.interpret`.
   *
   * @param outcome what came of asking (specification parameter `outcome`).
   */
  interpreted(outcome: InterpretOutcome): void {
    if (outcome === "interpreted") {
      this.driver.interpret();
    } else if (outcome === "up-to-date") {
      this.moveTo("QUESTIONS");
      this.driver.readQuestions();
      this.driver.nextQuestion();
    } else if (outcome === "failed") {
      this.finish("interpret-failed");
    } else {
      this.finish("interpret-agent");
    }
  }

  /**
   * Performs the specification's command `Question`: an answer to
   * `RunDriver.nextQuestion`, there is a question.
   */
  question(): void {
    this.moveTo("QUESTION_ASKED");
    this.driver.askQuestion();
  }

  /**
   * Performs the specification's command `NoMoreQuestions`: an answer to
   * `RunDriver.nextQuestion`, there are no questions left.
   */
  noMoreQuestions(): void {
    if (this.flow.supplemented) {
      this.moveTo("PLACING");
      this.driver.placeSupplements();
    } else {
      this.moveTo("ACCEPTING");
      this.driver.questionsDone();
      this.driver.accept();
    }
  }

  /**
   * Performs the specification's command `QuestionAnswered`: the answer to
   * `RunDriver.askQuestion`.
   *
   * @param answer the person's answer (specification parameter `answer`).
   */
  questionAnswered(answer: QuestionAnswer): void {
    if (answer === "stop") {
      this.finish("person");
      return;
    }
    if (answer === "accept") {
      this.moveTo("QUESTIONS");
      this.driver.markReviewed();
    } else {
      this.flow = { ...this.flow, status: "QUESTIONS", supplemented: true };
    }
    this.driver.nextQuestion();
  }

  /**
   * Performs the specification's command `SupplementsPlaced`: the answer to
   * `RunDriver.placeSupplements`.
   *
   * @param placed whether every supplement has a place (specification parameter `placed`).
   */
  supplementsPlaced(placed: boolean): void {
    if (!placed) {
      this.finish("unplaced");
    } else if (this.flow.writeUnasked) {
      this.writeSupplements();
    } else {
      this.moveTo("CONFIRMING");
      this.driver.confirmSupplements();
    }
  }

  /**
   * Performs the specification's command `SupplementsConfirmed`: the answer to
   * `RunDriver.confirmSupplements`.
   *
   * @param yes whether the person confirms (specification parameter `yes`).
   */
  supplementsConfirmed(yes: boolean): void {
    if (yes) {
      this.writeSupplements();
    } else {
      this.finish("not-written");
    }
  }

  /**
   * Performs the specification's command `Accepted`: the answer to
   * `RunDriver.accept`.
   *
   * @param ok whether the interpretations were accepted (specification parameter `ok`).
   */
  accepted(ok: boolean): void {
    if (ok) {
      this.moveTo("APPLYING");
      this.driver.apply();
    } else {
      this.finish("not-accepted");
    }
  }

  /**
   * Performs the specification's command `Applied`: the answer to `RunDriver.apply`.
   *
   * @param outcome what came of applying (specification parameter `outcome`).
   */
  applied(outcome: ApplyOutcome): void {
    this.finish(FINISH_OF_APPLY[outcome]);
  }

  private moveTo(status: RunStatus): void {
    this.flow = { ...this.flow, status };
  }

  private finish(reason: RunFinishReason): void {
    this.moveTo("DONE");
    this.driver.finish(reason);
  }

  /** Writes the supplements, which ends the round. */
  private writeSupplements(): void {
    this.flow = afterRound(this.flow);
    this.driver.writeSupplements();
    this.driver.questionsDone();
    this.announceRoundEnd();
  }

  /** Tells the driver what the end of the round led to. */
  private announceRoundEnd(): void {
    if (this.flow.status === "CHECKING") {
      this.driver.checkLayer1();
    } else {
      this.driver.finish("rounds");
    }
  }
}
