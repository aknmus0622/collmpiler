/**
 * Vocabulary of the promise keeper: the values it handles and the answers it gives.
 *
 * The component has no states of its own (the specification's only state is `READY`).
 */

/**
 * A value answered by a query: a whole number or a text. Corresponds to the specification's type `value`.
 * Numbers and texts are never equal to one another (the number `1` and the text `"1"` are different values).
 */
export type AnsweredValue = number | string;

/**
 * The input of `PromiseKeeper.increasing`. Corresponds to the input of the specification's command
 * `Increasing`, member for member.
 */
export interface IncreasingRequest {
  /** The command's `drawn`: the whole number drawn at random for this answer. */
  readonly drawn: number;
  /** The command's `previous`: the query's previous answer, or `null` when it has not answered before. */
  readonly previous: number | null;
  /** The command's `delta`: the increment drawn at random, a whole number, 0 or more. */
  readonly delta: number;
  /** The command's `max`: the largest answer allowed, or `null` when no maximum is given. */
  readonly max: number | null;
}

/**
 * The answer of `PromiseKeeper.restart`, with the specification's spellings: `"keep"` when the component
 * keeps its state and data across the restart, `"start-again"` when it starts again from its initial state.
 */
export type RestartOutcome = "keep" | "start-again";
