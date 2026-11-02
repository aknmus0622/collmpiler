/**
 * Decides what is wrong with the promise of a query of the outside world and
 * with a row of a decision table.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `type-check`.
 */

/**
 * One problem found with a promise. Specification name: the elements of the
 * result of the query `Promise`; the values are the specification's own, and
 * each one names its problem.
 */
export type PromiseProblem =
  | "fresh-and-increasing"
  | "increasing-not-integer"
  | "promise-with-params";

/**
 * One problem found with a row. Specification name: the elements of the result
 * of the query `Row`; the values are the specification's own, and each one
 * names its problem.
 */
export type RowProblem =
  | "last-not-otherwise"
  | "otherwise-not-last"
  | "cell-not-constant"
  | "columns-differ";

/**
 * Everything known about the promise of one query of the outside world. The
 * field names are the specification's parameter names.
 */
export interface PromiseFacts {
  /** Whether the query promises fresh answers (specification parameter `fresh`). */
  fresh: boolean;
  /** Whether the query promises increasing answers (specification parameter `increasing`). */
  increasing: boolean;
  /** Whether the query answers integers (specification parameter `integer`). */
  integer: boolean;
  /** Whether the query has parameters (specification parameter `hasParams`). */
  hasParams: boolean;
}

/**
 * Everything known about one row of a decision table. The field names are the
 * specification's parameter names.
 */
export interface RowFacts {
  /** Whether this is the table's last row (specification parameter `last`). */
  last: boolean;
  /** Whether the row's condition is otherwise (specification parameter `otherwise`). */
  otherwise: boolean;
  /** Whether every cell of the row is a constant (specification parameter `constantCells`). */
  constantCells: boolean;
  /** Whether the row has the same columns as the table's first row (specification parameter `sameColumns`). */
  sameColumns: boolean;
}

/**
 * Performs the specification's query `Promise` (`type-check.Promise`).
 *
 * Accepts any combination of the four facts and always answers. Reads no state,
 * so the same facts always give the same answer.
 *
 * @param facts the promise's four facts, one field per specification parameter.
 * @returns every problem found, in the order the specification reports them;
 *   empty when there is none. The order is part of the answer.
 */
export function checkPromise(facts: PromiseFacts): PromiseProblem[] {
  const { fresh, increasing, integer, hasParams } = facts;
  const problems: PromiseProblem[] = [];
  if (fresh && increasing) problems.push("fresh-and-increasing");
  if (increasing && !integer) problems.push("increasing-not-integer");
  if (hasParams && (fresh || increasing)) problems.push("promise-with-params");
  return problems;
}

/**
 * Performs the specification's query `Row` (`type-check.Row`).
 *
 * Accepts any combination of the four facts and always answers. Reads no state,
 * so the same facts always give the same answer.
 *
 * @param facts the row's four facts, one field per specification parameter.
 * @returns every problem found, in the order the specification reports them;
 *   empty when there is none. The order is part of the answer.
 */
export function checkRow(facts: RowFacts): RowProblem[] {
  const { last, otherwise, constantCells, sameColumns } = facts;
  const problems: RowProblem[] = [];
  if (last && !otherwise) problems.push("last-not-otherwise");
  if (otherwise && !last) problems.push("otherwise-not-last");
  if (!constantCells) problems.push("cell-not-constant");
  if (!sameColumns) problems.push("columns-differ");
  return problems;
}
