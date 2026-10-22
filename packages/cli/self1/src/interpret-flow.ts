/**
 * Interpret flow: decides how `clp interpret` proceeds (which component is
 * interpreted and from what, how sessions and attempts follow each other, when
 * sessions are compared) and, for `clp interpret --accept`, which drafts are
 * accepted, round after round.
 *
 * Corresponds to the specification component `interpret-flow`. Nothing it keeps
 * is durable, and it serves no HTTP routes. Its state is
 * {@link InterpretFlowState}; it relies on one dependency, the driver
 * ({@link InterpretDriver}, specification component `interpret-driver`), which
 * does what the flow asks for and later answers with the flow's next command.
 *
 * Each specification command is a pure step function (`*Step`) that takes the
 * state before the command and answers the state after it together with the
 * driver calls to make, in order ({@link FlowStep}). {@link InterpretFlow} keeps
 * the state, runs those step functions and makes the calls on its driver.
 *
 * Commands are only sent in the status the specification allows for them (see
 * each method); other inputs are never sent and need no handling.
 */

/**
 * Where the flow is (specification state field `status`). The names are the
 * specification's.
 *
 * - `"IDLE"`: nothing has started yet.
 * - `"CHOOSING"`: interpreting; the driver has been asked for the next component.
 * - `"CHECKING"`: interpreting; the driver has been asked to check the current interpretation.
 * - `"SESSIONS"`: interpreting; sessions of the chosen component are running.
 * - `"DONE"`: interpreting has finished.
 * - `"ACCEPTING"`: accepting; the driver has been asked for the next component to accept.
 * - `"VERIFYING"`: accepting; the driver has been asked to check a draft.
 * - `"ACCEPTED"`: accepting has finished.
 */
export type FlowStatus =
  | "IDLE"
  | "CHOOSING"
  | "CHECKING"
  | "SESSIONS"
  | "DONE"
  | "ACCEPTING"
  | "VERIFYING"
  | "ACCEPTED";

/**
 * Everything the flow remembers (the specification's `state`). Each field has the
 * name of the specification state field it holds; `null` means "not set yet".
 * Initially: both booleans `false`, every optional field `null`, status `"IDLE"`.
 */
export interface InterpretFlowState {
  /** Whether some component was accepted in the current accepting round (state `acceptedInRound`). */
  readonly acceptedInRound: boolean;
  /** The number of attempts allowed per session, once interpreting has started (state `attemptLimit`). */
  readonly attemptLimit: number | null;
  /** Whether some component could not be accepted in the current accepting round (state `failedInRound`). */
  readonly failedInRound: boolean;
  /** The number (from 1) of the running attempt of the running session (state `runningAttempt`). */
  readonly runningAttempt: number | null;
  /** The number (from 1) of the running session (state `runningSession`). */
  readonly runningSession: number | null;
  /** The number of sessions to run, once interpreting has started (state `sessionCount`). */
  readonly sessionCount: number | null;
  /**
   * Whether the chosen component is interpreted from its current interpretation
   * (`true`) or from a skeleton (`false`) (state `startsFromCurrent`).
   */
  readonly startsFromCurrent: boolean | null;
  /** Where the flow is (state `status`). */
  readonly status: FlowStatus;
}

/** The state the flow starts from (the specification's `init`). */
export function initialInterpretFlowState(): InterpretFlowState {
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

// ---------------------------------------------------------------------------
// The driver

/**
 * How a session interprets the component (parameter `mode` of the driver's
 * `StartSession`).
 *
 * - `"skeleton"`: from a skeleton (the component has no interpretation yet).
 * - `"update"`: from the component's current interpretation.
 * - `"pinned"`: a later session, pinned to what the first session produced.
 */
export type SessionMode = "skeleton" | "update" | "pinned";

/**
 * How interpreting finished (parameter `status` of the driver's `Finish`).
 *
 * - `"up-to-date"`: nothing needed interpreting.
 * - `"interpreted"`: a component was interpreted.
 * - `"failed"`: interpreting the component failed.
 */
export type FinishStatus = "up-to-date" | "interpreted" | "failed";

/**
 * Why a component is refused for accepting (parameter `reason` of the driver's
 * `RefuseAccepting`).
 *
 * - `"no-interpretation"`: it has neither a draft nor an interpretation.
 * - `"open-reviews"`: questions or disagreements are left open.
 * - `"does-not-fit"`: its draft did not pass the check.
 */
export type RefusalReason = "no-interpretation" | "open-reviews" | "does-not-fit";

/**
 * The outcome of an attempt of a session (parameter `outcome` of
 * {@link InterpretFlow.sessionChecked}). Only `"ok"` is a good outcome; the
 * others name what went wrong.
 */
export type SessionOutcome = "ok" | "missing" | "foreign-change" | "check-failed" | "boundary-changed";

/**
 * The driver (specification component `interpret-driver`, external): it does
 * what the flow tells it, and later answers by sending the flow's next command.
 * Each method is one of its specification commands; the flow calls them, in
 * order, during one of its own commands. None of them answers anything.
 */
export interface InterpretDriver {
  /** Accept the component being considered (specification `Accept`). */
  accept(): void;
  /** Accepting is over (specification `AcceptingDone`). */
  acceptingDone(): void;
  /** Check the chosen component's current interpretation; answer with `currentChecked` (specification `CheckCurrent`). */
  checkCurrent(): void;
  /** Check the draft of the component being considered; answer with `draftChecked` (specification `CheckDraft`). */
  checkDraft(): void;
  /** Compare the given session with the first one; answer with `compared` (specification `Compare(session)`). */
  compare(session: number): void;
  /** Give the next component, in name order: answer with `consider` or `noMoreComponents` (specification `ConsiderNext`). */
  considerNext(): void;
  /** Interpreting is over, with this status (specification `Finish(status)`). */
  finish(status: FinishStatus): void;
  /**
   * Give the next component to accept: answer with `considerAccepting`, or with
   * `endRound` when the round has no more (specification `NextToAccept`).
   */
  nextToAccept(): void;
  /** Record that the given session ended without being compared (specification `RecordUncompared(session)`). */
  recordUncompared(session: number): void;
  /** Refuse the component being considered, for this reason (specification `RefuseAccepting(reason)`). */
  refuseAccepting(reason: RefusalReason): void;
  /** Start another round over the components refused in this one (specification `RetryRefused`). */
  retryRefused(): void;
  /**
   * Start an attempt of a session of the chosen component; answer with
   * `sessionChecked` (specification `StartSession(attempt, mode, session)`).
   *
   * @param session the session's number, from 1 (specification `session`).
   * @param attempt the attempt's number within the session, from 1 (specification `attempt`).
   * @param mode    what the session interprets from (specification `mode`).
   */
  startSession(session: number, attempt: number, mode: SessionMode): void;
}

/**
 * One call the flow makes on its driver: `call` names the {@link InterpretDriver}
 * method, the other fields are its arguments.
 */
export type DriverCall =
  | { readonly call: "accept" }
  | { readonly call: "acceptingDone" }
  | { readonly call: "checkCurrent" }
  | { readonly call: "checkDraft" }
  | { readonly call: "compare"; readonly session: number }
  | { readonly call: "considerNext" }
  | { readonly call: "finish"; readonly status: FinishStatus }
  | { readonly call: "nextToAccept" }
  | { readonly call: "recordUncompared"; readonly session: number }
  | { readonly call: "refuseAccepting"; readonly reason: RefusalReason }
  | { readonly call: "retryRefused" }
  | { readonly call: "startSession"; readonly session: number; readonly attempt: number; readonly mode: SessionMode };

/** Makes one call on the driver. */
export function callDriver(driver: InterpretDriver, call: DriverCall): void {
  switch (call.call) {
    case "accept":
      driver.accept();
      return;
    case "acceptingDone":
      driver.acceptingDone();
      return;
    case "checkCurrent":
      driver.checkCurrent();
      return;
    case "checkDraft":
      driver.checkDraft();
      return;
    case "compare":
      driver.compare(call.session);
      return;
    case "considerNext":
      driver.considerNext();
      return;
    case "finish":
      driver.finish(call.status);
      return;
    case "nextToAccept":
      driver.nextToAccept();
      return;
    case "recordUncompared":
      driver.recordUncompared(call.session);
      return;
    case "refuseAccepting":
      driver.refuseAccepting(call.reason);
      return;
    case "retryRefused":
      driver.retryRefused();
      return;
    case "startSession":
      driver.startSession(call.session, call.attempt, call.mode);
      return;
  }
}

/** The result of a step function: the state after the command and the driver calls to make, in order. */
export interface FlowStep {
  readonly state: InterpretFlowState;
  readonly calls: readonly DriverCall[];
}

// ---------------------------------------------------------------------------
// Inputs of the commands that take several values

/** The facts about a component to accept (parameters of specification `ConsiderAccepting`). */
export interface AcceptCandidate {
  /** Whether the component has a draft (specification parameter `hasDraft`). */
  readonly hasDraft: boolean;
  /** Whether the component has an accepted interpretation (specification parameter `hasInterpretation`). */
  readonly hasInterpretation: boolean;
  /**
   * How many questions or disagreements are left open in its draft, or, without a
   * draft, in its interpretation; 0 to 10 (specification parameter `openReviews`).
   */
  readonly openReviews: number;
  /** Whether its interpretation's stamp is the current Layer 1 (specification parameter `stampCurrent`). */
  readonly stampCurrent: boolean;
}

/** The facts about a finished attempt of a session (parameters of specification `SessionChecked`). */
export interface SessionResult {
  /** Whether the session produced a vocabulary (specification parameter `hasModel`). */
  readonly hasModel: boolean;
  /** How the attempt came out (specification parameter `outcome`). */
  readonly outcome: SessionOutcome;
}

/** The settings interpreting starts with (parameters of specification `Start`). */
export interface InterpretSettings {
  /** The number of attempts allowed per session, 1 to 3 (specification parameter `maxAttempts`). */
  readonly maxAttempts: number;
  /** The number of sessions to run, 1 to 3 (specification parameter `sessions`). */
  readonly sessions: number;
}

// ---------------------------------------------------------------------------
// Step functions: one per specification command, pure

/** Specification command `Start(maxAttempts, sessions)`; sent only in status `"IDLE"`. */
export function startStep(state: InterpretFlowState, settings: InterpretSettings): FlowStep {
  return {
    state: {
      ...state,
      attemptLimit: settings.maxAttempts,
      sessionCount: settings.sessions,
      status: "CHOOSING",
    },
    calls: [{ call: "considerNext" }],
  };
}

/**
 * The state and call that start the first attempt of the first session of the
 * chosen component, from its current interpretation or from a skeleton.
 */
function startFirstSession(state: InterpretFlowState, fromCurrent: boolean): FlowStep {
  return {
    state: { ...state, runningAttempt: 1, runningSession: 1, startsFromCurrent: fromCurrent, status: "SESSIONS" },
    calls: [{ call: "startSession", session: 1, attempt: 1, mode: firstSessionMode(fromCurrent) }],
  };
}

/** The mode of the first session: from the current interpretation, or from a skeleton. */
function firstSessionMode(fromCurrent: boolean): SessionMode {
  return fromCurrent ? "update" : "skeleton";
}

/** Specification command `Consider(hasCurrent)`; sent only in status `"CHOOSING"`. */
export function considerStep(state: InterpretFlowState, hasCurrent: boolean): FlowStep {
  if (hasCurrent) {
    return { state: { ...state, status: "CHECKING" }, calls: [{ call: "checkCurrent" }] };
  }
  return startFirstSession(state, false);
}

/** Specification command `NoMoreComponents()`; sent only in status `"CHOOSING"`. */
export function noMoreComponentsStep(state: InterpretFlowState): FlowStep {
  return { state: { ...state, status: "DONE" }, calls: [{ call: "finish", status: "up-to-date" }] };
}

/** Specification command `CurrentChecked(passed)`; sent only in status `"CHECKING"`. */
export function currentCheckedStep(state: InterpretFlowState, passed: boolean): FlowStep {
  if (passed) {
    return { state: { ...state, status: "CHOOSING" }, calls: [{ call: "considerNext" }] };
  }
  return startFirstSession(state, true);
}

/** Interpreting finishes with this status. */
function finishInterpreting(state: InterpretFlowState, status: FinishStatus, before: DriverCall[] = []): FlowStep {
  return { state: { ...state, status: "DONE" }, calls: [...before, { call: "finish", status }] };
}

/** The first attempt of the given later (pinned) session starts. */
function startPinnedSession(state: InterpretFlowState, session: number, before: DriverCall[] = []): FlowStep {
  return {
    state: { ...state, runningAttempt: 1, runningSession: session },
    calls: [...before, { call: "startSession", session, attempt: 1, mode: "pinned" }],
  };
}

/**
 * After the running session is over (compared or not): the next session
 * starts, or, after the last one, interpreting finishes.
 */
function afterLaterSession(state: InterpretFlowState, before: DriverCall[]): FlowStep {
  const session = state.runningSession!;
  if (session < state.sessionCount!) {
    return startPinnedSession(state, session + 1, before);
  }
  return finishInterpreting(state, "interpreted", before);
}

/** Specification command `SessionChecked(hasModel, outcome)`; sent only in status `"SESSIONS"`. */
export function sessionCheckedStep(state: InterpretFlowState, result: SessionResult): FlowStep {
  const session = state.runningSession!;
  const attempt = state.runningAttempt!;
  const ok = result.outcome === "ok";
  if (!ok && attempt < state.attemptLimit!) {
    const mode = session === 1 ? firstSessionMode(state.startsFromCurrent!) : "pinned";
    return {
      state: { ...state, runningAttempt: attempt + 1 },
      calls: [{ call: "startSession", session, attempt: attempt + 1, mode }],
    };
  }
  if (!ok && session === 1) {
    return finishInterpreting(state, "failed");
  }
  if (session === 1) {
    if (state.sessionCount === 1 || !result.hasModel) {
      return finishInterpreting(state, "interpreted");
    }
    return startPinnedSession(state, 2);
  }
  if (ok) {
    return { state, calls: [{ call: "compare", session }] };
  }
  return afterLaterSession(state, [{ call: "recordUncompared", session }]);
}

/** Specification command `Compared(ok)`; sent only in status `"SESSIONS"`. */
export function comparedStep(state: InterpretFlowState, ok: boolean): FlowStep {
  return afterLaterSession(state, []);
}

/** Specification command `StartAccepting()`; sent only in status `"IDLE"`. */
export function startAcceptingStep(state: InterpretFlowState): FlowStep {
  return {
    state: { ...state, acceptedInRound: false, failedInRound: false, status: "ACCEPTING" },
    calls: [{ call: "nextToAccept" }],
  };
}

/** The component being considered is refused for this reason; the driver is asked for the next one. */
function refuse(state: InterpretFlowState, reason: RefusalReason): FlowStep {
  return {
    state: { ...state, failedInRound: true, status: "ACCEPTING" },
    calls: [{ call: "refuseAccepting", reason }, { call: "nextToAccept" }],
  };
}

/** Specification command `ConsiderAccepting(hasDraft, hasInterpretation, openReviews, stampCurrent)`; sent only in status `"ACCEPTING"`. */
export function considerAcceptingStep(state: InterpretFlowState, candidate: AcceptCandidate): FlowStep {
  if (!candidate.hasDraft && !candidate.hasInterpretation) {
    return refuse(state, "no-interpretation");
  }
  if (candidate.openReviews > 0) {
    return refuse(state, "open-reviews");
  }
  if (!candidate.hasDraft && candidate.stampCurrent) {
    return { state, calls: [{ call: "nextToAccept" }] };
  }
  return { state: { ...state, status: "VERIFYING" }, calls: [{ call: "checkDraft" }] };
}

/** Specification command `DraftChecked(passed)`; sent only in status `"VERIFYING"`. */
export function draftCheckedStep(state: InterpretFlowState, passed: boolean): FlowStep {
  if (passed) {
    return {
      state: { ...state, acceptedInRound: true, status: "ACCEPTING" },
      calls: [{ call: "accept" }, { call: "nextToAccept" }],
    };
  }
  return refuse(state, "does-not-fit");
}

/** Specification command `EndRound()`; sent only in status `"ACCEPTING"`. */
export function endRoundStep(state: InterpretFlowState): FlowStep {
  if (state.failedInRound && state.acceptedInRound) {
    return {
      state: { ...state, acceptedInRound: false, failedInRound: false },
      calls: [{ call: "retryRefused" }, { call: "nextToAccept" }],
    };
  }
  return { state: { ...state, status: "ACCEPTED" }, calls: [{ call: "acceptingDone" }] };
}

// ---------------------------------------------------------------------------
// The component

/**
 * The flow of one `clp interpret` (or `clp interpret --accept`) run. It starts
 * in the initial state, keeps its state between commands, and makes its driver
 * calls synchronously, in order, before the command method returns. No command
 * answers anything; read {@link InterpretFlow.state} to see where the flow is.
 */
export class InterpretFlow {
  private readonly driver: InterpretDriver;
  private current: InterpretFlowState = initialInterpretFlowState();

  /** @param driver the driver the flow tells what to do (specification `interpret-driver`). */
  constructor(driver: InterpretDriver) {
    this.driver = driver;
  }

  /** The current state (all specification state fields, with the same names). */
  get state(): InterpretFlowState {
    return this.current;
  }

  /** Takes the state after the command, then makes its driver calls in order. */
  private run(step: FlowStep): void {
    this.current = step.state;
    for (const call of step.calls) {
      callDriver(this.driver, call);
    }
  }

  /**
   * Interpreting starts (specification `Start`). Sent only in status `"IDLE"`.
   * The driver is then asked for the first component.
   */
  start(settings: InterpretSettings): void {
    this.run(startStep(this.current, settings));
  }

  /**
   * The driver gives the next component (specification `Consider`). Sent only in status `"CHOOSING"`.
   *
   * @param hasCurrent whether the component already has an interpretation, a draft or an accepted one
   *                   (specification parameter `hasCurrent`).
   */
  consider(hasCurrent: boolean): void {
    this.run(considerStep(this.current, hasCurrent));
  }

  /** The driver has no more components (specification `NoMoreComponents`). Sent only in status `"CHOOSING"`. */
  noMoreComponents(): void {
    this.run(noMoreComponentsStep(this.current));
  }

  /**
   * The driver has checked the component's current interpretation (specification
   * `CurrentChecked`). Sent only in status `"CHECKING"`.
   *
   * @param passed whether it passed the check (specification parameter `passed`).
   */
  currentChecked(passed: boolean): void {
    this.run(currentCheckedStep(this.current, passed));
  }

  /**
   * An attempt of the running session is over (specification `SessionChecked`).
   * Sent only in status `"SESSIONS"`.
   */
  sessionChecked(result: SessionResult): void {
    this.run(sessionCheckedStep(this.current, result));
  }

  /**
   * The driver has compared the running session with the first one
   * (specification `Compared`). Sent only in status `"SESSIONS"`.
   *
   * @param ok whether the comparison was ok (specification parameter `ok`).
   */
  compared(ok: boolean): void {
    this.run(comparedStep(this.current, ok));
  }

  /**
   * Accepting starts (specification `StartAccepting`). Sent only in status `"IDLE"`.
   * The driver is then asked for the first component to accept.
   */
  startAccepting(): void {
    this.run(startAcceptingStep(this.current));
  }

  /**
   * The driver gives the next component to accept (specification
   * `ConsiderAccepting`). Sent only in status `"ACCEPTING"`.
   */
  considerAccepting(candidate: AcceptCandidate): void {
    this.run(considerAcceptingStep(this.current, candidate));
  }

  /**
   * The driver has checked the draft (specification `DraftChecked`). Sent only in status `"VERIFYING"`.
   *
   * @param passed whether the draft passed the check (specification parameter `passed`).
   */
  draftChecked(passed: boolean): void {
    this.run(draftCheckedStep(this.current, passed));
  }

  /**
   * The current accepting round has no more components (specification
   * `EndRound`). Sent only in status `"ACCEPTING"`.
   */
  endRound(): void {
    this.run(endRoundStep(this.current));
  }
}
