/**
 * Step choice: chooses which case of a command happens.
 *
 * Corresponds to the specification component `step-choice`. It relies on one
 * dependency, the oracle ({@link CaseOracle}, specification component
 * `oracle`), and is not durable. Its entries map onto this module as follows:
 *
 * - Commands `BeginCases` and `Case` and query `Decision`: the methods of
 *   {@link StepChoice}, one instance per command whose case is being chosen
 *   (it can be reused: `beginCases` starts over).
 *
 * The decisions themselves live in the pure functions {@link afterCase} and
 * {@link decideCase}; the class only asks the oracle and holds the state
 * between commands.
 */

/**
 * The name of a case (specification sort `CaseName`): an opaque identifier,
 * compared only for equality. A case is named by its condition.
 */
export type CaseName = string;

/**
 * The oracle (specification component `oracle`, the outside world): it
 * evaluates a case's condition in the situation being considered.
 */
export interface CaseOracle {
  /**
   * Specification query `oracle.Holds`: whether the condition of the case
   * `name` holds in the situation being considered. Asked once by every
   * {@link StepChoice.considerCase} call, with that call's case name.
   */
  holds(name: CaseName): boolean;
}

/**
 * Which case happens: the answer of the specification query `Decision`
 * (calculation `decision`). Each field is the specification field of the
 * same name.
 */
export interface CaseDecision {
  /** The case that happens, or `null` when no single case is chosen (field `chosen`). */
  chosen: CaseName | null;
  /** The cases in conflict, in the order they were given; empty when there is no conflict (field `conflict`). */
  conflict: CaseName[];
  /** Whether the otherwise case happens (field `otherwise`). */
  otherwise: boolean;
}

/**
 * The cases given since the last `beginCases` whose condition held, in the
 * order they were given (specification state `hits`), after one more case was
 * given (the update of specification command `Case`).
 *
 * Pure: answers a new list, does not change `hits`.
 *
 * @param hits the cases whose condition held so far (state `hits` before the command).
 * @param name the case just given (parameter `name` of `Case`).
 * @param holds the oracle's answer for that case (`oracle.Holds(name)`).
 * @returns the new value of state `hits`.
 */
export function afterCase(hits: readonly CaseName[], name: CaseName, holds: boolean): CaseName[] {
  return holds ? [...hits, name] : [...hits];
}

/**
 * Which case happens, given the cases whose condition held (specification
 * calculation `decision`).
 *
 * Pure: answers the same result for the same argument, touches nothing.
 *
 * @param hits the cases whose condition held, in the order given (state `hits`).
 * @returns the decision (the specification's result of `Decision`).
 */
export function decideCase(hits: readonly CaseName[]): CaseDecision {
  if (hits.length === 0) return { chosen: null, conflict: [], otherwise: true };
  if (hits.length === 1) return { chosen: hits[0], conflict: [], otherwise: false };
  return { chosen: null, conflict: [...hits], otherwise: false };
}

/**
 * The choice of the case of one command: give it the command's cases one by
 * one, then read which one happens.
 *
 * Typical use: `beginCases()`, then `considerCase(name)` for each case in the
 * order the command lists them, then `decision()`.
 */
export class StepChoice {
  private readonly oracle: CaseOracle;
  /** The cases given since the last `beginCases` whose condition held, in order (specification state `hits`). */
  private hits: CaseName[];

  /**
   * Starts with no case given (the specification's `init`).
   *
   * @param oracle asked whether each given case's condition holds.
   */
  constructor(oracle: CaseOracle) {
    this.oracle = oracle;
    this.hits = [];
  }

  /**
   * Specification command `BeginCases`: a case is chosen next; no case has
   * been given yet. Forgets the cases given before. Does not ask the oracle.
   */
  beginCases(): void {
    this.hits = [];
  }

  /**
   * Specification command `Case`: gives one case, named by its condition.
   * Asks the oracle ({@link CaseOracle.holds}) about this case exactly once,
   * even when another case already holds; see {@link afterCase}.
   *
   * @param name the case (parameter `name`).
   */
  considerCase(name: CaseName): void {
    this.hits = afterCase(this.hits, name, this.oracle.holds(name));
  }

  /**
   * Specification query `Decision`: which case happens, from the cases given
   * since the last `beginCases`; see {@link decideCase}. Does not ask the
   * oracle and changes nothing.
   */
  decision(): CaseDecision {
    return decideCase(this.hits);
  }
}
