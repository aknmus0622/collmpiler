/**
 * Compares two observations of the system after a command: the one the
 * specification expects and the one actually seen. The caller opens a comparison,
 * feeds in the leaves of both observations as a sequence of calls, and then asks
 * for the answer.
 *
 * It corresponds to the specification's component `observation-compare`. It has no
 * dependencies, and it keeps nothing across a restart: a new instance starts over.
 */

/**
 * One leaf of an observation. Specification name: sort `Leaf`. An opaque string in
 * the form the leaves' producer writes them, compared only for equality; this
 * component does not take it apart.
 */
export type ObservationLeaf = string;

/**
 * Everything the comparison remembers, one field per state field of the
 * specification, under the same names.
 */
export interface ObservationCompareState {
  /** The leaves of the actual observation, in the order given (`actual`). */
  actual: ObservationLeaf[];
  /**
   * What `begin` noted about the command's answer: `true` when the system's answer
   * counts as absent, `false` otherwise (`answerAbsent`).
   */
  answerAbsent: boolean;
  /** The leaves of the expected observation, in the order given (`expected`). */
  expected: ObservationLeaf[];
}

/**
 * What is known about the command before its leaves are given. The field names are
 * the parameter names of the specification's command `Begin`.
 */
export interface CommandAnswerFacts {
  /** Whether the system answered something (specification parameter `answered`). */
  answered: boolean;
  /**
   * Whether the command answers, that is, declares an output (specification
   * parameter `answers`).
   */
  answers: boolean;
}

/** The leaf that stands for a command answering null. */
const NULL_OUTPUT_LEAF: ObservationLeaf = '"output"|null|null';

/**
 * The actual observation as it counts in the comparison: a command that answers but
 * answered nothing counts as answering null.
 */
function countedActual(state: ObservationCompareState): ObservationLeaf[] {
  return state.answerAbsent ? [...state.actual, NULL_OUTPUT_LEAF] : state.actual;
}

/** Whether every leaf of `leaves` is also among `others`. */
function allAmong(leaves: ObservationLeaf[], others: ObservationLeaf[]): boolean {
  return leaves.every((leaf) => others.includes(leaf));
}

/**
 * Whether the two observations in the given state are equal. Pure: it reads only
 * its argument and changes nothing. It corresponds to the specification's
 * calculation `decide`.
 *
 * @param state what the comparison remembers.
 * @returns `true` when the observations are equal, `false` when they differ.
 */
export function observationsEqual(state: ObservationCompareState): boolean {
  const actual = countedActual(state);
  return allAmong(state.expected, actual) && allAmong(actual, state.expected);
}

/**
 * One comparison, reusable for the next by calling `begin` again. Create one with
 * `new ObservationCompare()`; it starts in the specification's initial state.
 *
 * `begin`, `expected` and `actual` each perform one command of the specification
 * and return nothing: what they lead to is seen in `state()` and `decide()`. The
 * usual sequence is: `begin`, then `expected` once per expected leaf and `actual`
 * once per actual leaf, in any interleaving, and last `decide`.
 */
export class ObservationCompare {
  #state: ObservationCompareState = { actual: [], answerAbsent: false, expected: [] };

  /**
   * Reads what the comparison remembers. It only reads, and may be called at any
   * point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): ObservationCompareState {
    return {
      actual: [...this.#state.actual],
      answerAbsent: this.#state.answerAbsent,
      expected: [...this.#state.expected],
    };
  }

  /**
   * Performs the specification's command `Begin`: two observations are compared
   * next, and no leaf of either has been given yet.
   *
   * @param facts what is known about the command's answer.
   */
  begin(facts: CommandAnswerFacts): void {
    this.#state = {
      actual: [],
      answerAbsent: facts.answers && !facts.answered,
      expected: [],
    };
  }

  /**
   * Performs the specification's command `Expected`: gives one leaf of the expected
   * observation.
   *
   * @param leaf the leaf (specification parameter `leaf`).
   */
  expected(leaf: ObservationLeaf): void {
    this.#state.expected = [...this.#state.expected, leaf];
  }

  /**
   * Performs the specification's command `Actual`: gives one leaf of the actual
   * observation.
   *
   * @param leaf the leaf (specification parameter `leaf`).
   */
  actual(leaf: ObservationLeaf): void {
    this.#state.actual = [...this.#state.actual, leaf];
  }

  /**
   * Performs the specification's query `Decide`. It only reads, and may be called
   * at any point, including more than once.
   *
   * @returns whether the two observations given so far are equal.
   */
  decide(): boolean {
    return observationsEqual(this.#state);
  }
}
