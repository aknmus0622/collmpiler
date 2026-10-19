/**
 * Vocabulary of the interpret flow: the position it reports, the values its commands and effects carry, and
 * the dependencies it is given.
 */

/**
 * Position of the flow. Corresponds to the specification's states:
 *
 * - `"idle"`: `IDLE` (nothing is being done; the starting state)
 * - `"choosing"`: `CHOOSING` (components are being looked at in order)
 * - `"checking"`: `CHECKING` (the current interpretation of a component is being checked)
 * - `"sessions"`: `SESSIONS` (interpretation sessions are running)
 * - `"done"`: `DONE` (interpreting is over; final)
 * - `"accepting"`: `ACCEPTING` (drafts are being accepted, round after round)
 * - `"verifying"`: `VERIFYING` (a draft, or a re-stamped interpretation, is being checked before acceptance)
 * - `"accepted"`: `ACCEPTED` (accepting is over; final)
 */
export type InterpretFlowState =
  | "idle"
  | "choosing"
  | "checking"
  | "sessions"
  | "done"
  | "accepting"
  | "verifying"
  | "accepted";

/**
 * What an interpretation session starts from. Corresponds to the `mode` of the specification's
 * `StartSession` effect (and to the calculation `sessionMode`), with the same spellings:
 *
 * - `"skeleton"`: from a skeleton;
 * - `"update"`: from the component's current interpretation;
 * - `"pinned"`: from a skeleton, with the first session's vocabulary fixed.
 */
export type SessionMode = "skeleton" | "update" | "pinned";

/**
 * How an attempt of a session ended. Corresponds to the `outcome` input of the specification's
 * `SessionChecked` command, with the same spellings.
 */
export type SessionOutcome = "ok" | "missing" | "foreign-change" | "check-failed" | "boundary-changed";

/**
 * How interpreting ended. Corresponds to the `status` of the specification's `Finish` effect, with the same
 * spellings.
 */
export type FinishStatus = "up-to-date" | "interpreted" | "failed";

/**
 * Why a component is not accepted. Corresponds to the `reason` of the specification's `RefuseAccepting`
 * effect, with the same spellings.
 */
export type RefusalReason = "no-interpretation" | "open-reviews" | "does-not-fit";

/**
 * The limits interpreting is started with. Corresponds to the input of the specification's `Start` command:
 * `sessions` is its `sessions` (how many sessions interpret a component), `attemptsPerSession` is its
 * `maxAttempts` (how many attempts a session has). Both are whole numbers.
 */
export interface InterpretLimits {
  readonly sessions: number;
  readonly attemptsPerSession: number;
}

/**
 * What is known about a component offered for acceptance. Corresponds to the input of the specification's
 * `ConsiderAccepting` command, member for member.
 */
export interface AcceptCandidate {
  /** The command's `hasDraft`: whether the component has a draft. */
  readonly hasDraft: boolean;
  /** The command's `hasInterpretation`: whether the component has an accepted interpretation. */
  readonly hasInterpretation: boolean;
  /**
   * The command's `openReviews`: how many questions or disagreements are left open on the draft (or, without
   * a draft, on the interpretation). A whole number.
   */
  readonly openReviews: number;
  /** The command's `stampCurrent`: whether the interpretation's stamp is the current Layer 1. */
  readonly stampCurrent: boolean;
}

/**
 * Dependency: the list of components, walked in name order. Each call asks for the next command to be sent
 * back to the flow; the flow does not wait for it.
 */
export interface ComponentCursor {
  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `ConsiderNext` effect (no payload): the next component is to be
   * offered through `InterpretFlow.consider`, or `InterpretFlow.noMoreComponents` called if there is none.
   */
  considerNext(): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `NextToAccept` effect (no payload): the next component of the round is
   * to be offered through `InterpretFlow.considerAccepting`, or `InterpretFlow.endRound` called if there is
   * none left in this round.
   */
  nextToAccept(): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `RetryRefused` effect (no payload): the next round is to run over the
   * components that were not accepted.
   */
  retryRefused(): void;
}

/** Dependency: the checker of interpretations, run without an agent. */
export interface InterpretationChecker {
  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `CheckCurrent` effect (no payload): the current interpretation of the
   * component being considered is to be checked, and the verdict reported through
   * `InterpretFlow.currentChecked`.
   */
  checkCurrent(): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `CheckDraft` effect (no payload): the draft (or the re-stamped
   * interpretation) of the component being accepted is to be checked, and the verdict reported through
   * `InterpretFlow.draftChecked`.
   */
  checkDraft(): void;
}

/** Dependency: the launcher of interpretation sessions. */
export interface SessionRunner {
  /**
   * Called synchronously, from inside the command that performs it, once per attempt started.
   * Corresponds to the specification's `StartSession` effect; the arguments are its payload's `session`,
   * `attempt` and `mode`. The end of the attempt is reported through `InterpretFlow.sessionChecked`.
   */
  startSession(session: number, attempt: number, mode: SessionMode): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `Compare` effect; the argument is its payload's `session`. The end of
   * the comparison is reported through `InterpretFlow.compared`.
   */
  compare(session: number): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `RecordUncompared` effect; the argument is its payload's `session`.
   */
  recordUncompared(session: number): void;
}

/** Dependency: the keeper of accepted interpretations. */
export interface Acceptance {
  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `Accept` effect (no payload): the component being accepted is
   * accepted.
   */
  accept(): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `RefuseAccepting` effect; the argument is its payload's `reason`.
   */
  refuse(reason: RefusalReason): void;
}

/** Dependency: told when interpreting or accepting is over. */
export interface FlowReporter {
  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `Finish` effect; the argument is its payload's `status`.
   */
  finish(status: FinishStatus): void;

  /**
   * Called synchronously, from inside the command that performs it.
   * Corresponds to the specification's `AcceptingDone` effect (no payload).
   */
  acceptingDone(): void;
}
