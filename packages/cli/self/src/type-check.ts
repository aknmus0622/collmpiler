/**
 * Type check: decides what is wrong with the promises of the outside world and
 * the rows of decision tables.
 *
 * Corresponds to the specification component `type-check`. It has no state
 * and no dependencies; each of its queries is implemented here by a pure
 * function that answers the same result for the same argument and touches
 * nothing:
 *
 * - `Promise` → {@link promiseProblems}
 * - `Row` → {@link rowProblems}
 */

/**
 * Specification query `type-check.Promise` (calculation `promise`).
 *
 * Judges the promise made by one query of the outside world.
 *
 * @param promise what the query promises and what it looks like (the
 *   specification's parameters, as one record).
 * @returns the problems found, in the order the specification lists them; an
 *   empty list when there is nothing wrong.
 */
export function promiseProblems(promise: PromiseFacts): PromiseProblem[] {
  const problems: PromiseProblem[] = [];
  if (promise.fresh && promise.increasing) problems.push("fresh-and-increasing");
  if (promise.increasing && !promise.integer) problems.push("increasing-not-integer");
  if (promise.hasParams && (promise.fresh || promise.increasing)) problems.push("promise-with-params");
  return problems;
}

/**
 * The input of the `Promise` query: one query of the outside world.
 * Each field is the specification parameter of the same name.
 */
export interface PromiseFacts {
  /** Whether the query promises never to answer the same value twice (specification parameter `fresh`). */
  fresh: boolean;
  /** Whether the query promises never to answer less than before (specification parameter `increasing`). */
  increasing: boolean;
  /** Whether the query answers integers (specification parameter `integer`). */
  integer: boolean;
  /** Whether the query has parameters (specification parameter `hasParams`). */
  hasParams: boolean;
}

/**
 * One problem with a promise (an element of the specification's result of
 * `Promise`). Each value is the specification value of the same name.
 *
 * - `"fresh-and-increasing"`: the query promises both fresh and increasing answers.
 * - `"increasing-not-integer"`: the query promises increasing answers that are not integers.
 * - `"promise-with-params"`: the query makes a promise although it has parameters.
 */
export type PromiseProblem = "fresh-and-increasing" | "increasing-not-integer" | "promise-with-params";

/**
 * Specification query `type-check.Row` (calculation `row`).
 *
 * Judges one row of a decision table.
 *
 * @param row where the row stands and what it contains (the specification's
 *   parameters, as one record).
 * @returns the problems found, in the order the specification lists them; an
 *   empty list when there is nothing wrong.
 */
export function rowProblems(row: RowFacts): RowProblem[] {
  const problems: RowProblem[] = [];
  if (row.last && !row.otherwise) problems.push("last-not-otherwise");
  if (row.otherwise && !row.last) problems.push("otherwise-not-last");
  if (!row.constantCells) problems.push("cell-not-constant");
  if (!row.sameColumns) problems.push("columns-differ");
  return problems;
}

/**
 * The input of the `Row` query: one row of a decision table.
 * Each field is the specification parameter of the same name.
 */
export interface RowFacts {
  /** Whether it is the last row of its table (specification parameter `last`). */
  last: boolean;
  /** Whether its condition is `otherwise` (specification parameter `otherwise`). */
  otherwise: boolean;
  /** Whether every one of its cells is a constant (specification parameter `constantCells`). */
  constantCells: boolean;
  /** Whether it has the same columns as the first row of its table (specification parameter `sameColumns`). */
  sameColumns: boolean;
}

/**
 * One problem with a decision-table row (an element of the specification's
 * result of `Row`). Each value is the specification value of the same name.
 *
 * - `"last-not-otherwise"`: the row is the last one but its condition is not `otherwise`.
 * - `"otherwise-not-last"`: the row's condition is `otherwise` but it is not the last row.
 * - `"cell-not-constant"`: a cell of the row is not a constant.
 * - `"columns-differ"`: the row's columns differ from those of the first row.
 */
export type RowProblem = "last-not-otherwise" | "otherwise-not-last" | "cell-not-constant" | "columns-differ";
