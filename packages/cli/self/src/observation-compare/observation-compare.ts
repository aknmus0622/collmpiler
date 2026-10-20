import { answerAbsentNow, observationsEqual, withLeaf } from "./compare.ts";

/**
 * The observation-compare component: decides whether the observation of the system after a command equals
 * the one the specification expects. An observation is given leaf by leaf; each leaf is an opaque string
 * (the caller encodes it as text; this component only compares the strings).
 *
 * It is driven as a loop, once per comparison: `begin`, then any number of `expected` and `actual` calls
 * (one per leaf, in any interleaving), then `decide`. A new instance starts with the specification's initial
 * data. The specification's only state is `READY`, so there is no state to read. It has no dependencies.
 *
 * Each method below performs one command of the specification. The remembered data is observed through
 * `expectedLeaves`, `actualLeaves` and `answerAbsent`; the only command with an answer is `decide`.
 */
export class ObservationCompare {
  #expected: readonly string[] = [];
  #actual: readonly string[] = [];
  #answerAbsent = false;

  /** The specification's `data.expected`: the leaves of the expected observation given so far, in the order given. */
  get expectedLeaves(): readonly string[] {
    return this.#expected;
  }

  /** The specification's `data.actual`: the leaves of the actual observation given so far, in the order given. */
  get actualLeaves(): readonly string[] {
    return this.#actual;
  }

  /**
   * The specification's `data.answerAbsent`: whether the command under comparison answers (declares an
   * output) but the system answered nothing, as derived at the last `begin`.
   */
  get answerAbsent(): boolean {
    return this.#answerAbsent;
  }

  /**
   * Performs the command `Begin`: two observations are compared next. Forgets the leaves given for the
   * previous comparison.
   *
   * @param answers the command's `answers`: whether the command under comparison declares an output
   * @param answered the command's `answered`: whether the system answered something
   */
  begin(answers: boolean, answered: boolean): void {
    this.#expected = [];
    this.#actual = [];
    this.#answerAbsent = answerAbsentNow(answers, answered);
  }

  /**
   * Performs the command `Expected`: gives one leaf of the expected observation.
   *
   * @param leaf the command's `leaf`
   */
  expected(leaf: string): void {
    this.#expected = withLeaf(this.#expected, leaf);
  }

  /**
   * Performs the command `Actual`: gives one leaf of the actual observation.
   *
   * @param leaf the command's `leaf`
   */
  actual(leaf: string): void {
    this.#actual = withLeaf(this.#actual, leaf);
  }

  /**
   * Performs the command `Decide`. Changes nothing that is remembered; the leaves stay until the next
   * `begin`.
   *
   * @returns the command's answer: whether the expected and actual observations are equal
   */
  decide(): boolean {
    return observationsEqual(this.#expected, this.#actual, this.#answerAbsent);
  }
}
