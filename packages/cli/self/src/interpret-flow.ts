/**
 * How `clp interpret` proceeds: which component is interpreted and from what,
 * how interpretation sessions and their attempts follow each other, when a
 * later session is compared with the first; and, for `clp interpret --accept`,
 * which drafts are accepted, round after round.
 *
 * Corresponds to the specification component "interpret-flow". One
 * `InterpretFlow` object drives one run of `clp interpret` (or of
 * `clp interpret --accept`). It does no work itself: whoever owns it does the
 * actual work (looking at components, checking, running sessions, comparing,
 * accepting) when told to by its `InterpretFlowListener`, and reports the
 * result back by calling the matching method. Nothing is kept across a
 * restart of the system.
 *
 * Command -> method:
 *   `Start`             -> `start`
 *   `Consider`          -> `consider`
 *   `NoMoreComponents`  -> `noMoreComponents`
 *   `CurrentChecked`    -> `currentChecked`
 *   `SessionChecked`    -> `sessionChecked`
 *   `Compared`          -> `compared`
 *   `StartAccepting`    -> `startAccepting`
 *   `ConsiderAccepting` -> `considerAccepting`
 *   `DraftChecked`      -> `draftChecked`
 *   `EndRound`          -> `endRound`
 *
 * Effect -> listener method:
 *   `ConsiderNext`     -> `InterpretFlowListener.considerNext`
 *   `CheckCurrent`     -> `InterpretFlowListener.checkCurrent`
 *   `StartSession`     -> `InterpretFlowListener.startSession`
 *   `Compare`          -> `InterpretFlowListener.compare`
 *   `RecordUncompared` -> `InterpretFlowListener.recordUncompared`
 *   `Finish`           -> `InterpretFlowListener.finish`
 *   `NextToAccept`     -> `InterpretFlowListener.nextToAccept`
 *   `CheckDraft`       -> `InterpretFlowListener.checkDraft`
 *   `Accept`           -> `InterpretFlowListener.accept`
 *   `RefuseAccepting`  -> `InterpretFlowListener.refuseAccepting`
 *   `RetryRefused`     -> `InterpretFlowListener.retryRefused`
 *   `AcceptingDone`    -> `InterpretFlowListener.acceptingDone`
 *
 * The component asks its environment nothing (no queries). The specification
 * calculations are the exported pure functions at the end of this file.
 */

/**
 * Where the run stands; values identical to the specification's states.
 *   `"IDLE"`      nothing is being done (the starting state); `start` or
 *                 `startAccepting` may be called.
 *   `"CHOOSING"`  components are being looked at in name order; the owner
 *                 answers `considerNext` with `consider` or `noMoreComponents`.
 *   `"CHECKING"`  the current interpretation of a component is being checked;
 *                 the owner answers `checkCurrent` with `currentChecked`.
 *   `"SESSIONS"`  interpretation sessions are running; the owner answers
 *                 `startSession` with `sessionChecked` and `compare` with
 *                 `compared`.
 *   `"DONE"`      interpreting is over (final).
 *   `"ACCEPTING"` drafts are being accepted, component after component, round
 *                 after round; the owner answers `nextToAccept` with
 *                 `considerAccepting` or `endRound`.
 *   `"VERIFYING"` a draft (or a re-stamped interpretation) is being checked
 *                 before it is accepted; the owner answers `checkDraft` with
 *                 `draftChecked`.
 *   `"ACCEPTED"`  accepting is over (final).
 */
export type InterpretFlowState =
  | "IDLE"
  | "CHOOSING"
  | "CHECKING"
  | "SESSIONS"
  | "DONE"
  | "ACCEPTING"
  | "VERIFYING"
  | "ACCEPTED";

/**
 * What an interpretation session starts from (spec field `mode` of
 * `StartSession`); values identical to the specification's.
 *   `"skeleton"` from a skeleton.
 *   `"update"`   from the component's current interpretation.
 *   `"pinned"`   from a skeleton, with the first session's vocabulary fixed.
 */
export type SessionMode = "skeleton" | "update" | "pinned";

/**
 * How an attempt of a session ended (spec field `outcome` of
 * `SessionChecked`); values identical to the specification's. Only `"ok"`
 * counts as a successful attempt; every other value is a kind of failure.
 */
export type SessionOutcome = "ok" | "missing" | "foreign-change" | "check-failed" | "boundary-changed";

/** How interpreting ended (spec field `status` of `Finish`); values identical to the specification's. */
export type FinishStatus =
  /** Every component's interpretation already fits; nothing was interpreted. */
  | "up-to-date"
  /** A component was interpreted (its first session produced a draft). */
  | "interpreted"
  /** The chosen component could not be interpreted. */
  | "failed";

/** Why a component is not accepted (spec field `reason` of `RefuseAccepting`); values identical to the specification's. */
export type RefusalReason =
  /** It has neither a draft nor an interpretation. */
  | "no-interpretation"
  /** Its draft (or interpretation) has questions or disagreements left open. */
  | "open-reviews"
  /** Its draft (or re-stamped interpretation) did not pass the check. */
  | "does-not-fit";

/** Input of `start` (spec command `Start`). Field names identical to the specification's. */
export interface InterpretStart {
  /** How many sessions interpret the component, 1 to 3 (spec data `sessionCount`). The first is kept as the draft; the others are compared with it. */
  sessions: number;
  /** How many attempts each session has before it gives up, 1 to 3 (spec data `attemptLimit`). */
  maxAttempts: number;
}

/** Input of `sessionChecked` (spec command `SessionChecked`): how the attempt just run ended. */
export interface SessionResult {
  /** How the attempt ended. */
  outcome: SessionOutcome;
  /** Whether the session gave a vocabulary (a model) that later sessions can be pinned to. */
  hasModel: boolean;
}

/** Input of `considerAccepting` (spec command `ConsiderAccepting`): facts about the component to accept. */
export interface AcceptCandidate {
  /** Whether the component has a draft. */
  hasDraft: boolean;
  /** Whether the component has an accepted interpretation. */
  hasInterpretation: boolean;
  /** How many questions or disagreements are left open in its draft (or, without a draft, in its interpretation); 0 to 10. */
  openReviews: number;
  /** Whether its interpretation's stamp is already the current Layer 1. */
  stampCurrent: boolean;
}

/** Payload of the `StartSession` effect. */
export interface SessionStart {
  /** Which session to run, 1 to 3 (1 is the one kept as the draft). */
  session: number;
  /** Which attempt of that session this is, 1 to 3. */
  attempt: number;
  /** What the session starts from. */
  mode: SessionMode;
}

/** Dependency: told what the run does to its environment (spec effects). Each method is told synchronously from within the command method that emits it, in the specification's order. */
export interface InterpretFlowListener {
  /** Spec effect `ConsiderNext`: give the next component, in name order, by calling `consider`, or call `noMoreComponents` if there is none. */
  considerNext(): void;
  /** Spec effect `CheckCurrent`: check the current interpretation of the component being considered and answer with `currentChecked`. */
  checkCurrent(): void;
  /** Spec effect `StartSession`: run this attempt of this interpretation session for the chosen component and answer with `sessionChecked`. */
  startSession(start: SessionStart): void;
  /** Spec effect `Compare`: compare the interpretation of the given session (2 or 3) with the first one and answer with `compared`. */
  compare(session: number): void;
  /** Spec effect `RecordUncompared`: the given session could not be compared (it found no interpretation that passed). */
  recordUncompared(session: number): void;
  /** Spec effect `Finish`: interpreting is over, with this outcome. */
  finish(status: FinishStatus): void;
  /** Spec effect `NextToAccept`: give the next component to accept in this round by calling `considerAccepting`, or call `endRound` if there is none left in the round. */
  nextToAccept(): void;
  /** Spec effect `CheckDraft`: check the draft (or the re-stamped interpretation) of the component being accepted and answer with `draftChecked`. */
  checkDraft(): void;
  /** Spec effect `Accept`: the draft of the component being accepted becomes its interpretation, stamped with the current Layer 1. */
  accept(): void;
  /** Spec effect `RefuseAccepting`: the component being accepted is not accepted, for this reason. */
  refuseAccepting(reason: RefusalReason): void;
  /** Spec effect `RetryRefused`: the next round runs over the components that were not accepted. */
  retryRefused(): void;
  /** Spec effect `AcceptingDone`: accepting is over. */
  acceptingDone(): void;
}

/**
 * Drives one run. Starts in `"IDLE"`. Each method performs one specification
 * command; calling a method in a state the command is not listed for has
 * unspecified behaviour. Remembered between commands (spec data): the number
 * of sessions and of attempts per session, the running session and attempt,
 * whether the chosen component starts from its current interpretation, and,
 * while accepting, whether some component was accepted / could not be
 * accepted in the round being run.
 */
export class InterpretFlow {
  private readonly listener: InterpretFlowListener;
  private current: InterpretFlowState = "IDLE";
  private sessionCount = 1;
  private attemptLimit = 1;
  private runningSession = 1;
  private runningAttempt = 1;
  private startsFromCurrent = false;
  private acceptedInRound = false;
  private failedInRound = false;

  /** @param listener receives every effect of the run. */
  constructor(listener: InterpretFlowListener) {
    this.listener = listener;
  }

  /** Current state of the run (spec state names). */
  get state(): InterpretFlowState {
    return this.current;
  }

  /** Spec command `Start` (from `"IDLE"`): interpreting starts with the given number of sessions and attempts per session; the first component is asked for. */
  start(input: InterpretStart): void {
    this.sessionCount = input.sessions;
    this.attemptLimit = input.maxAttempts;
    this.current = "CHOOSING";
    this.listener.considerNext();
  }

  /** Spec command `Consider` (in `"CHOOSING"`): the next component in name order; `hasCurrent` is whether it has an interpretation (a draft or an accepted one). */
  consider(hasCurrent: boolean): void {
    if (hasCurrent) {
      this.current = "CHECKING";
      this.listener.checkCurrent();
    } else {
      this.beginSessions(false);
    }
  }

  /** Spec command `NoMoreComponents` (in `"CHOOSING"`): there is no further component to consider. */
  noMoreComponents(): void {
    this.finishWith("up-to-date");
  }

  /** Spec command `CurrentChecked` (in `"CHECKING"`): answer to `checkCurrent`; `passed` is whether the current interpretation passed the check. */
  currentChecked(passed: boolean): void {
    if (passed) {
      this.current = "CHOOSING";
      this.listener.considerNext();
    } else {
      this.beginSessions(true);
    }
  }

  /** Spec command `SessionChecked` (in `"SESSIONS"`): answer to `startSession`; how the attempt of the running session ended. */
  sessionChecked(result: SessionResult): void {
    const first = this.runningSession === 1;
    if (result.outcome !== "ok") {
      if (this.runningAttempt < this.attemptLimit) {
        this.runningAttempt = nextAttempt(this.runningAttempt);
        this.listener.startSession({
          session: this.runningSession,
          attempt: this.runningAttempt,
          mode: sessionMode(this.runningSession, this.startsFromCurrent),
        });
      } else if (first) {
        this.finishWith("failed");
      } else {
        this.listener.recordUncompared(this.runningSession);
        this.advanceSession();
      }
    } else if (!first) {
      this.listener.compare(this.runningSession);
    } else if (this.sessionCount === 1 || !result.hasModel) {
      this.finishWith("interpreted");
    } else {
      this.advanceSession();
    }
  }

  /** Spec command `Compared` (in `"SESSIONS"`): answer to `compare`; `ok` is whether the comparison found agreement (either way the session counts as done). */
  compared(ok: boolean): void {
    this.advanceSession();
  }

  /** Spec command `StartAccepting` (from `"IDLE"`): accepting starts with a round over every component; the first component is asked for. */
  startAccepting(): void {
    this.current = "ACCEPTING";
    this.listener.nextToAccept();
  }

  /** Spec command `ConsiderAccepting` (in `"ACCEPTING"`): the next component to accept in this round, with facts about it. */
  considerAccepting(candidate: AcceptCandidate): void {
    const refusal = refusalFor(candidate);
    if (refusal !== null) {
      this.listener.refuseAccepting(refusal);
      this.failedInRound = true;
      this.listener.nextToAccept();
    } else if (needsNothing(candidate)) {
      this.listener.nextToAccept();
    } else {
      this.current = "VERIFYING";
      this.listener.checkDraft();
    }
  }

  /** Spec command `DraftChecked` (in `"VERIFYING"`): answer to `checkDraft`; `passed` is whether the draft (or re-stamped interpretation) passed the check. */
  draftChecked(passed: boolean): void {
    if (passed) this.listener.accept();
    else this.listener.refuseAccepting("does-not-fit");
    this.acceptedInRound = acceptedAfterCheck(this.acceptedInRound, passed);
    this.failedInRound = failedAfterCheck(this.failedInRound, passed);
    this.current = "ACCEPTING";
    this.listener.nextToAccept();
  }

  /** Spec command `EndRound` (in `"ACCEPTING"`): the round has no further component. */
  endRound(): void {
    if (this.failedInRound && this.acceptedInRound) {
      this.acceptedInRound = false;
      this.failedInRound = false;
      this.listener.retryRefused();
      this.listener.nextToAccept();
    } else {
      this.current = "ACCEPTED";
      this.listener.acceptingDone();
    }
  }

  /** The chosen component's first session starts, attempt 1. */
  private beginSessions(fromCurrent: boolean): void {
    this.startsFromCurrent = fromCurrent;
    this.runningSession = 1;
    this.runningAttempt = 1;
    this.current = "SESSIONS";
    this.listener.startSession({ session: 1, attempt: 1, mode: sessionMode(1, fromCurrent) });
  }

  /** The running session is done: the next one starts (pinned), or, after the last one, interpreting finishes as interpreted. */
  private advanceSession(): void {
    if (this.runningSession < this.sessionCount) {
      this.runningSession = nextSession(this.runningSession);
      this.runningAttempt = 1;
      this.listener.startSession({
        session: this.runningSession,
        attempt: 1,
        mode: sessionMode(this.runningSession, this.startsFromCurrent),
      });
    } else {
      this.finishWith("interpreted");
    }
  }

  private finishWith(status: FinishStatus): void {
    this.current = "DONE";
    this.listener.finish(status);
  }
}

/** Why a component to accept is refused before any check, or `null` if it is not. */
function refusalFor(candidate: AcceptCandidate): RefusalReason | null {
  if (!candidate.hasDraft && !candidate.hasInterpretation) return "no-interpretation";
  if (candidate.openReviews > 0) return "open-reviews";
  return null;
}

/** Whether a component with nothing left open needs nothing: no draft, and an interpretation already stamped with the current Layer 1. */
function needsNothing(candidate: AcceptCandidate): boolean {
  return !candidate.hasDraft && candidate.hasInterpretation && candidate.stampCurrent;
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

/** Spec calculation `nextAttempt`: the attempt number that follows the running attempt (spec data `runningAttempt`). */
export function nextAttempt(runningAttempt: number): number {
  return runningAttempt + 1;
}

/** Spec calculation `nextSession`: the session number that follows the running session (spec data `runningSession`). */
export function nextSession(runningSession: number): number {
  return runningSession + 1;
}

/** Spec calculation `sessionMode`: the mode of the running session, from its number (spec data `runningSession`) and whether the chosen component starts from its current interpretation (spec data `startsFromCurrent`). */
export function sessionMode(runningSession: number, startsFromCurrent: boolean): SessionMode {
  if (runningSession > 1) return "pinned";
  return startsFromCurrent ? "update" : "skeleton";
}

/** Spec calculation `acceptedAfterCheck`: whether some component was accepted in this round once the draft just checked is counted; `acceptedInRound` is the remembered value before it, `passed` the check's result. */
export function acceptedAfterCheck(acceptedInRound: boolean, passed: boolean): boolean {
  return acceptedInRound || passed;
}

/** Spec calculation `failedAfterCheck`: whether some component could not be accepted in this round once the draft just checked is counted; `failedInRound` is the remembered value before it, `passed` the check's result. */
export function failedAfterCheck(failedInRound: boolean, passed: boolean): boolean {
  return failedInRound || !passed;
}
