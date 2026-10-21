/**
 * The observation comparison: decides whether what was observed of the
 * system after a command equals what the specification expects.
 *
 * Corresponds to the specification component "observation-compare". One
 * `ObservationCompare` object compares one pair of observations after
 * another. It is driven from outside: whoever owns it calls `begin` for the
 * next pair, gives the leaves of each observation through `expected` and
 * `actual` (in any interleaving), and then calls `decide` for the answer.
 * It asks nothing of its environment and tells it nothing. It has no states
 * of its own (the specification's only state is `READY`); every method may
 * be called at any time.
 *
 * Each leaf is one string describing one observed value; the comparison
 * treats leaves as opaque strings.
 *
 * Command -> method:
 *   `Begin`    -> `begin`
 *   `Expected` -> `expected`
 *   `Actual`   -> `actual`
 *   `Decide`   -> `decide`
 */

/**
 * What the comparison remembers between commands (spec `model.data`; field
 * names identical to the specification's). Before the first `begin`, both
 * lists are empty and `answerAbsent` is `false`.
 */
export interface ObservationProgress {
  /** Spec `actual`: the leaves of the actual observation given so far, in the order given. */
  actual: string[];
  /**
   * Spec `answerAbsent`: whether the command answers (the specification
   * declares an output for it) but the system answered nothing. Set by `begin`.
   */
  answerAbsent: boolean;
  /** Spec `expected`: the leaves of the expected observation given so far, in the order given. */
  expected: string[];
}

/** Input of `Begin`. Field names identical to the specification's. */
export interface ComparisonStart {
  /** Whether the system answered something to the command. */
  answered: boolean;
  /** Whether the command answers, i.e. the specification declares an output for it. */
  answers: boolean;
}

/**
 * Compares observations, one pair after another. Each method performs one
 * specification command.
 */
export class ObservationCompare {
  private data: ObservationProgress = { actual: [], answerAbsent: false, expected: [] };

  /** What the comparison currently remembers (spec data); a copy. */
  get progress(): ObservationProgress {
    return { actual: [...this.data.actual], answerAbsent: this.data.answerAbsent, expected: [...this.data.expected] };
  }

  /**
   * Spec command `Begin`: the next two observations are compared; forgets
   * the leaves given so far (both lists become empty) and remembers
   * `answerAbsent` from `start`.
   */
  begin(start: ComparisonStart): void {
    this.data = { actual: [], answerAbsent: answerAbsentNow(start), expected: [] };
  }

  /** Spec command `Expected`: `leaf` (spec input `leaf`) is a leaf of the expected observation. */
  expected(leaf: string): void {
    this.data.expected = withLeaf(this.data.expected, leaf);
  }

  /** Spec command `Actual`: `leaf` (spec input `leaf`) is a leaf of the actual observation. */
  actual(leaf: string): void {
    this.data.actual = withLeaf(this.data.actual, leaf);
  }

  /**
   * Spec command `Decide`: answers whether the two observations given since
   * the last `begin` are equal (spec output of `Decide`). Changes nothing
   * that is remembered; may be called more than once.
   */
  decide(): boolean {
    return observationsEqual(this.data);
  }
}

/** Pure calculation `actualWithLeaf` / `expectedWithLeaf`: the leaves given so far, with `leaf` given next. */
export function withLeaf(leaves: readonly string[], leaf: string): string[] {
  return [...leaves, leaf];
}

/** Pure calculation `answerAbsentNow`, from the input of `begin`. */
export function answerAbsentNow(start: ComparisonStart): boolean {
  return start.answers && !start.answered;
}

/** The leaf standing for an answer the system did not give: the output is null. */
const ABSENT_ANSWER_LEAF = '"output"|null|null';

/** Pure calculation `observationsEqual`, from what is remembered when `decide` is performed. */
export function observationsEqual(progress: ObservationProgress): boolean {
  const expected = new Set(progress.expected);
  const actual = new Set(progress.actual);
  if (progress.answerAbsent) actual.add(ABSENT_ANSWER_LEAF);
  if (expected.size !== actual.size) return false;
  for (const leaf of expected) if (!actual.has(leaf)) return false;
  return true;
}
