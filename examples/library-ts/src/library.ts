/**
 * The dependencies of a loan. Together these three interfaces stand for the specification's external
 * component `loan-world`: each of its queries and commands is one method below.
 */

/** The borrowing member's account. */
export interface MemberAccount {
  /**
   * The number of books this member has on loan right now (spec query `loan-world.BooksOnLoan`).
   * May be asked by `Loan.borrow`.
   */
  booksOnLoan(): number;

  /**
   * Sends the member a due-date notice (spec command `loan-world.NotifyDue`); `daysUntilDue` is that
   * command's argument of the same name.
   * May be told by `Loan.borrow` and by `Loan.extend`.
   */
  sendDueNotice(daysUntilDue: number): void;
}

/** The reservation list of the book. */
export interface Reservations {
  /**
   * Whether another member holds a reservation on the book (spec query `loan-world.ReservedBySomeoneElse`).
   * May be asked by `Loan.borrow`, `Loan.extend` and `Loan.giveBack`.
   */
  isReservedBySomeoneElse(): boolean;

  /**
   * Tells the next waiting member (spec command `loan-world.NotifyNextMember`; no arguments).
   * May be told by `Loan.giveBack`.
   */
  notifyNextMember(): void;
}

/** Charges to the member. */
export interface Billing {
  /**
   * Charges a late fee of `yen` yen (spec command `loan-world.ChargeLateFee`, argument `yen`).
   * May be told by `Loan.giveBack`.
   */
  chargeLateFee(yen: number): void;

  /**
   * Charges for a replacement copy of the book (spec command `loan-world.ChargeReplacement`; no arguments).
   * May be told by `Loan.daysPass`.
   */
  chargeReplacement(): void;
}

/** Everything a `Loan` is given from outside (spec `loan-world`). */
export interface LibraryServices {
  readonly member: MemberAccount;
  readonly reservations: Reservations;
  readonly billing: Billing;
}
