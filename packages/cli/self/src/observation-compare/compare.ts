/**
 * Pure calculations of the observation comparison. Each function corresponds to one of the specification's
 * calculations; none of them touches the data of an `ObservationCompare`.
 */

/** The leaf an answering command contributes to the actual observation when the system answered nothing. */
const ABSENT_ANSWER_LEAF = '"output"|null|null';

/**
 * Appends one leaf to the leaves given so far. Corresponds to the specification's calculations
 * `actualWithLeaf` (used with the actual leaves) and `expectedWithLeaf` (used with the expected leaves).
 *
 * @param leaves the leaves of one observation given so far, in the order given
 * @param leaf the leaf just given, as passed to the command
 * @returns the leaves to remember for that observation; the argument is not modified
 */
export function withLeaf(leaves: readonly string[], leaf: string): readonly string[] {
  return [...leaves, leaf];
}

/**
 * Corresponds to the specification's calculation `answerAbsentNow`.
 *
 * @param answers the `Begin` command's `answers`: whether the command under comparison declares an output
 * @param answered the `Begin` command's `answered`: whether the system answered something
 * @returns the value to remember as the specification's `data.answerAbsent`
 */
export function answerAbsentNow(answers: boolean, answered: boolean): boolean {
  return answers && !answered;
}

/**
 * Corresponds to the specification's calculation `observationsEqual`.
 *
 * @param expected the specification's `data.expected`: the expected leaves, in the order given
 * @param actual the specification's `data.actual`: the actual leaves, in the order given
 * @param answerAbsent the specification's `data.answerAbsent`
 * @returns whether the two observations are equal
 */
export function observationsEqual(
  expected: readonly string[],
  actual: readonly string[],
  answerAbsent: boolean,
): boolean {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  if (answerAbsent) actualSet.add(ABSENT_ANSWER_LEAF);
  if (expectedSet.size !== actualSet.size) return false;
  for (const leaf of expectedSet) {
    if (!actualSet.has(leaf)) return false;
  }
  return true;
}
