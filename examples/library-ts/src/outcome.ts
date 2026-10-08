/**
 * What the commands of a loan answer with, given back to whoever called the command. Only `Loan.borrow`
 * and `Loan.extend` answer something; the other commands answer nothing.
 */

/**
 * The answer of `Loan.borrow` (the specification's output of the `Borrow` command, a record with the
 * same two field names):
 *
 * - `result`: `"lent"` when the member now has the book, `"refused"` when the borrowing was refused.
 * - `dueInDays`: the number of days from now until the book is due, a whole number, when `result` is
 *   `"lent"`; `null` when `result` is `"refused"`.
 */
export type BorrowOutcome =
  | { readonly result: "lent"; readonly dueInDays: number }
  | { readonly result: "refused"; readonly dueInDays: null };

/**
 * The answer of `Loan.extend` (the specification's output of the `Extend` command, the same two
 * values): `"extended"` when the loan was extended, `"refused"` when the extension was refused.
 */
export type ExtendOutcome = "extended" | "refused";
