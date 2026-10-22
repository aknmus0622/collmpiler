/** Public surface of the library component (the root of the system). */
export { Library } from "./library.ts";
export { loanPolicy, borrowOutcome, dueDate, returnOutcome, daysToCharge } from "./rules.ts";
export type { BorrowResult, ReturnResult, LoanPolicy, BorrowFacts } from "./rules.ts";
export type { Clock } from "./clock.ts";
export type { BookId, MemberId } from "../ids.ts";
