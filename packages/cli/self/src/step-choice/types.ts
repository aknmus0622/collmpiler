/**
 * Vocabulary of the step choice: the answers it gives and the dependency it asks.
 *
 * The component has no states of its own (the specification's only state is `READY`).
 */

/**
 * The answer of `StepChoice.choose`. Corresponds to the specification's output of the command `Choose`,
 * member for member.
 */
export interface CommandChoice {
  /** The command executed at this step; `null` when none is chosen. */
  readonly chosen: string | null;
  /** Whether a forced command was refused. */
  readonly refused: boolean;
}

/**
 * The answer of `StepChoice.decideCase`. Corresponds to the specification's output of the command
 * `DecideCase`, member for member.
 */
export interface CaseChoice {
  /** The case that happens (a case name, possibly `"otherwise"`); `null` when none is chosen. */
  readonly chosen: string | null;
  /** The cases in conflict, in the order they were given; empty when there is no conflict. */
  readonly conflict: readonly string[];
}

/**
 * Dependency: the situation being simulated, which says whether a named condition holds in it. The step
 * choice asks it each time it needs an answer and keeps no copy, so answers may differ from one call to the
 * next.
 */
export interface Conditions {
  /**
   * Whether the named condition holds in the situation being considered (for the command being
   * considered, or for the case being chosen). Corresponds to the specification's query `holds` with input
   * `{ condition }`; returns its answer. Asked synchronously from inside `onlyIf` (with that call's
   * `condition`) and from inside `addCase` (with that call's `name`), and only when the specification says
   * the answer is needed.
   */
  holds(condition: string): boolean;
}
