/**
 * The numbers a loan works with.
 * Corresponds to the specification's decision table `policy`; each field has the same name there.
 */
export interface LoanPolicy {
  /** Spec field `maxBooks`: a count of books, used when deciding a borrow request. */
  readonly maxBooks: number;
  /** Spec field `loanDays`: a number of days, used when a book is lent. */
  readonly loanDays: number;
  /** Spec field `extensionDays`: a number of days, used when a loan is extended. */
  readonly extensionDays: number;
  /** Spec field `lostAfterDays`: a number of days, used when days pass. */
  readonly lostAfterDays: number;
  /** Spec field `feePerDay`: an amount in yen, used for the late fee on a return. */
  readonly feePerDay: number;
  /** Spec field `feeCap`: an amount in yen, used for the late fee on a return. */
  readonly feeCap: number;
}

/**
 * The policy in force (the result of the specification's decision table `policy`, which takes no input).
 * Returns a new record on each call.
 */
export function libraryPolicy(): LoanPolicy {
  return { maxBooks: 3, loanDays: 14, extensionDays: 7, lostAfterDays: 30, feePerDay: 100, feeCap: 1000 };
}
