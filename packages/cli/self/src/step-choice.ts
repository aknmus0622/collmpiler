/**
 * Selection among the alternatives of one command.
 *
 * The caller opens a round with `beginCases`, submits alternatives one at a time
 * with `case`, and then reads the result with `decision`. Answers about each
 * alternative come from a `CaseOracle` handed to the constructor.
 *
 * It corresponds to the specification's component `step-choice`. It is held in
 * memory only: a new instance starts empty.
 */

/**
 * Identifies an alternative. Specification type `CaseName`: an opaque identifier,
 * compared only for equality.
 */
export type CaseName = string;

/**
 * Everything a choice remembers, one field per state field of the specification,
 * under the same name.
 */
export interface StepChoiceState {
  /**
   * The alternatives recorded in the current round (`hits`). A list, so its order
   * is significant.
   */
  hits: CaseName[];
}

/**
 * The outcome of a round. Specification name: the result of the query `Decision`;
 * the field names are the specification's own.
 */
export interface StepDecision {
  /** The selected alternative, or `null` (`chosen`). */
  chosen: CaseName | null;
  /** The alternatives reported as clashing; possibly an empty list (`conflict`). */
  conflict: CaseName[];
  /** Whether the fallback alternative was selected (`otherwise`). */
  otherwise: boolean;
}

/**
 * The outside party that answers for each alternative. It corresponds to the
 * specification's external component `oracle`.
 *
 * Implementations supply the answers and do not throw.
 */
export interface CaseOracle {
  /**
   * Yes-or-no answer for one alternative (specification query `Holds`). Called from
   * `StepChoice.case`, once per call, with that call's name.
   *
   * @param name the alternative in question (specification parameter `name`).
   * @returns the oracle's answer, `true` for yes.
   */
  holds(name: CaseName): boolean;
}

/**
 * Computes the outcome from a state. Pure: it reads only its argument and changes
 * nothing. It corresponds to the specification's calculation `decision`.
 *
 * @param state what the choice remembers.
 * @returns the outcome for that state.
 */
export function decideCase(state: StepChoiceState): StepDecision {
  const { hits } = state;
  if (hits.length === 0) {
    return { chosen: null, conflict: [], otherwise: true };
  }
  if (hits.length === 1) {
    return { chosen: hits[0], conflict: [], otherwise: false };
  }
  return { chosen: null, conflict: [...hits], otherwise: false };
}

/**
 * One selection, reusable for another round by calling `beginCases` again. Create
 * one with `new StepChoice(oracle)`; it starts in the specification's initial state.
 *
 * `beginCases` and `case` each perform one command of the specification and return
 * nothing: their effect is seen in `state()` and `decision()`. The usual sequence
 * is: `beginCases`, then `case` once per alternative, and last `decision`.
 */
export class StepChoice {
  private readonly oracle: CaseOracle;
  private hits: CaseName[] = [];

  /**
   * @param oracle consulted by `case`, for the lifetime of this instance.
   */
  constructor(oracle: CaseOracle) {
    this.oracle = oracle;
  }

  /**
   * Reads what the choice remembers. It only reads, and may be called at any point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): StepChoiceState {
    return { hits: [...this.hits] };
  }

  /**
   * Performs the specification's command `BeginCases`: opens a new round. It takes
   * no arguments.
   */
  beginCases(): void {
    this.hits = [];
  }

  /**
   * Performs the specification's command `Case`: submits one alternative. This is
   * where `oracle` is consulted.
   *
   * @param name the alternative (specification parameter `name`).
   */
  case(name: CaseName): void {
    if (this.oracle.holds(name)) {
      this.hits = [...this.hits, name];
    }
  }

  /**
   * Performs the specification's query `Decision`. It only reads, and may be called
   * at any point, including more than once.
   *
   * @returns the outcome of the round so far; see `decideCase`.
   */
  decision(): StepDecision {
    return decideCase(this.state());
  }
}
