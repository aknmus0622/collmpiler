import { libraryLoanPolicy } from "./policy.ts";
import type { LoanPolicy } from "./policy.ts";
import type { LoanDependencies } from "./ports.ts";
import {
  daysUntilDueAfterDaysPass,
  daysUntilDueAfterExtension,
  holdsMaxBooks,
  lateFee,
  stateAfterDaysPass,
} from "./rules.ts";
import type { LoanState } from "./state.ts";

/**
 * The loan of one book to one library member (the specification's component).
 *
 * A loan has no clock: time advances only when `daysPass` is called. The four methods `borrow`,
 * `daysPass`, `extend` and `returnBook` are the specification's commands; each runs synchronously, and
 * any question to or call on a dependency happens during that call, effects in the order the
 * specification lists them. The current state is read through `state`, and the remembered data through
 * `daysUntilDue`.
 *
 * A newly constructed loan is in the specification's initial state and remembers nothing. Constructing
 * a loan asks and tells the dependencies nothing.
 *
 * Each command is meant to be called only in the states named in its description; what it does in any
 * other state is not defined.
 */
export class Loan {
  private readonly dependencies: LoanDependencies;
  private readonly policy: LoanPolicy;
  private currentState: LoanState;
  private remainingDays: number | undefined;

  /**
   * @param dependencies The member's account, the reservation desk, the member notifier and billing
   *   that this loan asks and tells. See `LoanDependencies`.
   */
  constructor(dependencies: LoanDependencies) {
    this.dependencies = dependencies;
    this.policy = libraryLoanPolicy();
    this.currentState = "AVAILABLE";
    this.remainingDays = undefined;
  }

  /** The current state of the loan, under the specification's state names. See `LoanState`. */
  get state(): LoanState {
    return this.currentState;
  }

  /**
   * The remembered number of days until the book is due (the specification's data field
   * `daysUntilDue`), a whole number. `undefined` as long as nothing has been remembered, i.e. before
   * the book is first borrowed. The value is not cleared when the book is returned.
   */
  get daysUntilDue(): number | undefined {
    return this.remainingDays;
  }

  /**
   * The specification command `Borrow` (no input): the member borrows the book.
   * For a loan in state `"AVAILABLE"`. The borrowing is refused when the member already holds at least
   * the policy's maximum number of books, or someone else has reserved the book; a request that is
   * refused changes nothing and is not an error.
   *
   * Asks `MemberAccount.booksOnLoan` and, unless the member has reached the maximum,
   * `ReservationDesk.isReservedBySomeoneElse`; may call `MemberNotifier.notifyDueDate`.
   */
  borrow(): void {
    const { memberAccount, reservationDesk } = this.dependencies;
    if (holdsMaxBooks(memberAccount.booksOnLoan(), this.policy) || reservationDesk.isReservedBySomeoneElse()) {
      return;
    }
    const daysUntilDue = this.policy.loanDays;
    this.currentState = "ON_LOAN";
    this.remainingDays = daysUntilDue;
    this.dependencies.memberNotifier.notifyDueDate(daysUntilDue);
  }

  /**
   * The specification command `DayPasses`: the given number of days goes by.
   * For a loan in state `"ON_LOAN"` or `"OVERDUE"`.
   *
   * Asks nothing; may call `Billing.chargeReplacement`.
   *
   * @param days How many days pass, a whole number of at least one (the command's `days` input).
   */
  daysPass(days: number): void {
    const daysUntilDue = daysUntilDueAfterDaysPass(this.lentDaysUntilDue(), days);
    const after = stateAfterDaysPass(this.currentState, daysUntilDue, this.policy);
    this.currentState = after;
    this.remainingDays = daysUntilDue;
    if (after === "LOST") {
      this.dependencies.billing.chargeReplacement();
    }
  }

  /**
   * The specification command `Extend` (no input): the member asks for more time.
   * For a loan in state `"ON_LOAN"`. A request that is refused changes nothing and is not an error.
   *
   * Asks `ReservationDesk.isReservedBySomeoneElse`; may call `MemberNotifier.notifyDueDate`.
   */
  extend(): void {
    const { reservationDesk, memberNotifier } = this.dependencies;
    if (reservationDesk.isReservedBySomeoneElse()) {
      return;
    }
    const daysUntilDue = daysUntilDueAfterExtension(this.lentDaysUntilDue(), this.policy);
    this.remainingDays = daysUntilDue;
    memberNotifier.notifyDueDate(daysUntilDue);
  }

  /**
   * The specification command `Return` (no input): the member brings the book back.
   * For a loan in state `"ON_LOAN"` or `"OVERDUE"`.
   *
   * Asks `ReservationDesk.isReservedBySomeoneElse`; may call `Billing.chargeLateFee` and
   * `ReservationDesk.notifyNextMember`, in that order.
   */
  returnBook(): void {
    const { reservationDesk, billing } = this.dependencies;
    const wasOverdue = this.currentState === "OVERDUE";
    const daysUntilDue = this.lentDaysUntilDue();
    this.currentState = "AVAILABLE";
    if (wasOverdue) {
      billing.chargeLateFee(lateFee(daysUntilDue, this.policy));
    }
    if (reservationDesk.isReservedBySomeoneElse()) {
      reservationDesk.notifyNextMember();
    }
  }

  /** The remembered days until due of a book that is lent out; it is always known in those states. */
  private lentDaysUntilDue(): number {
    if (this.remainingDays === undefined) {
      throw new Error(`no due date is remembered for a loan in state ${this.currentState}`);
    }
    return this.remainingDays;
  }
}
