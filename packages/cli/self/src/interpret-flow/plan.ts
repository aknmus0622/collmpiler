import type { AcceptCandidate, SessionMode, SessionOutcome } from "./types.ts";

/**
 * Where the running session stands. Assembled from the flow's remembered data (`data.runningSession`,
 * `data.runningAttempt`, `data.sessionCount`, `data.attemptLimit`, `data.startsFromCurrent`).
 */
export interface SessionProgress {
  readonly session: number;
  readonly attempt: number;
  readonly sessionCount: number;
  readonly attemptLimit: number;
  readonly startsFromCurrent: boolean;
}

/**
 * What follows the end of an attempt. Names the outcome of the specification's `SessionChecked` command
 * that applies, by what it does:
 *
 * - `"retry"`: starts the next attempt of the same session;
 * - `"fail"`: finishes as `failed`;
 * - `"skip-session"`: records the session as uncompared and starts the next session;
 * - `"compare"`: has the session compared;
 * - `"finish"`: finishes as `interpreted`;
 * - `"second-session"`: starts session 2;
 * - `"skip-and-finish"`: records the session as uncompared and finishes as `interpreted` (the `otherwise`
 *   row).
 */
export type SessionNext =
  | "retry"
  | "fail"
  | "skip-session"
  | "compare"
  | "finish"
  | "second-session"
  | "skip-and-finish";

/**
 * What follows a comparison. Names the outcome of the specification's `Compared` command that applies:
 * `"next-session"` starts the next session, `"finish"` finishes as `interpreted`.
 */
export type ComparisonNext = "next-session" | "finish";

/**
 * What is done with a component offered for acceptance. Names the outcome of the specification's
 * `ConsiderAccepting` command that applies:
 *
 * - `"refuse-open-reviews"`: refused with reason `open-reviews`;
 * - `"refuse-no-interpretation"`: refused with reason `no-interpretation`;
 * - `"skip"`: nothing to do, the next component is asked for;
 * - `"check"`: the draft is checked (the `otherwise` row).
 */
export type AcceptDecision = "refuse-open-reviews" | "refuse-no-interpretation" | "skip" | "check";

/**
 * Pure decision. Chooses among the outcomes of `SessionChecked`.
 *
 * @param outcome the command's `outcome`
 * @param hasModel the command's `hasModel` (whether the session gave vocabulary)
 * @param progress the running session and its limits
 */
export function afterSession(outcome: SessionOutcome, hasModel: boolean, progress: SessionProgress): SessionNext {
  const firstSession = progress.session === 1;
  if (outcome !== "ok") {
    if (progress.attempt < progress.attemptLimit) {
      return "retry";
    }
    if (firstSession) {
      return "fail";
    }
    if (progress.session < progress.sessionCount) {
      return "skip-session";
    }
    return "skip-and-finish";
  }
  if (!firstSession) {
    return "compare";
  }
  if (progress.sessionCount === 1 || !hasModel) {
    return "finish";
  }
  return "second-session";
}

/**
 * Pure decision. Chooses among the outcomes of `Compared`.
 *
 * @param progress the running session and its limits
 */
export function afterComparison(progress: SessionProgress): ComparisonNext {
  return progress.session < progress.sessionCount ? "next-session" : "finish";
}

/**
 * Pure decision. Chooses among the outcomes of `ConsiderAccepting`.
 *
 * @param candidate the command's input
 */
export function decideAccepting(candidate: AcceptCandidate): AcceptDecision {
  const hasInterpretation = candidate.hasDraft || candidate.hasInterpretation;
  if (!hasInterpretation) {
    return "refuse-no-interpretation";
  }
  if (candidate.openReviews > 0) {
    return "refuse-open-reviews";
  }
  if (!candidate.hasDraft && candidate.stampCurrent) {
    return "skip";
  }
  return "check";
}

/**
 * Pure decision. Chooses between the outcomes of `EndRound`: `true` for the one that runs another round,
 * `false` for the one that ends accepting.
 *
 * @param acceptedInRound `data.acceptedInRound`
 * @param failedInRound `data.failedInRound`
 */
export function anotherRound(acceptedInRound: boolean, failedInRound: boolean): boolean {
  return acceptedInRound && failedInRound;
}

/**
 * Pure calculation. Corresponds to the specification's `nextAttempt`.
 *
 * @param attempt the running attempt (`data.runningAttempt`)
 */
export function nextAttempt(attempt: number): number {
  return attempt + 1;
}

/**
 * Pure calculation. Corresponds to the specification's `nextSession`.
 *
 * @param session the running session (`data.runningSession`)
 */
export function nextSession(session: number): number {
  return session + 1;
}

/**
 * Pure calculation. Corresponds to the specification's `sessionMode`.
 *
 * @param session the running session (`data.runningSession`)
 * @param startsFromCurrent `data.startsFromCurrent`
 */
export function sessionMode(session: number, startsFromCurrent: boolean): SessionMode {
  if (session > 1) {
    return "pinned";
  }
  return startsFromCurrent ? "update" : "skeleton";
}

/**
 * Pure calculation. Corresponds to the specification's `acceptedAfterCheck`.
 *
 * @param acceptedInRound `data.acceptedInRound`
 * @param passed the `passed` of the `DraftChecked` command
 */
export function acceptedAfterCheck(acceptedInRound: boolean, passed: boolean): boolean {
  return acceptedInRound || passed;
}

/**
 * Pure calculation. Corresponds to the specification's `failedAfterCheck`.
 *
 * @param failedInRound `data.failedInRound`
 * @param passed the `passed` of the `DraftChecked` command
 */
export function failedAfterCheck(failedInRound: boolean, passed: boolean): boolean {
  return failedInRound || !passed;
}
