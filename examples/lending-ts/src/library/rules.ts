/**
 * Pure business rules of the library component, kept apart from the stateful
 * `Library` so they can be reasoned about on their own. None of these touch
 * state or dependencies: the caller gathers the facts and applies the answer.
 */

/**
 * What command `Borrow` answers (specification output of `library.Borrow`).
 * - `"not-member"`: the borrower is not a registered member; nothing changed.
 * - `"unpaid"`: the borrower has unpaid fines; nothing changed.
 * - `"on-loan"`: the book is already lent to someone; nothing changed.
 * - `"limit"`: the borrower already holds as many books as allowed; nothing changed.
 * - `"lent"`: the book is now lent to the borrower, with a due date recorded.
 */
export type BorrowResult = "not-member" | "unpaid" | "on-loan" | "limit" | "lent";

/**
 * What command `Return` answers (specification output of `library.Return`).
 * - `"not-lent"`: the book was not on loan; nothing changed.
 * - `"returned"`: the loan is closed; a fine may have been charged.
 */
export type ReturnResult = "not-lent" | "returned";

/**
 * The lending terms that apply to one member (specification decision table
 * `policy`, its result record).
 */
export interface LoanPolicy {
  /** How many days a loan lasts before it is due (specification `loanDays`). */
  readonly loanDays: number;
  /** How many books the member may hold at once (specification `maxBooks`). */
  readonly maxBooks: number;
}

/**
 * Everything `borrowOutcome` needs to know, as observed before the request.
 */
export interface BorrowFacts {
  /** Whether the borrower is registered, as `Members.isMember` answers. */
  readonly isMember: boolean;
  /** What the borrower owes in fines (whole yen), as `Fines.owed` answers. */
  readonly owed: number;
  /** Whether the requested book is currently lent to anyone. */
  readonly bookOnLoan: boolean;
  /** How many books the borrower currently holds. */
  readonly booksHeld: number;
  /** The borrower's lending terms, as {@link loanPolicy} answers for them. */
  readonly policy: LoanPolicy;
}

/** Terms for extended members (first row of decision table `policy`). */
const EXTENDED_POLICY: LoanPolicy = { loanDays: 28, maxBooks: 3 };

/** Terms for every other member (last row of decision table `policy`). */
const STANDARD_POLICY: LoanPolicy = { loanDays: 14, maxBooks: 2 };

/**
 * Decision table `policy`: the lending terms for a member.
 *
 * @param isExtended whether the member is an extended member, as
 *   `Members.isExtended` answers for them at that moment.
 */
export function loanPolicy(isExtended: boolean): LoanPolicy {
  return isExtended ? EXTENDED_POLICY : STANDARD_POLICY;
}

/**
 * Decides the answer of a borrow request (which event of `Borrow` happens).
 *
 * @param facts the situation before the request.
 * @returns the answer of `Borrow`; `"lent"` means the caller must record the
 *   loan and its due date (see {@link dueDate}).
 */
export function borrowOutcome(facts: BorrowFacts): BorrowResult {
  if (!facts.isMember) return "not-member";
  if (facts.owed > 0) return "unpaid";
  if (facts.bookOnLoan) return "on-loan";
  if (facts.booksHeld >= facts.policy.maxBooks) return "limit";
  return "lent";
}

/**
 * The due date to record for a new loan.
 *
 * @param today today's date (days since 1970-01-01), as `Clock.today` answers.
 * @param policy the borrower's lending terms.
 * @returns the due date, in days since 1970-01-01.
 */
export function dueDate(today: number, policy: LoanPolicy): number {
  return today + policy.loanDays;
}

/**
 * Decides the answer of a return request (which event of `Return` happens).
 *
 * @param isLent whether the book is currently on loan, before the request.
 * @returns the answer of `Return`; `"returned"` means the caller must close
 *   the loan and settle any fine (see {@link daysToCharge}).
 */
export function returnOutcome(isLent: boolean): ReturnResult {
  return isLent ? "returned" : "not-lent";
}

/**
 * Whether a returned book incurs a fine, and for how many days
 * (specification condition `late` and the `days` argument of `fines.Charge`).
 *
 * @param today today's date (days since 1970-01-01), as `Clock.today` answers.
 * @param due the due date recorded for the loan being closed.
 * @returns the number of days to pass to `Fines.charge` for the borrower, or
 *   `null` when nothing is to be charged.
 */
export function daysToCharge(today: number, due: number): number | null {
  return today > due ? today - due : null;
}
