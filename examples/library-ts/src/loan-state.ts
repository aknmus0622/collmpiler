/**
 * The book's standing: the specification's state field `status`, with the same value names.
 * - `"AVAILABLE"`: not lent; the book can be asked for.
 * - `"ON_LOAN"`: lent, not overdue.
 * - `"OVERDUE"`: lent and overdue.
 * - `"LOST"`: lent and now treated as lost.
 */
export type LoanStatus = "AVAILABLE" | "ON_LOAN" | "OVERDUE" | "LOST";

/** Everything one loan remembers (the specification's state of component `loan`). */
export interface LoanState {
  /** Spec field `status`. */
  readonly status: LoanStatus;
  /** Spec field `daysUntilDue`: a signed count of days relative to the due date. */
  readonly daysUntilDue: number;
}

/** The state a loan starts in (the specification's `init`). */
export function initialLoanState(): LoanState {
  return { status: "AVAILABLE", daysUntilDue: 0 };
}
