import { decisionTable } from "@clp/core";

// The library's rules, as numbers. They apply always, so the table has only `otherwise`.
// Values written here reach the generated code without passing through the interpretation: changing one
// does not require interpreting again.
export const Policy = decisionTable({
  otherwise: {
    // A member holding this many books cannot borrow another
    maxBooks: 3,
    loanDays: 14,
    extensionDays: 7,
    // Yen per day late, and the most a late fee can be
    feePerDay: 100,
    feeCap: 1000,
    // A book more than this many days past its due date is considered lost
    lostAfterDays: 30,
  },
});
