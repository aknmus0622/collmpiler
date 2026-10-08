/**
 * The lending policy: the numbers that govern a loan. Each field corresponds to the column of the same
 * name in the specification's `policy` decision table.
 */
export interface LoanPolicy {
  /** How many books a member may hold at once (specification: `policy.maxBooks`). */
  readonly maxBooks: number;
  /** The length of a new loan, in days (specification: `policy.loanDays`). */
  readonly loanDays: number;
  /** How many days one extension adds (specification: `policy.extensionDays`). */
  readonly extensionDays: number;
  /** The number of days used to decide that a book is lost (specification: `policy.lostAfterDays`). */
  readonly lostAfterDays: number;
  /** The late fee for one day, in yen (specification: `policy.feePerDay`). */
  readonly feePerDay: number;
  /** The upper limit of a late fee, in yen (specification: `policy.feeCap`). */
  readonly feeCap: number;
}

/**
 * Returns the library's lending policy, i.e. the single row of the specification's `policy` decision
 * table. `Loan` uses this policy; callers do not supply one.
 */
export function libraryLoanPolicy(): LoanPolicy {
  return {
    maxBooks: 3,
    loanDays: 14,
    extensionDays: 7,
    lostAfterDays: 30,
    feePerDay: 100,
    feeCap: 1000,
  };
}
