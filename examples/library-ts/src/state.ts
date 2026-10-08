/**
 * The lifecycle state of a loan. The names are the specification's state names, unchanged:
 *
 * - `"AVAILABLE"`: the book is not lent out and can be borrowed.
 * - `"ON_LOAN"`: the book is lent to the member.
 * - `"OVERDUE"`: the book is lent to the member and has not come back in time.
 * - `"LOST"`: the book is considered lost; no further command applies.
 */
export type LoanState = "AVAILABLE" | "ON_LOAN" | "OVERDUE" | "LOST";
