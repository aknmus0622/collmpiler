import { component, description, does, from, goTo, input, integer, optional, otherwise, output, record, responds, when } from "@clp/core";
import { Policy } from "./loan.decisions.ts";

// The loan of one book at a library. Written roughly on purpose: the vocabulary is prose, and so is most of
// what the commands do. What the prose means is derived by `clp interpret`.
export const Loan = component({
  description:
    "The loan of one book to a library member. The member is not identified here. " +
    "There is no clock: time is counted only by the days that the DayPasses command reports, and the loan " +
    "remembers how many days remain until the book is due (negative once it is past due). " +
    "The numbers (how many books, how many days, the fees) are in the policy table.",

  states: ["AVAILABLE", "ON_LOAN", "OVERDUE", "LOST"],
  init: "AVAILABLE",

  queries: description("How many books the member currently has on loan, and whether someone else has reserved the book."),
  effects: description(
    "A due-date notice to the member, carrying the number of days until the book is due; " +
    "a late-fee charge, carrying the amount in yen; a notice to the next member waiting, carrying nothing; " +
    "and a replacement charge, carrying nothing.",
  ),

  decisions: { policy: Policy },

  calculations: {
    lateFee: component(
      description("The number of days the book is past its due date, times the fee per day, but at most the fee cap."),
      output("integer"),
    ),
  },

  commands: {
    // Pinned down as structure: two interpretations disagreed on whether a borrowing that is not allowed is
    // "not possible" or "possible, and nothing happens". It is the second: a refusal is an outcome.
    // (Written as a precondition with `onlyIf`, the limit would be outside what is verified, and the code would
    // not have to check it at all.)
    // The command answers whoever executed it: a refusal is told as a result, and is verified as one.
    Borrow: component(
      from("AVAILABLE"),
      output(record({ result: ["lent", "refused"], dueInDays: optional("integer") })),
      when(
        "The member already holds at least the policy's maximum number of books, or someone else has reserved the book",
        responds({ result: "refused", dueInDays: null }),
        does("The borrowing is refused; nothing changes."),
      ),
      otherwise(
        goTo("ON_LOAN"),
        does(
          "The book is due in the policy's loan days. The member is told the due date. " +
            "The answer is lent, with the number of days until the book is due.",
        ),
      ),
    ),

    Extend: component(
      from("ON_LOAN"),
      output(["extended", "refused"]),
      when("The book is reserved by someone else", responds("refused"), does("The extension is refused; nothing changes.")),
      otherwise(
        does(
          "The due date moves later by the policy's extension days, counted from the current due date. " +
            "The member is told the new due date. A loan can be extended any number of times. The answer is extended.",
        ),
      ),
    ),

    DayPasses: component(
      input({ days: integer({ min: 1, max: 30 }) }),
      from("ON_LOAN", "OVERDUE"),
      does(
        "The given number of days passes. A loan is past its due date when fewer than zero days remain; on the due day itself it is not. " +
          "A loan past its due date becomes overdue. A book past its due date by more than the policy's lost-after days is " +
          "considered lost, and the member is charged for a replacement; that happens once, when the book becomes lost.",
      ),
    ),

    Return: description(
      "A book on loan or overdue can be returned; a lost book cannot. The book becomes available. " +
        "Returning an overdue book is charged the late fee. Then, if someone else has reserved the book, the next member waiting is notified.",
    ),
  },
});
