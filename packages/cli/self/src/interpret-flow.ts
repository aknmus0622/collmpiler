/**
 * Decides how `clp interpret` proceeds, and how `clp interpret --accept` proceeds.
 *
 * Nothing here does the work itself. The flow tells its driver what to do next;
 * the driver does it and reports the result by calling the matching command of
 * the flow. The whole conversation is therefore: call a command of
 * `InterpretFlow`, see which `InterpretDriver` methods it called and in what
 * order, and call the next command.
 *
 * It corresponds to the specification's component `interpret-flow`; the driver
 * corresponds to its external component `interpret-driver`. It keeps nothing
 * across a restart: a new instance starts over.
 */

/**
 * Where the flow stands. Specification name: state field `status`; the values
 * are the specification's own.
 *
 * - `"IDLE"`: nothing has started yet.
 * - `"CHOOSING"`: interpreting; the flow is waiting to hear about the next component.
 * - `"CHECKING"`: interpreting; the current interpretation of a component is being checked.
 * - `"SESSIONS"`: interpreting; the sessions of the chosen component are running.
 * - `"DONE"`: interpreting is over.
 * - `"ACCEPTING"`: accepting; the flow is waiting to hear about the next component to accept.
 * - `"VERIFYING"`: accepting; a component's draft is being checked.
 * - `"ACCEPTED"`: accepting is over.
 */
export type InterpretStatus =
  | "IDLE"
  | "CHOOSING"
  | "CHECKING"
  | "SESSIONS"
  | "DONE"
  | "ACCEPTING"
  | "VERIFYING"
  | "ACCEPTED";

/**
 * What a session starts from. Specification name: parameter `mode` of the driver
 * command `StartSession`; the values are the specification's own.
 *
 * - `"skeleton"`: the component is interpreted from a skeleton.
 * - `"update"`: the component is interpreted from its current interpretation.
 * - `"pinned"`: a session pinned to what an earlier session established.
 */
export type SessionMode = "skeleton" | "update" | "pinned";

/**
 * How one attempt of a session came out, as the caller found it. Specification
 * name: parameter `outcome` of the command `SessionChecked`; the values are the
 * specification's own.
 *
 * - `"ok"`: the attempt is good.
 * - `"missing"`: what the attempt should have produced is not there.
 * - `"foreign-change"`: the attempt changed something that was not its to change.
 * - `"check-failed"`: the attempt's result did not pass its check.
 * - `"boundary-changed"`: the attempt changed the component's boundary.
 */
export type SessionOutcome = "ok" | "missing" | "foreign-change" | "check-failed" | "boundary-changed";

/**
 * How interpreting ended. Specification name: parameter `status` of the driver
 * command `Finish`; the values are the specification's own.
 *
 * - `"up-to-date"`: nothing needed interpreting.
 * - `"interpreted"`: a component was interpreted.
 * - `"failed"`: a component could not be interpreted.
 */
export type FinishStatus = "up-to-date" | "interpreted" | "failed";

/**
 * Why a component was not accepted. Specification name: parameter `reason` of
 * the driver command `RefuseAccepting`; the values are the specification's own.
 *
 * - `"no-interpretation"`: there is nothing to accept.
 * - `"open-reviews"`: questions or disagreements are still open.
 * - `"does-not-fit"`: the draft did not pass its check.
 */
export type RefusalReason = "no-interpretation" | "open-reviews" | "does-not-fit";

/**
 * The session to start. The field names are the parameter names of the
 * specification's driver command `StartSession`.
 */
export interface SessionRequest {
  /** The number of the attempt within its session (specification parameter `attempt`). */
  attempt: number;
  /** What the session starts from (specification parameter `mode`). */
  mode: SessionMode;
  /** The number of the session (specification parameter `session`). */
  session: number;
}

/**
 * Everything the flow remembers, one field per state field of the specification,
 * under the same names. A field that is `null` has not been set yet.
 */
export interface InterpretFlowState {
  /** Whether a component has been accepted in this round (`acceptedInRound`). */
  acceptedInRound: boolean;
  /** How many attempts each session may take (`attemptLimit`). */
  attemptLimit: number | null;
  /** Whether a component could not be accepted in this round (`failedInRound`). */
  failedInRound: boolean;
  /** The number of the running attempt within its session (`runningAttempt`). */
  runningAttempt: number | null;
  /** The number of the running session (`runningSession`). */
  runningSession: number | null;
  /** How many sessions a component gets (`sessionCount`). */
  sessionCount: number | null;
  /** Whether the chosen component is interpreted from its current interpretation (`startsFromCurrent`). */
  startsFromCurrent: boolean | null;
  /** Where the flow stands (`status`). */
  status: InterpretStatus;
}

/**
 * The numbers `clp interpret` runs with. The field names are the parameter names
 * of the specification's command `Start`.
 */
export interface InterpretLimits {
  /** How many attempts each session may take (specification parameter `maxAttempts`). */
  maxAttempts: number;
  /** How many sessions a component gets (specification parameter `sessions`). */
  sessions: number;
}

/**
 * What is known about one attempt that is over. The field names are the
 * parameter names of the specification's command `SessionChecked`.
 */
export interface SessionResult {
  /** Whether the session gave a vocabulary (specification parameter `hasModel`). */
  hasModel: boolean;
  /** How the attempt came out (specification parameter `outcome`). */
  outcome: SessionOutcome;
}

/**
 * What is known about one component to accept. The field names are the parameter
 * names of the specification's command `ConsiderAccepting`.
 */
export interface AcceptCandidate {
  /** Whether the component has a draft (specification parameter `hasDraft`). */
  hasDraft: boolean;
  /** Whether the component has an accepted interpretation (specification parameter `hasInterpretation`). */
  hasInterpretation: boolean;
  /** How many questions and disagreements are open (specification parameter `openReviews`). */
  openReviews: number;
  /** Whether the interpretation's stamp is the current Layer 1 (specification parameter `stampCurrent`). */
  stampCurrent: boolean;
}

/**
 * What the flow needs done in the outside world; it corresponds to the
 * specification's external component `interpret-driver`, with one method per
 * command under the same name in lower camel case.
 *
 * Within one flow command the methods are called in the specification's order,
 * so order matters and a stand-in should record it. None of them answers: each
 * returns nothing, and the driver reports back by calling a command of
 * `InterpretFlow` after the flow's command has returned, never from inside one
 * of these methods.
 */
export interface InterpretDriver {
  /** Accepts the component being considered (specification command `Accept`). */
  accept(): void;
  /** Tells that accepting is over (specification command `AcceptingDone`). */
  acceptingDone(): void;
  /**
   * Checks the current interpretation of the component being considered
   * (specification command `CheckCurrent`); the driver reports through
   * `InterpretFlow.currentChecked`.
   */
  checkCurrent(): void;
  /**
   * Checks the draft of the component being considered (specification command
   * `CheckDraft`); the driver reports through `InterpretFlow.draftChecked`.
   */
  checkDraft(): void;
  /**
   * Compares a later session with the first (specification command `Compare`);
   * the driver reports through `InterpretFlow.compared`.
   *
   * @param session the session to compare (specification parameter `session`).
   */
  compare(session: number): void;
  /**
   * Asks for the next component to interpret (specification command
   * `ConsiderNext`); the driver reports through `InterpretFlow.consider`, or
   * `InterpretFlow.noMoreComponents` when none is left.
   */
  considerNext(): void;
  /**
   * Tells that interpreting is over (specification command `Finish`).
   *
   * @param status how it ended (specification parameter `status`).
   */
  finish(status: FinishStatus): void;
  /**
   * Asks for the next component to accept (specification command `NextToAccept`);
   * the driver reports through `InterpretFlow.considerAccepting`, or
   * `InterpretFlow.endRound` when none is left in this round.
   */
  nextToAccept(): void;
  /**
   * Records that a later session was not compared (specification command
   * `RecordUncompared`).
   *
   * @param session the session concerned (specification parameter `session`).
   */
  recordUncompared(session: number): void;
  /**
   * Refuses the component being considered (specification command `RefuseAccepting`).
   *
   * @param reason why (specification parameter `reason`).
   */
  refuseAccepting(reason: RefusalReason): void;
  /**
   * Makes the next round go over the components that could not be accepted
   * (specification command `RetryRefused`).
   */
  retryRefused(): void;
  /**
   * Starts an attempt of a session (specification command `StartSession`); the
   * driver reports through `InterpretFlow.sessionChecked`.
   *
   * @param request which attempt of which session, and from what.
   */
  startSession(request: SessionRequest): void;
}

/** The state the flow starts in, before either way in is taken. */
function initialState(): InterpretFlowState {
  return {
    acceptedInRound: false,
    attemptLimit: null,
    failedInRound: false,
    runningAttempt: null,
    runningSession: null,
    sessionCount: null,
    startsFromCurrent: null,
    status: "IDLE",
  };
}

/** What follows from one attempt of a session being over. */
type AttemptVerdict =
  | "next-attempt"
  | "failed"
  | "interpreted"
  | "second-session"
  | "compare"
  | "uncompared-next-session"
  | "uncompared-last-session";

/**
 * Decides what follows an attempt.
 *
 * @param attempt the attempt that is over.
 * @param attemptLimit how many attempts each session may take.
 * @param session the session it belongs to.
 * @param sessionCount how many sessions a component gets.
 * @param result how the attempt came out.
 */
function judgeAttempt(
  attempt: number,
  attemptLimit: number,
  session: number,
  sessionCount: number,
  result: SessionResult,
): AttemptVerdict {
  const ok = result.outcome === "ok";
  if (!ok && attempt < attemptLimit) return "next-attempt";
  if (session === 1) {
    if (!ok) return "failed";
    return sessionCount === 1 || !result.hasModel ? "interpreted" : "second-session";
  }
  if (ok) return "compare";
  return session < sessionCount ? "uncompared-next-session" : "uncompared-last-session";
}

/** The mode of a repeated attempt: the same one its session started in. */
function retryMode(session: number, startsFromCurrent: boolean): SessionMode {
  if (session !== 1) return "pinned";
  return startsFromCurrent ? "update" : "skeleton";
}

/** What is done with a component to accept: refused, passed over, or checked. */
type CandidateVerdict = "no-interpretation" | "open-reviews" | "nothing-to-do" | "check";

/** Decides what is done with a component to accept. */
function judgeCandidate(candidate: AcceptCandidate): CandidateVerdict {
  if (!candidate.hasDraft && !candidate.hasInterpretation) return "no-interpretation";
  if (candidate.openReviews > 0) return "open-reviews";
  return !candidate.hasDraft && candidate.stampCurrent ? "nothing-to-do" : "check";
}

/** Whether another round is worth running: an acceptance may let a refused component fit. */
function needsAnotherRound(failedInRound: boolean, acceptedInRound: boolean): boolean {
  return failedInRound && acceptedInRound;
}

/**
 * One run of `clp interpret` or of `clp interpret --accept`. Create one with
 * `new InterpretFlow(driver)`; it starts in the specification's initial state.
 *
 * Each method performs one command of the specification. A command's `requires`
 * limits when it may be called and with what; other calls are never made. Each
 * returns nothing: what the command leads to is seen in the calls on the driver
 * and in `state()`. There are two ways in: `start` for interpreting and
 * `startAccepting` for accepting.
 */
export class InterpretFlow {
  private readonly driver: InterpretDriver;
  private current: InterpretFlowState = initialState();

  /**
   * @param driver told what to do next, for as long as the flow lives.
   */
  constructor(driver: InterpretDriver) {
    this.driver = driver;
  }

  /**
   * Reads what the flow remembers. It only reads, and may be called at any point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): InterpretFlowState {
    return { ...this.current };
  }

  /**
   * Performs the specification's command `Start`: interpreting starts.
   *
   * @param limits the numbers to run with.
   */
  start(limits: InterpretLimits): void {
    this.update({ attemptLimit: limits.maxAttempts, sessionCount: limits.sessions, status: "CHOOSING" });
    this.driver.considerNext();
  }

  /**
   * Performs the specification's command `Consider`: the driver's answer to
   * `considerNext`, naming a component.
   *
   * @param hasCurrent whether the component has an interpretation, a draft or an
   *   accepted one (specification parameter `hasCurrent`).
   */
  consider(hasCurrent: boolean): void {
    if (hasCurrent) {
      this.update({ status: "CHECKING" });
      this.driver.checkCurrent();
    } else {
      this.startFirstSession(false);
    }
  }

  /**
   * Performs the specification's command `NoMoreComponents`: the driver's answer
   * to `considerNext` when no component is left.
   */
  noMoreComponents(): void {
    this.finish("up-to-date");
  }

  /**
   * Performs the specification's command `CurrentChecked`: the driver's answer to
   * `checkCurrent`.
   *
   * @param passed whether the current interpretation passed (specification
   *   parameter `passed`).
   */
  currentChecked(passed: boolean): void {
    if (passed) {
      this.update({ status: "CHOOSING" });
      this.driver.considerNext();
    } else {
      this.startFirstSession(true);
    }
  }

  /**
   * Performs the specification's command `SessionChecked`: the driver's answer to
   * `startSession`, once the attempt is over.
   *
   * @param result how the attempt came out.
   */
  sessionChecked(result: SessionResult): void {
    const attempt = this.current.runningAttempt!;
    const session = this.current.runningSession!;
    const verdict = judgeAttempt(attempt, this.current.attemptLimit!, session, this.current.sessionCount!, result);
    switch (verdict) {
      case "next-attempt":
        this.update({ runningAttempt: attempt + 1 });
        this.driver.startSession({
          attempt: attempt + 1,
          mode: retryMode(session, this.current.startsFromCurrent!),
          session,
        });
        break;
      case "failed":
        this.finish("failed");
        break;
      case "interpreted":
        this.finish("interpreted");
        break;
      case "second-session":
        this.startPinnedSession(session + 1);
        break;
      case "compare":
        this.driver.compare(session);
        break;
      case "uncompared-next-session":
        this.driver.recordUncompared(session);
        this.startPinnedSession(session + 1);
        break;
      case "uncompared-last-session":
        this.driver.recordUncompared(session);
        this.finish("interpreted");
        break;
    }
  }

  /**
   * Performs the specification's command `Compared`: the driver's answer to
   * `compare`.
   *
   * @param ok whether the comparison came out ok (specification parameter `ok`).
   */
  compared(ok: boolean): void {
    const session = this.current.runningSession!;
    if (session < this.current.sessionCount!) {
      this.startPinnedSession(session + 1);
    } else {
      this.finish("interpreted");
    }
  }

  /**
   * Performs the specification's command `StartAccepting`: accepting starts.
   */
  startAccepting(): void {
    this.update({ acceptedInRound: false, failedInRound: false, status: "ACCEPTING" });
    this.driver.nextToAccept();
  }

  /**
   * Performs the specification's command `ConsiderAccepting`: the driver's answer
   * to `nextToAccept`, naming a component.
   *
   * @param candidate what is known about the component.
   */
  considerAccepting(candidate: AcceptCandidate): void {
    const verdict = judgeCandidate(candidate);
    switch (verdict) {
      case "no-interpretation":
      case "open-reviews":
        this.refuse(verdict);
        break;
      case "nothing-to-do":
        this.driver.nextToAccept();
        break;
      case "check":
        this.update({ status: "VERIFYING" });
        this.driver.checkDraft();
        break;
    }
  }

  /**
   * Performs the specification's command `DraftChecked`: the driver's answer to
   * `checkDraft`.
   *
   * @param passed whether the draft passed (specification parameter `passed`).
   */
  draftChecked(passed: boolean): void {
    this.update({ status: "ACCEPTING" });
    if (passed) {
      this.update({ acceptedInRound: true });
      this.driver.accept();
      this.driver.nextToAccept();
    } else {
      this.refuse("does-not-fit");
    }
  }

  /**
   * Performs the specification's command `EndRound`: the driver's answer to
   * `nextToAccept` when no component is left in this round.
   */
  endRound(): void {
    if (needsAnotherRound(this.current.failedInRound, this.current.acceptedInRound)) {
      this.update({ acceptedInRound: false, failedInRound: false });
      this.driver.retryRefused();
      this.driver.nextToAccept();
    } else {
      this.update({ status: "ACCEPTED" });
      this.driver.acceptingDone();
    }
  }

  /** Changes the given fields of what the flow remembers. */
  private update(changes: Partial<InterpretFlowState>): void {
    this.current = { ...this.current, ...changes };
  }

  /** The component is chosen: its first session starts, from what it has. */
  private startFirstSession(fromCurrent: boolean): void {
    this.update({ runningAttempt: 1, runningSession: 1, startsFromCurrent: fromCurrent, status: "SESSIONS" });
    this.driver.startSession({ attempt: 1, mode: fromCurrent ? "update" : "skeleton", session: 1 });
  }

  /** A later session starts, at its first attempt. */
  private startPinnedSession(session: number): void {
    this.update({ runningAttempt: 1, runningSession: session });
    this.driver.startSession({ attempt: 1, mode: "pinned", session });
  }

  /** Interpreting is over. */
  private finish(status: FinishStatus): void {
    this.update({ status: "DONE" });
    this.driver.finish(status);
  }

  /** A component could not be accepted in this round; the next one is asked for. */
  private refuse(reason: RefusalReason): void {
    this.update({ failedInRound: true });
    this.driver.refuseAccepting(reason);
    this.driver.nextToAccept();
  }
}
