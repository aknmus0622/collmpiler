/**
 * Observation compare: decides whether the observation of the system after a
 * command equals the one the specification expects.
 *
 * Corresponds to the specification component `observation-compare`. It has no
 * dependencies and nothing durable. Its state is {@link ObservationCompareState};
 * each specification command is a pure step function on that state (and a
 * method of {@link ObservationCompare}, which keeps the state for the caller),
 * and the specification query `Decide` is a pure function of the state.
 *
 * Use, once per comparison: {@link ObservationCompare.begin}, then any number of
 * {@link ObservationCompare.expected} and {@link ObservationCompare.actual}, in
 * any interleaving, then {@link ObservationCompare.decide}. Everything given is
 * kept until the next `begin`.
 */

/**
 * One leaf of an observation (specification sort `Leaf`): an opaque string,
 * compared only for equality.
 */
export type Leaf = string;

/**
 * Everything the component remembers (the specification's `state`). Each field
 * has the name of the specification state field it holds.
 */
export interface ObservationCompareState {
  /** Leaves of the actual observation given since the last `begin`, in the order given (state `actual`). */
  readonly actual: readonly Leaf[];
  /**
   * Whether the command being compared answers (declares an output) while the
   * system answered nothing, as told by the last `begin` (state `answerAbsent`).
   */
  readonly answerAbsent: boolean;
  /** Leaves of the expected observation given since the last `begin`, in the order given (state `expected`). */
  readonly expected: readonly Leaf[];
}

/** The observation field that holds what the command answered. */
const OUTPUT_FIELD = "output";

/**
 * A leaf of an observation: the JSON-encoded field name, then the JSON-encoded
 * parts of its value, separated by `|`.
 */
function leafOf(field: string, ...parts: readonly unknown[]): Leaf {
  return [field, ...parts].map((part) => JSON.stringify(part)).join("|");
}

/**
 * The leaf the actual observation also has when the command answers but the
 * system answered nothing: that counts as answering null.
 */
const ABSENT_OUTPUT_LEAF: Leaf = leafOf(OUTPUT_FIELD, null, null);

/** The state the component starts from (the specification's `init`). */
export function initialObservationCompareState(): ObservationCompareState {
  return { actual: [], answerAbsent: false, expected: [] };
}

/**
 * Command `Begin`: two observations are compared next; no leaf has been given
 * for them yet.
 *
 * @param state the state before the command.
 * @param answered whether the system answered something to the command (parameter `answered`).
 * @param answers whether the command answers, i.e. declares an output (parameter `answers`).
 * @returns the state after the command.
 */
export function begin(state: ObservationCompareState, answered: boolean, answers: boolean): ObservationCompareState {
  return { actual: [], answerAbsent: answers && !answered, expected: [] };
}

/**
 * Command `Expected`: one leaf of the expected observation.
 *
 * @param state the state before the command.
 * @param leaf the leaf (parameter `leaf`).
 * @returns the state after the command.
 */
export function expected(state: ObservationCompareState, leaf: Leaf): ObservationCompareState {
  return { ...state, expected: [...state.expected, leaf] };
}

/**
 * Command `Actual`: one leaf of the actual observation.
 *
 * @param state the state before the command.
 * @param leaf the leaf (parameter `leaf`).
 * @returns the state after the command.
 */
export function actual(state: ObservationCompareState, leaf: Leaf): ObservationCompareState {
  return { ...state, actual: [...state.actual, leaf] };
}

/**
 * Query `Decide` (calculation `decide`): whether the actual observation equals
 * the expected one, for the leaves given since the last `begin`. Pure.
 */
export function decide(state: ObservationCompareState): boolean {
  const actualLeaves = state.answerAbsent ? [...state.actual, ABSENT_OUTPUT_LEAF] : state.actual;
  return (
    state.expected.every((leaf) => actualLeaves.includes(leaf)) &&
    actualLeaves.every((leaf) => state.expected.includes(leaf))
  );
}

/**
 * Keeps the component's state between commands. Each method is the
 * specification command or query of the same name (see the pure function of
 * the same name for its arguments and answer); commands replace the kept
 * state, the query only reads it. A new instance is in the specification's
 * initial state.
 */
export class ObservationCompare {
  private state: ObservationCompareState;

  constructor() {
    this.state = initialObservationCompareState();
  }

  /** Command `Begin`; see {@link begin}. */
  begin(answered: boolean, answers: boolean): void {
    this.state = begin(this.state, answered, answers);
  }

  /** Command `Expected`; see {@link expected}. */
  expected(leaf: Leaf): void {
    this.state = expected(this.state, leaf);
  }

  /** Command `Actual`; see {@link actual}. */
  actual(leaf: Leaf): void {
    this.state = actual(this.state, leaf);
  }

  /** Query `Decide`; see {@link decide}. */
  decide(): boolean {
    return decide(this.state);
  }
}
