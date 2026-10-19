/**
 * Vocabulary of the graph check: the position it reports, the findings it emits, and the dependencies it
 * is given.
 */

/**
 * Phase of the check. Corresponds to the specification's states:
 *
 * - `"idle"`: `IDLE`, nothing has been checked yet
 * - `"reaching"`: `REACHING`, the reachable states are being found, one round over the transitions at a time
 * - `"judging"`: `JUDGING`, the reachable states are known; states, commands and vocabulary are judged
 */
export type GraphCheckState = "idle" | "reaching" | "judging";

/**
 * Classification of a finding. Corresponds to the `code` of the specification's `Report` effect, with the
 * same spellings.
 */
export type GraphFindingCode =
  | "unreachable-state"
  | "unreachable-command"
  | "dead-end-state"
  | "unused-effect"
  | "unset-data"
  | "unasked-query";

/** How serious a finding is. Corresponds to the `severity` of the `Report` effect, same spellings. */
export type GraphFindingSeverity = "error" | "warning";

/**
 * Which part of the vocabulary an entry given to `GraphCheck.vocabulary` belongs to. Corresponds to the
 * `group` input of the specification's `Vocabulary` command, with the same spellings.
 */
export type VocabularyGroup = "effects" | "data" | "queries";

/**
 * One finding emitted by the check. Corresponds to the payload of the specification's `Report` effect,
 * member for member (`code`, `severity`, `subject`).
 */
export interface GraphFinding {
  readonly code: GraphFindingCode;
  readonly severity: GraphFindingSeverity;
  /** The name (state, command, or vocabulary entry) the finding is about. */
  readonly subject: string;
}

/**
 * Description of one vocabulary entry. Corresponds to the input of the specification's `Vocabulary`
 * command, member for member.
 */
export interface VocabularyEntry {
  readonly group: VocabularyGroup;
  /** The entry's name; it is the subject of any finding about the entry. */
  readonly name: string;
  /** Whether the entry is used (an effect emitted, data set or given by a containing component, a query asked). */
  readonly used: boolean;
  /** Whether Layer 1 lists the entry (`false`: the interpretation added it). */
  readonly listed: boolean;
  /** Whether the entry takes an input. */
  readonly takesInput: boolean;
}

/**
 * Dependency: the states the specification under check declares. The check consults it each time it needs
 * an answer and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface DeclaredStates {
  /**
   * Lookup of a state by name (any name, the empty one included).
   * Corresponds to the query `stateDeclared` with input `{ name: state }`; returns its answer.
   */
  declaresState(state: string): boolean;
}

/** Dependency: the receiver of the findings the check emits. */
export interface GraphFindingSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted finding.
   * Corresponds to the specification's `Report` effect; the argument is its payload.
   */
  report(finding: GraphFinding): void;
}

/**
 * Dependency: whoever feeds the specification's structure to the check. The check tells it what to feed
 * next. Each method is called synchronously, at the end of the command that emits it, after that command
 * has stored its outcome; the driver may therefore call further commands on the check from inside the call.
 */
export interface GraphCheckDriver {
  /**
   * Corresponds to the specification's `RunRound` effect (no payload): feed every transition once more
   * through `GraphCheck.edge`, then call `GraphCheck.roundEnd`.
   */
  runRound(): void;

  /**
   * Corresponds to the specification's `ReachingDone` effect (no payload): the reachable states are known;
   * feed the states (`checkState`), the commands (`beginCommand`, `from`, `endCommand`), the exits
   * (`beginExits`, `exit`, `endExits`) and the vocabulary (`vocabulary`) to be judged.
   */
  reachingDone(): void;
}
