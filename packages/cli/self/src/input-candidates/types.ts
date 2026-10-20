/**
 * Vocabulary of the input candidates: the answers it gives.
 *
 * The component has no states of its own (the specification's only state is `READY`) and no dependencies:
 * it asks no query and performs no effect.
 */

/**
 * The answer of `InputCandidates.decideNumbers`. Corresponds to the specification's output of the command
 * `DecideNumbers`, member for member.
 */
export interface NumberCandidates {
  /** The limits of the number input (the specification's `limits`), in order; possibly empty. */
  readonly limits: readonly number[];
  /** The values to try around the thresholds given (the specification's `thresholds`), in order; possibly empty. */
  readonly thresholds: readonly number[];
}

/**
 * The answer of `InputCandidates.decideStrings`. Corresponds to the specification's output of the command
 * `DecideStrings`, member for member.
 */
export interface StringCandidates {
  /** The strings given (the specification's `known`, i.e. `data.knownTexts`), in order. */
  readonly known: readonly string[];
  /** The string lengths decided (the specification's `lengths`, i.e. `data.foundLengths`), in order. */
  readonly lengths: readonly number[];
}

/**
 * What is known about a number input, as given to the specification's `BeginNumbers` command. Read by the
 * pure calculations of `candidates.ts`.
 */
export interface NumberInput {
  /** The specification's `data.wholeOnly`: whether the input takes integers only. */
  readonly wholeOnly: boolean;
  /** The specification's `data.lowest`: the smallest value the input takes, or `null` when it has none. */
  readonly lowest: number | null;
  /** The specification's `data.highest`: the largest value the input takes, or `null` when it has none. */
  readonly highest: number | null;
}
