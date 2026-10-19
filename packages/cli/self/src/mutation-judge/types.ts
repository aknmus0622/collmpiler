/**
 * Vocabulary of the mutation judge: the position it reports and the dependency it tells its findings to.
 */

/**
 * Position of the judge. Corresponds to the specification's states:
 *
 * - `"values"`: `VALUES` (decision-table values are being judged, one after another; ready for `BeginValue`,
 *   `Mutant` or `Finish`)
 * - `"inValue"`: `IN_VALUE` (the sites of one value are being given; ready for `Site` or `EndValue`)
 * - `"mutants"`: `MUTANTS` (every mutant is being given; ready for `Mutant` or `Finish`)
 * - `"done"`: `DONE` (the judgement is over; final)
 */
export type MutationJudgeState = "values" | "inValue" | "mutants" | "done";

/** Dependency: the receiver of what the judge finds about the mutation report. */
export interface MutationGateFindings {
  /**
   * Called synchronously from inside `endValue`, at most once per value. Corresponds to the specification's
   * `Survived` effect (no payload): the value just ended is not decided by production code.
   */
  survived(): void;

  /**
   * Called synchronously from inside `endValue`, at most once per value. Corresponds to the specification's
   * `InAdapter` effect (no payload): the value just ended was put in the adapter rather than in production
   * code.
   */
  inAdapter(): void;

  /**
   * Called synchronously from inside `finish`, at most once. Corresponds to the specification's
   * `Ineffective` effect (no payload): the tested behaviour does not come from production code.
   */
  ineffective(): void;
}
