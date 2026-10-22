/**
 * The decisions of a loan, as pure functions: no dependencies, no side effects.
 * `Loan` gathers the answers of its dependencies, calls these, then applies the result.
 */
import type { LoanPolicy } from "./policy.ts";
import type { LoanState } from "./loan-state.ts";

/**
 * Whether a borrow request is refused (spec condition `atLimitOrReserved`).
 * @param booksOnLoan what `MemberAccount.booksOnLoan` answered
 * @param reservedBySomeoneElse what `Reservations.isReservedBySomeoneElse` answered
 */
export function mustRefuseBorrow(booksOnLoan: number, reservedBySomeoneElse: boolean, policy: LoanPolicy): boolean {
  return booksOnLoan >= policy.maxBooks || reservedBySomeoneElse;
}

/** The state after the book is lent (assignments of spec event `Borrow.otherwise`). */
export function lentState(policy: LoanPolicy): LoanState {
  return { status: "ON_LOAN", daysUntilDue: policy.loanDays };
}

/**
 * Whether an extension request is refused (spec condition `reservedBySomeoneElse`).
 * @param reservedBySomeoneElse what `Reservations.isReservedBySomeoneElse` answered
 */
export function mustRefuseExtension(reservedBySomeoneElse: boolean): boolean {
  return reservedBySomeoneElse;
}

/** The state after an extension is granted (assignments of spec event `Extend.otherwise`). */
export function extendedState(state: LoanState, policy: LoanPolicy): LoanState {
  return { status: state.status, daysUntilDue: state.daysUntilDue + policy.extensionDays };
}

/** The result of `afterDaysPass`. */
export interface DaysPassedOutcome {
  /** The state afterwards. */
  readonly state: LoanState;
  /** Whether `Billing.chargeReplacement` is to be told (spec call `ChargeReplacement` of `DayPasses.otherwise`). */
  readonly chargeReplacement: boolean;
}

/** What follows from `days` days passing in `state` (spec event `DayPasses.otherwise`). */
export function afterDaysPass(state: LoanState, days: number, policy: LoanPolicy): DaysPassedOutcome {
  const daysUntilDue = state.daysUntilDue - days;
  const lost = daysUntilDue < -policy.lostAfterDays;
  const status = lost ? "LOST" : daysUntilDue < 0 ? "OVERDUE" : state.status;
  return { state: { status, daysUntilDue }, chargeReplacement: lost };
}

/** Whether a give-back from `state` is accepted (chooses between spec events `Return.case1` and `Return.otherwise`). */
export function canGiveBack(state: LoanState): boolean {
  return state.status !== "LOST";
}

/**
 * The amount in yen for `Billing.chargeLateFee` on an accepted give-back from `state`, or `null` when that
 * method is not to be told (spec call `ChargeLateFee` of `Return.otherwise`, argument `yen`).
 */
export function lateFeeOnReturn(state: LoanState, policy: LoanPolicy): number | null {
  if (state.status !== "OVERDUE") return null;
  return Math.min(-state.daysUntilDue * policy.feePerDay, policy.feeCap);
}

/** The state after an accepted give-back (assignments of spec event `Return.otherwise`). */
export function returnedState(state: LoanState): LoanState {
  return { status: "AVAILABLE", daysUntilDue: state.daysUntilDue };
}
