import type { BookId, MemberId } from "../ids.ts";
import { Fines } from "../fines/index.ts";
import { Members } from "../members/index.ts";
import type { Clock } from "./clock.ts";
import { borrowOutcome, daysToCharge, dueDate, loanPolicy, returnOutcome } from "./rules.ts";
import type { BorrowResult, ReturnResult } from "./rules.ts";

/**
 * The library (specification component `library`, the root of the system).
 *
 * Lends books to members, takes them back, and charges late fines. It owns
 * the two components it contains, a {@link Members} registry and a
 * {@link Fines} ledger, which it creates itself in their initial state and
 * exposes as {@link Library.members} and {@link Library.fines}. The commands
 * and queries of those components are reached through these properties.
 *
 * Its own state is held in memory; nothing is persisted, so a new instance
 * starts in the specification's initial state (no loans).
 *
 * Entry points of the whole system:
 * - {@link Library.borrow} performs command `library.Borrow`.
 * - {@link Library.returnBook} performs command `library.Return`.
 * - {@link Library.loansOf} answers query `library.LoansOf`.
 * - `library.fines.pay` performs `fines.Pay`; `library.fines.owed` answers `fines.Owed`.
 * - `library.members.register` / `.extend` perform `members.Register` / `members.Extend`;
 *   `library.members.isMember` / `.isExtended` answer `members.IsMember` / `members.IsExtended`.
 *
 * Dependency: the {@link Clock}, asked for today's date by `borrow` (to set
 * the due date) and by `returnBook` (to tell whether the return is late).
 */
export class Library {
  /** The contained `members` component: who is a member, who is extended. */
  readonly members: Members;

  /** The contained `fines` component: what each member owes. `returnBook` charges it. */
  readonly fines: Fines;

  /** The outside world's calendar. */
  readonly #clock: Clock;

  /** Specification state `lentTo`: for each book on loan, the member holding it. */
  readonly #lentTo: Map<BookId, MemberId>;

  /** Specification state `dueOf`: for each book on loan, its due date (days since 1970-01-01). */
  readonly #dueOf: Map<BookId, number>;

  /**
   * Creates a library with no loans, an empty member registry and an empty
   * fines ledger.
   *
   * @param clock asked for today's date when lending and when taking a book back.
   */
  constructor(clock: Clock) {
    this.#clock = clock;
    this.members = new Members();
    this.fines = new Fines();
    this.#lentTo = new Map();
    this.#dueOf = new Map();
  }

  /**
   * Command `Borrow(book, member)`: a member asks to borrow a book.
   *
   * Consults `members` (membership and extended status), `fines` (what the
   * member owes) and its own loans; when the loan is granted, asks the clock
   * for today's date to record the due date.
   *
   * @param book the book requested (specification `book`); any identifier.
   * @param member the borrower (specification `member`); any identifier.
   * @returns the answer, see {@link BorrowResult}.
   */
  borrow(book: BookId, member: MemberId): BorrowResult {
    const policy = loanPolicy(this.members.isExtended(member));
    const result = borrowOutcome({
      isMember: this.members.isMember(member),
      owed: this.fines.owed(member),
      bookOnLoan: this.#lentTo.has(book),
      booksHeld: this.loansOf(member).size,
      policy,
    });
    if (result === "lent") {
      this.#dueOf.set(book, dueDate(this.#clock.today(), policy));
      this.#lentTo.set(book, member);
    }
    return result;
  }

  /**
   * Command `Return(book)`: a book is brought back.
   *
   * When the book is on loan, closes the loan, asks the clock for today's
   * date and, if a fine is due, tells `fines` to charge the borrower
   * (`Fines.charge(member, days)`, specification call `fines.Charge`).
   *
   * @param book the book brought back (specification `book`); any identifier.
   * @returns the answer, see {@link ReturnResult}.
   */
  returnBook(book: BookId): ReturnResult {
    const result = returnOutcome(this.#lentTo.has(book));
    if (result === "returned") {
      const member = this.#lentTo.get(book)!;
      const due = this.#dueOf.get(book)!;
      this.#lentTo.delete(book);
      this.#dueOf.delete(book);
      const days = daysToCharge(this.#clock.today(), due);
      if (days !== null) {
        this.fines.charge(member, days);
      }
    }
    return result;
  }

  /**
   * Query `LoansOf(member)`: the books currently lent to the member.
   * Reads the current state only; never changes it or asks the clock.
   *
   * @param member any member (specification `member`).
   * @returns the set of books (no particular order); empty if none.
   */
  loansOf(member: MemberId): ReadonlySet<BookId> {
    const books = new Set<BookId>();
    for (const [book, holder] of this.#lentTo) {
      if (holder === member) books.add(book);
    }
    return books;
  }
}
