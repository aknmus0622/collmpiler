import {
  acceptedAfterCheck,
  afterComparison,
  afterSession,
  anotherRound,
  decideAccepting,
  failedAfterCheck,
  nextAttempt,
  nextSession,
  sessionMode,
} from "./plan.ts";
import type { SessionProgress } from "./plan.ts";
import type {
  AcceptCandidate,
  Acceptance,
  ComponentCursor,
  FinishStatus,
  FlowReporter,
  InterpretationChecker,
  InterpretFlowState,
  InterpretLimits,
  RefusalReason,
  SessionOutcome,
  SessionRunner,
} from "./types.ts";

/**
 * Decides how `clp interpret` proceeds (which component to interpret, from what, and how its sessions and
 * attempts follow each other) and, for `clp interpret --accept`, which drafts are accepted, round after
 * round. It is driven from outside: `start` or `startAccepting` once, then one call per answer to the work
 * it asked its dependencies for.
 *
 * One instance is one run. A new instance starts in the specification's initial state, remembering only the
 * data the specification gives an initial value. Each method below performs one command of the
 * specification; a command returns nothing, and its outcome is observed through `state`, the data getters,
 * and the calls made on the dependencies. Calls on the dependencies are made synchronously, in the order the
 * specification lists the effects. Nothing is kept across a restart.
 */
export class InterpretFlow {
  private readonly cursor: ComponentCursor;
  private readonly checker: InterpretationChecker;
  private readonly sessions: SessionRunner;
  private readonly acceptance: Acceptance;
  private readonly reporter: FlowReporter;
  private currentState: InterpretFlowState = "idle";
  private storedSessionCount: number | undefined = undefined;
  private storedAttemptLimit: number | undefined = undefined;
  private storedRunningSession: number | undefined = undefined;
  private storedRunningAttempt: number | undefined = undefined;
  private storedStartsFromCurrent: boolean | undefined = undefined;
  private storedAcceptedInRound = false;
  private storedFailedInRound = false;

  /**
   * @param cursor receives the effects `ConsiderNext`, `NextToAccept` and `RetryRefused`
   * @param checker receives the effects `CheckCurrent` and `CheckDraft`
   * @param sessions receives the effects `StartSession`, `Compare` and `RecordUncompared`
   * @param acceptance receives the effects `Accept` and `RefuseAccepting`
   * @param reporter receives the effects `Finish` and `AcceptingDone`
   */
  constructor(
    cursor: ComponentCursor,
    checker: InterpretationChecker,
    sessions: SessionRunner,
    acceptance: Acceptance,
    reporter: FlowReporter,
  ) {
    this.cursor = cursor;
    this.checker = checker;
    this.sessions = sessions;
    this.acceptance = acceptance;
    this.reporter = reporter;
  }

  /** The current state. `InterpretFlowState` lists the specification name of each value. */
  get state(): InterpretFlowState {
    return this.currentState;
  }

  /** The specification's `data.sessionCount`; `undefined` until a command has stored it. */
  get sessionCount(): number | undefined {
    return this.storedSessionCount;
  }

  /** The specification's `data.attemptLimit`; `undefined` until a command has stored it. */
  get attemptLimit(): number | undefined {
    return this.storedAttemptLimit;
  }

  /** The specification's `data.runningSession`; `undefined` until a command has stored it. */
  get runningSession(): number | undefined {
    return this.storedRunningSession;
  }

  /** The specification's `data.runningAttempt`; `undefined` until a command has stored it. */
  get runningAttempt(): number | undefined {
    return this.storedRunningAttempt;
  }

  /** The specification's `data.startsFromCurrent`; `undefined` until a command has stored it. */
  get startsFromCurrent(): boolean | undefined {
    return this.storedStartsFromCurrent;
  }

  /** The specification's `data.acceptedInRound` (it has an initial value, so it is always defined). */
  get acceptedInRound(): boolean {
    return this.storedAcceptedInRound;
  }

  /** The specification's `data.failedInRound` (it has an initial value, so it is always defined). */
  get failedInRound(): boolean {
    return this.storedFailedInRound;
  }

  /**
   * Performs the command `Start`.
   *
   * @param limits the command's input; `InterpretLimits` documents how it maps to the command's `sessions`
   *   and `maxAttempts`
   */
  start(limits: InterpretLimits): void {
    this.cursor.considerNext();
    this.currentState = "choosing";
    this.storedAttemptLimit = limits.attemptsPerSession;
    this.storedSessionCount = limits.sessions;
  }

  /**
   * Performs the command `Consider`: a component is offered, in name order.
   *
   * @param hasCurrent the command's `hasCurrent`: whether the component has an interpretation (a draft or
   *   an accepted one)
   */
  consider(hasCurrent: boolean): void {
    if (hasCurrent) {
      this.checker.checkCurrent();
      this.currentState = "checking";
      return;
    }
    this.beginSessions(false);
  }

  /** Performs the command `NoMoreComponents` (no input): there is no further component to consider. */
  noMoreComponents(): void {
    this.finish("up-to-date");
  }

  /**
   * Performs the command `CurrentChecked`: the answer to `InterpretationChecker.checkCurrent`.
   *
   * @param passed the command's `passed`
   */
  currentChecked(passed: boolean): void {
    if (passed) {
      this.cursor.considerNext();
      this.currentState = "choosing";
      return;
    }
    this.beginSessions(true);
  }

  /**
   * Performs the command `SessionChecked`: the answer to `SessionRunner.startSession`.
   *
   * @param outcome the command's `outcome`
   * @param hasModel the command's `hasModel`: whether the session gave vocabulary
   */
  sessionChecked(outcome: SessionOutcome, hasModel: boolean): void {
    const progress = this.progress();
    switch (afterSession(outcome, hasModel, progress)) {
      case "retry": {
        const attempt = nextAttempt(progress.attempt);
        this.sessions.startSession(progress.session, attempt, sessionMode(progress.session, progress.startsFromCurrent));
        this.storedRunningAttempt = attempt;
        return;
      }
      case "fail":
        this.finish("failed");
        return;
      case "skip-session":
        this.sessions.recordUncompared(progress.session);
        this.startPinned(nextSession(progress.session));
        return;
      case "compare":
        this.sessions.compare(progress.session);
        return;
      case "finish":
        this.finish("interpreted");
        return;
      case "second-session":
        this.startPinned(2);
        return;
      case "skip-and-finish":
        this.sessions.recordUncompared(progress.session);
        this.finish("interpreted");
        return;
    }
  }

  /**
   * Performs the command `Compared`: the answer to `SessionRunner.compare`.
   *
   * @param ok the command's `ok`
   */
  compared(ok: boolean): void {
    const progress = this.progress();
    if (afterComparison(progress) === "next-session") {
      this.startPinned(nextSession(progress.session));
      return;
    }
    this.finish("interpreted");
  }

  /** Performs the command `StartAccepting` (no input). */
  startAccepting(): void {
    this.cursor.nextToAccept();
    this.currentState = "accepting";
  }

  /**
   * Performs the command `ConsiderAccepting`: a component of the round is offered for acceptance.
   *
   * @param candidate the command's input; `AcceptCandidate` documents each member
   */
  considerAccepting(candidate: AcceptCandidate): void {
    switch (decideAccepting(candidate)) {
      case "refuse-open-reviews":
        this.refuse("open-reviews");
        return;
      case "refuse-no-interpretation":
        this.refuse("no-interpretation");
        return;
      case "skip":
        this.cursor.nextToAccept();
        return;
      case "check":
        this.checker.checkDraft();
        this.currentState = "verifying";
        return;
    }
  }

  /**
   * Performs the command `DraftChecked`: the answer to `InterpretationChecker.checkDraft`.
   *
   * @param passed the command's `passed`
   */
  draftChecked(passed: boolean): void {
    if (passed) {
      this.acceptance.accept();
    } else {
      this.acceptance.refuse("does-not-fit");
    }
    this.cursor.nextToAccept();
    this.currentState = "accepting";
    this.storedAcceptedInRound = acceptedAfterCheck(this.storedAcceptedInRound, passed);
    this.storedFailedInRound = failedAfterCheck(this.storedFailedInRound, passed);
  }

  /** Performs the command `EndRound` (no input): no component is left in the round. */
  endRound(): void {
    if (anotherRound(this.storedAcceptedInRound, this.storedFailedInRound)) {
      this.cursor.retryRefused();
      this.cursor.nextToAccept();
      this.storedAcceptedInRound = false;
      this.storedFailedInRound = false;
      return;
    }
    this.reporter.acceptingDone();
    this.currentState = "accepted";
  }

  private progress(): SessionProgress {
    return {
      session: this.storedRunningSession ?? 1,
      attempt: this.storedRunningAttempt ?? 1,
      sessionCount: this.storedSessionCount ?? 1,
      attemptLimit: this.storedAttemptLimit ?? 1,
      startsFromCurrent: this.storedStartsFromCurrent ?? false,
    };
  }

  private beginSessions(startsFromCurrent: boolean): void {
    this.sessions.startSession(1, 1, sessionMode(1, startsFromCurrent));
    this.currentState = "sessions";
    this.storedRunningAttempt = 1;
    this.storedRunningSession = 1;
    this.storedStartsFromCurrent = startsFromCurrent;
  }

  private startPinned(session: number): void {
    this.sessions.startSession(session, 1, "pinned");
    this.storedRunningAttempt = 1;
    this.storedRunningSession = session;
  }

  private refuse(reason: RefusalReason): void {
    this.acceptance.refuse(reason);
    this.cursor.nextToAccept();
    this.storedFailedInRound = true;
  }

  private finish(status: FinishStatus): void {
    this.reporter.finish(status);
    this.currentState = "done";
  }
}
