/**
 * The dependencies of a loan: what it asks its environment and what it tells it. All of them are
 * supplied from outside when a `Loan` is constructed (see `LoanDependencies`).
 *
 * The answers of the two questions (`MemberAccount.booksOnLoan`, `ReservationDesk.isReservedBySomeoneElse`)
 * can change between commands. A loan asks at the moment it needs the answer and never caches it, and it
 * may skip a question whose answer cannot matter.
 */

/** The library account of the member this loan belongs to. */
export interface MemberAccount {
  /**
   * How many books the member currently has on loan, as a whole number.
   * Corresponds to the specification query `booksOnLoan`. Asked by `Loan.borrow`.
   */
  booksOnLoan(): number;
}

/** The reservation desk, for the book this loan is about. */
export interface ReservationDesk {
  /**
   * Whether a member other than the one of this loan has reserved the book.
   * Corresponds to the specification query `reservedBySomeoneElse`. Asked by `Loan.borrow`,
   * `Loan.extend` and `Loan.returnBook`.
   */
  isReservedBySomeoneElse(): boolean;

  /**
   * Tells the next member waiting for the book that it is their turn. Carries nothing.
   * Corresponds to the specification effect `NextMemberNotice`. May be called by `Loan.returnBook`.
   */
  notifyNextMember(): void;
}

/** The channel through which the member of this loan is told things. */
export interface MemberNotifier {
  /**
   * Tells the member when the book is due.
   * Corresponds to the specification effect `DueDateNotice`. May be called by `Loan.borrow` and
   * `Loan.extend`.
   *
   * @param daysUntilDue The number of days from now until the book is due, a whole number
   *   (the effect's `daysUntilDue` payload field).
   */
  notifyDueDate(daysUntilDue: number): void;
}

/** The billing system that charges the member of this loan. */
export interface Billing {
  /**
   * Charges the member a late fee.
   * Corresponds to the specification effect `LateFeeCharge`. May be called by `Loan.returnBook`.
   *
   * @param amountYen The amount in yen, a whole number (the effect's `amount` payload field).
   */
  chargeLateFee(amountYen: number): void;

  /**
   * Charges the member for a replacement copy of the book. Carries nothing.
   * Corresponds to the specification effect `ReplacementCharge`. May be called by `Loan.daysPass`.
   */
  chargeReplacement(): void;
}

/** Everything a `Loan` needs from its environment. */
export interface LoanDependencies {
  readonly memberAccount: MemberAccount;
  readonly reservationDesk: ReservationDesk;
  readonly memberNotifier: MemberNotifier;
  readonly billing: Billing;
}
