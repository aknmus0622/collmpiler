import { service, value } from "@clp/core/v1";

// What is wrong with what a spec declares (packages/cli/src/v1/declared.ts, used by the reader in v1/build.ts): the promise
// of a query of the outside world, and one row of a decision table. Collecting the facts and wording the problems is the
// reader's.
export const TypeCheck = service("Decides what is wrong with the promises of the outside world and the rows of decision tables.", {
  queries: {
    Promise(fresh: boolean, increasing: boolean, integer: boolean, hasParams: boolean): ("fresh-and-increasing" | "increasing-not-integer" | "promise-with-params")[] {
      return value.promise(
        "The promise of a query of the outside world: whether it promises fresh answers, increasing ones, whether it answers " +
          "integers, and whether it has parameters. The problems, in this order: promising both fresh and increasing; promising " +
          "increasing answers that are not integers; promising either one for a query with parameters.",
      );
    },
    Row(last: boolean, otherwise: boolean, constantCells: boolean, sameColumns: boolean): ("last-not-otherwise" | "otherwise-not-last" | "cell-not-constant" | "columns-differ")[] {
      return value.row(
        "A row of a decision table: whether it is the last row, whether its condition is otherwise, whether every cell is a " +
          "constant, and whether it has the same columns as the first row. The problems, in this order: the last row is not " +
          "otherwise; otherwise is not the last row; a cell is not a constant; the columns differ.",
      );
    },
  },
});
