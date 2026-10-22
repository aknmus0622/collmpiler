/**
 * One book's loan (the specification's root component `loan`).
 *
 * Each instance is kept in memory only and starts in the state of `initialLoanState()` (spec `init`).
 * Days advance only through `daysPass`.
 */
import type { LibraryServices } from "./library.ts";
import type { LoanState, LoanStatus } from "./loan-state.ts";
import { initialLoanState } from "./loan-state.ts";
import type { LoanPolicy } from "./policy.ts";
import { libraryPolicy } from "./policy.ts";
import {
  afterDaysPass,
  canGiveBack,
  extendedState,
  lateFeeOnReturn,
  lentState,
  mustRefuseBorrow,
  mustRefuseExtension,
  returnedState,
} from "./loan-rules.ts";

/** The answer of `Loan.borrow` (output of spec command `Borrow`; same field names). */
export interface BorrowResult {
  /** `"lent"` or `"refused"`. */
  readonly result: "lent" | "refused";
  /** A number of days, or `null`. */
  readonly dueInDays: number | null;
}

/** The answer of `Loan.extend` (output of spec command `Extend`). */
export type ExtendResult = "extended" | "refused";

/** The answer of `Loan.giveBack` (output of spec command `Return`). */
export type GiveBackResult = "returned" | "refused";

export class Loan {
  readonly #library: LibraryServices;
  #state!: LoanState;

  /**
   * @param library the member account, reservations and billing (spec `loan-world`).
   *   They are asked and told only during the commands below, never in the constructor.
   */
  constructor(library: LibraryServices) {
    this.#library = library;
    this.#state = initialLoanState();
  }

  /** The current state (spec fields `status` and `daysUntilDue`). Reading it changes nothing. */
  get state(): LoanState {
    return this.#state;
  }

  /** The current spec field `status`; same as `state.status`. */
  get status(): LoanStatus {
    return this.#state.status;
  }

  /** The current spec field `daysUntilDue`; same as `state.daysUntilDue`. */
  get daysUntilDue(): number {
    return this.#state.daysUntilDue;
  }

  /**
   * Performs spec command `Borrow` (no parameters) and returns its output.
   * May ask `member.booksOnLoan()` and `reservations.isReservedBySomeoneElse()`;
   * may tell `member.sendDueNotice(...)`.
   */
  borrow(): BorrowResult {
    const policy = this.#policy();
    const booksOnLoan = this.#library.member.booksOnLoan();
    const reserved = this.#library.reservations.isReservedBySomeoneElse();
    if (mustRefuseBorrow(booksOnLoan, reserved, policy)) {
      return { result: "refused", dueInDays: null };
    }
    this.#state = lentState(policy);
    this.#library.member.sendDueNotice(this.#state.daysUntilDue);
    return { result: "lent", dueInDays: this.#state.daysUntilDue };
  }

  /**
   * Performs spec command `DayPasses`; `days` is its parameter of the same name. Answers nothing.
   * May tell `billing.chargeReplacement()`.
   */
  daysPass(days: number): void {
    const outcome = afterDaysPass(this.#state, days, this.#policy());
    this.#state = outcome.state;
    if (outcome.chargeReplacement) {
      this.#library.billing.chargeReplacement();
    }
  }

  /**
   * Performs spec command `Extend` (no parameters) and returns its output.
   * May ask `reservations.isReservedBySomeoneElse()`; may tell `member.sendDueNotice(...)`.
   */
  extend(): ExtendResult {
    if (mustRefuseExtension(this.#library.reservations.isReservedBySomeoneElse())) {
      return "refused";
    }
    this.#state = extendedState(this.#state, this.#policy());
    this.#library.member.sendDueNotice(this.#state.daysUntilDue);
    return "extended";
  }

  /**
   * Performs spec command `Return` (no parameters) and returns its output.
   * May tell `billing.chargeLateFee(...)`; may ask `reservations.isReservedBySomeoneElse()` and
   * tell `reservations.notifyNextMember()`.
   */
  giveBack(): GiveBackResult {
    const before = this.#state;
    if (!canGiveBack(before)) {
      return "refused";
    }
    const fee = lateFeeOnReturn(before, this.#policy());
    this.#state = returnedState(before);
    if (fee !== null) {
      this.#library.billing.chargeLateFee(fee);
    }
    if (this.#library.reservations.isReservedBySomeoneElse()) {
      this.#library.reservations.notifyNextMember();
    }
    return "returned";
  }

  /** The policy this loan applies (spec decision table `policy`). */
  #policy(): LoanPolicy {
    return libraryPolicy();
  }
}
