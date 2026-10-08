/**
 * The business decisions of a loan, as pure functions: they take plain values, return plain values, and
 * touch no dependency. `Loan` gathers the inputs, calls these, and carries out the result.
 *
 * In every function `daysUntilDue` is the remembered number of days until the book is due (the
 * specification's data field `daysUntilDue`), a whole number.
 */
import type { LoanPolicy } from "./policy.ts";
import type { LoanState } from "./state.ts";

/** How many days the book is past its due date; not positive while it is not past due. */
function daysPastDue(daysUntilDue: number): number {
  return -daysUntilDue;
}

/** Whether the book is past its due date. */
function isPastDue(daysUntilDue: number): boolean {
  return daysUntilDue < 0;
}

/**
 * Decides whether the specification's `Borrow` command is refused because of the member's other loans.
 *
 * @param booksOnLoan How many books the member currently has on loan, a whole number.
 * @param policy The lending policy.
 * @returns Whether the member has reached the maximum.
 */
export function holdsMaxBooks(booksOnLoan: number, policy: LoanPolicy): boolean {
  return booksOnLoan >= policy.maxBooks;
}

/**
 * The specification calculation `daysUntilDueAfterDaysPass`.
 *
 * @param daysUntilDue The days until due before the days pass.
 * @param days The number of days that pass (the `days` input of the `DayPasses` command).
 * @returns The days until due afterwards, a whole number.
 */
export function daysUntilDueAfterDaysPass(daysUntilDue: number, days: number): number {
  return daysUntilDue - days;
}

/**
 * The specification calculation `daysUntilDueAfterExtension`.
 *
 * @param daysUntilDue The days until due before the extension.
 * @param policy The lending policy.
 * @returns The days until due after the extension, a whole number.
 */
export function daysUntilDueAfterExtension(daysUntilDue: number, policy: LoanPolicy): number {
  return daysUntilDue + policy.extensionDays;
}

/**
 * The specification calculation `lateFee`.
 *
 * @param daysUntilDue The days until due at the moment the book is returned.
 * @param policy The lending policy.
 * @returns The late fee in yen, a whole number.
 */
export function lateFee(daysUntilDue: number, policy: LoanPolicy): number {
  return Math.min(daysPastDue(daysUntilDue) * policy.feePerDay, policy.feeCap);
}

/**
 * Decides which branch of the specification's `DayPasses` command applies, expressed as the state the
 * loan is in once the days have passed.
 *
 * @param current The state before the days passed (a state in which the book is lent out).
 * @param daysUntilDue The days until due after the days have passed, i.e. the result of
 *   `daysUntilDueAfterDaysPass`.
 * @param policy The lending policy.
 * @returns The state afterwards; equal to `current` when the state does not change.
 */
export function stateAfterDaysPass(current: LoanState, daysUntilDue: number, policy: LoanPolicy): LoanState {
  if (daysPastDue(daysUntilDue) > policy.lostAfterDays) {
    return "LOST";
  }
  if (isPastDue(daysUntilDue)) {
    return "OVERDUE";
  }
  return current;
}
