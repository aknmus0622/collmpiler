// What is wrong with what a spec declares (1.0): the Stage 0 of type-check. Two kinds of facts: the promise of a query of
// the outside world, and one row of a decision table.

export type PromiseFacts = { fresh: boolean; increasing: boolean; integer: boolean; hasParams: boolean };
export type PromiseProblem = "fresh-and-increasing" | "increasing-not-integer" | "promise-with-params";

export function promiseStage0({ fresh, increasing, integer, hasParams }: PromiseFacts): PromiseProblem[] {
  const found: PromiseProblem[] = [];
  if (fresh && increasing) found.push("fresh-and-increasing");
  if (increasing && !integer) found.push("increasing-not-integer");
  if (hasParams && (fresh || increasing)) found.push("promise-with-params");
  return found;
}

export type RowFacts = { last: boolean; otherwise: boolean; constantCells: boolean; sameColumns: boolean };
export type RowProblem = "last-not-otherwise" | "otherwise-not-last" | "cell-not-constant" | "columns-differ";

export function rowStage0({ last, otherwise, constantCells, sameColumns }: RowFacts): RowProblem[] {
  const found: RowProblem[] = [];
  if (last && !otherwise) found.push("last-not-otherwise");
  if (!last && otherwise) found.push("otherwise-not-last");
  if (!constantCells) found.push("cell-not-constant");
  if (!sameColumns) found.push("columns-differ");
  return found;
}
