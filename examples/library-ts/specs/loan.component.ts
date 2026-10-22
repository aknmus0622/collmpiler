import { decisions, does, init, is, otherwise, requires, service } from "@clp/core";
import type { Int } from "@clp/core";

// The library's rules, as numbers. They apply always, so the table has only `otherwise`.
// Values written here reach the generated code without passing through the interpretation: changing one
// does not require interpreting again.
export const Policy = decisions("The library's policy", () => [
  // maxBooks: a member holding this many books cannot borrow another. feePerDay / feeCap: yen per day late, and the
  // most a late fee can be. lostAfterDays: a book more than this many days past its due date is considered lost.
  [otherwise, { maxBooks: 3, loanDays: 14, extensionDays: 7, feePerDay: 100, feeCap: 1000, lostAfterDays: 30 }],
]);

// The loan of one book at a library. Written roughly on purpose: the world around it is prose, and so is most of
// what the commands do. What the prose means is derived by `clp interpret`.
export const Loan = service(
  "The loan of one book to a library member. The member is not identified here. " +
    "There is no clock: time is counted only by the days that the DayPasses command reports, and the loan " +
    "remembers how many days remain until the book is due (negative once it is past due). " +
    `The numbers (how many books, how many days, the fees) are in the policy table, ${Policy}. ` +
    "It asks the world around it how many books the member currently has on loan, and whether someone else has reserved the book. " +
    "It tells the world around it: a due-date notice to the member, carrying the number of days until the book is due; " +
    "a late-fee charge, carrying the amount in yen; a notice to the next member waiting, carrying nothing; " +
    "and a replacement charge, carrying nothing.",
  {
    state: {
      status: init<"AVAILABLE" | "ON_LOAN" | "OVERDUE" | "LOST">("AVAILABLE"),
    },
    commands: {
      // Pinned down as structure: two interpretations disagreed on whether a borrowing that is not allowed is
      // "not possible" or "possible, and nothing happens". It is the second: a refusal is an answer.
      // (Written with `requires`, the limit would be outside what is verified, and the code would not have to check
      // it at all.)
      Borrow(): { result: "lent" | "refused"; dueInDays: Int | null } {
        requires(this.status === "AVAILABLE");
        if (is.atLimitOrReserved("The member already holds at least the policy's maximum number of books, or someone else has reserved the book")) {
          return { result: "refused", dueInDays: null };
        }
        this.status = "ON_LOAN";
        return does.lend("The book is due in the policy's loan days. The member is told the due date. The answer is lent, with the number of days until the book is due.");
      },
      Extend(): "extended" | "refused" {
        requires(this.status === "ON_LOAN");
        if (is.reservedBySomeoneElse("The book is reserved by someone else")) return "refused";
        return does.extend(
          "The due date moves later by the policy's extension days, counted from the current due date. " +
            "The member is told the number of days until the new due date. A loan can be extended any number of times. The answer is extended.",
        );
      },
      DayPasses(days: Int) {
        requires((this.status === "ON_LOAN" || this.status === "OVERDUE") && days >= 1 && days <= 30);
        does.daysPass(
          "The given number of days passes. A loan is past its due date when fewer than zero days remain; on the due day itself it is not. " +
            "A loan past its due date becomes overdue. A book past its due date by more than the policy's lost-after days is " +
            "considered lost, and the member is charged for a replacement; that happens once, when the book becomes lost.",
        );
      },
      // Pinned down after the first interpretation asked what returning answers
      Return(): "returned" | "refused" {
        requires(this.status !== "AVAILABLE");
        return does.giveBack(
          "A book on loan or overdue is returned, and the answer is returned; a lost book cannot be returned: the answer is refused, " +
            "and nothing changes. A returned book becomes available. Returning an overdue book is charged the late fee: the number " +
            "of days the book is past its due date, times the fee per day, but at most the fee cap. Then, if someone else has " +
            "reserved the book, the next member waiting is notified.",
        );
      },
    },
  },
);
