/**
 * Structural check of a specification's state graph and vocabulary.
 *
 * Corresponds to the specification component "graph-check". One
 * `GraphCheck` object checks one specification. It is driven from outside:
 * whoever owns it feeds it the specification piece by piece (transitions,
 * states, commands, vocabulary entries) by calling its methods, and it tells
 * its `GraphCheckListener` what it finds and when it needs to be fed again.
 *
 * Command -> method:
 *   `Begin`        -> `begin`
 *   `Edge`         -> `edge`
 *   `RoundEnd`     -> `roundEnd`
 *   `CheckState`   -> `checkState`
 *   `BeginCommand` -> `beginCommand`
 *   `From`         -> `from`
 *   `EndCommand`   -> `endCommand`
 *   `BeginExits`   -> `beginExits`
 *   `Exit`         -> `exit`
 *   `EndExits`     -> `endExits`
 *   `Vocabulary`   -> `vocabulary`
 *
 * Effect -> listener method:
 *   `RunRound`     -> `GraphCheckListener.runRound`
 *   `ReachingDone` -> `GraphCheckListener.reachingDone`
 *   `Report`       -> `GraphCheckListener.report`
 *
 * Query -> dependency method:
 *   `stateDeclared` -> `DeclaredStates.isDeclared`
 */

/**
 * Where the check stands; values identical to the specification's states.
 *   `"IDLE"`     before `begin` (the starting state).
 *   `"REACHING"` after `begin`: the owner feeds transitions (`edge`) and
 *                closes each pass with `roundEnd`.
 *   `"JUDGING"`  after `reachingDone` was told: the owner feeds states,
 *                commands, exits and vocabulary entries.
 */
export type GraphCheckState = "IDLE" | "REACHING" | "JUDGING";

/** Kind of finding (spec field `code` of the `Report` effect); values identical to the specification's. */
export type GraphFindingCode =
  | "unreachable-state"
  | "unreachable-command"
  | "dead-end-state"
  | "unused-effect"
  | "unset-data"
  | "unasked-query";

/** How serious a finding is (spec field `severity` of `Report`); values identical to the specification's. */
export type GraphFindingSeverity = "error" | "warning";

/** Payload of the `Report` effect. */
export interface GraphFinding {
  /** What is reported (spec `code`). */
  code: GraphFindingCode;
  /** How serious it is (spec `severity`). */
  severity: GraphFindingSeverity;
  /** The name the finding is about: a state, command, effect, data field or query (spec `subject`). */
  subject: string;
}

/** Group a vocabulary entry belongs to (spec field `group` of `Vocabulary`); values identical to the specification's. */
export type VocabularyGroup = "effects" | "data" | "queries";

/** Input of `Vocabulary`: one entry of the checked specification's vocabulary. Field names identical to the specification's. */
export interface VocabularyEntry {
  /** Which kind of entry it is. */
  group: VocabularyGroup;
  /** Its name; becomes the `subject` of a finding about it. */
  name: string;
  /** `true` if the checked specification makes use of this entry anywhere. */
  used: boolean;
  /** `true` if the entry appears in Layer 1's list (spec input `listed`). */
  listed: boolean;
  /** `true` if the entry has input fields (only relevant to the `"queries"` group). */
  takesInput: boolean;
}

/** Input of `Begin`. Field names identical to the specification's. */
export interface GraphCheckStart {
  /** Name of the checked specification's initial state. */
  init: string;
  /** `true` to run the check in strict mode (spec data `strictCheck`). */
  strict: boolean;
  /** `true` if the checked specification has a list of final states (spec data `finalsAreDeclared`). */
  finalsDeclared: boolean;
}

/**
 * Dependency: the declared states of the specification being checked
 * (spec query `stateDeclared`). Asked while a transition (`edge`) or a state
 * a command can be executed in (`from`) is being processed, at the moment
 * the answer is needed; answers are never cached.
 */
export interface DeclaredStates {
  /** `true` if `name` is among the checked specification's declared states. May be called with any string, `""` included. */
  isDeclared(name: string): boolean;
}

/** Dependency: told what the check does to its environment (spec effects). */
export interface GraphCheckListener {
  /**
   * Spec effect `RunRound`: the owner is to call `edge` for each transition
   * of the checked specification, followed by `roundEnd`. Told by `begin`
   * and by `roundEnd`.
   */
  runRound(): void;
  /**
   * Spec effect `ReachingDone`: the check has entered `"JUDGING"`; the owner
   * is now to call the states (`checkState`), the commands
   * (`beginCommand` / `from` / `endCommand`), the exits
   * (`beginExits` / `exit` / `endExits`) and the vocabulary (`vocabulary`).
   * Told by `roundEnd`.
   */
  reachingDone(): void;
  /** Spec effect `Report`: one finding of the check, with its code, severity and subject. */
  report(finding: GraphFinding): void;
}

/**
 * Checks one specification. Starts in `"IDLE"`. Each method performs one
 * specification command; calling a method in a state the command is not
 * listed for has unspecified behaviour.
 */
export class GraphCheck {
  private readonly declared: DeclaredStates;
  private readonly listener: GraphCheckListener;
  private current: GraphCheckState = "IDLE";
  private reachedStates: readonly string[] = [];
  private strictCheck = false;
  private finalsAreDeclared = false;
  private foundNew = false;
  private commandName = "";
  private allFromDeclared = true;
  private anyFromReached = false;
  private exitState = "";
  private exitFinal = false;
  private left = false;

  /**
   * @param declared answers whether a state name is declared in the checked specification.
   * @param listener receives the requests for rounds, the end of reaching, and the findings.
   */
  constructor(declared: DeclaredStates, listener: GraphCheckListener) {
    this.declared = declared;
    this.listener = listener;
  }

  /** Current state of the check (spec state names). */
  get state(): GraphCheckState {
    return this.current;
  }

  /**
   * The state names collected as reachable so far, in collection order
   * (spec data `reached`). Empty before `begin`.
   */
  get reached(): readonly string[] {
    return this.reachedStates;
  }

  /**
   * Spec command `Begin` (from `"IDLE"`): starts checking a specification.
   * Remembers the start facts, moves to `"REACHING"` and asks the listener
   * for a first round (`runRound`).
   */
  begin(start: GraphCheckStart): void {
    this.reachedStates = [start.init];
    this.strictCheck = start.strict;
    this.finalsAreDeclared = start.finalsDeclared;
    this.foundNew = false;
    this.current = "REACHING";
    this.listener.runRound();
  }

  /**
   * Spec command `Edge` (in `"REACHING"`): a transition by which a command
   * executable in state `from` can go to state `to`. May ask `DeclaredStates`
   * about `to`, and may extend `reached`. Emits nothing.
   */
  edge(from: string, to: string): void {
    if (!this.reachedStates.includes(from) || this.reachedStates.includes(to)) return;
    if (!this.declared.isDeclared(to)) return;
    this.reachedStates = [...this.reachedStates, to];
    this.foundNew = true;
  }

  /**
   * Spec command `RoundEnd` (in `"REACHING"`): the current round over the
   * transitions is over. Either asks the listener for another round
   * (`runRound`, staying in `"REACHING"`) or tells it `reachingDone` and moves
   * to `"JUDGING"`.
   */
  roundEnd(): void {
    if (this.foundNew) {
      this.foundNew = false;
      this.listener.runRound();
      return;
    }
    this.current = "JUDGING";
    this.listener.reachingDone();
  }

  /**
   * Spec command `CheckState` (in `"JUDGING"`): one declared state of the
   * specification, by name. May report `"unreachable-state"` about it.
   */
  checkState(name: string): void {
    if (!this.reachedStates.includes(name)) {
      this.listener.report({ code: "unreachable-state", severity: "error", subject: name });
    }
  }

  /**
   * Spec command `BeginCommand` (in `"JUDGING"`): a command of the
   * specification is judged next, by name. Followed by one `from` per state
   * the command can be executed in, then `endCommand`.
   */
  beginCommand(name: string): void {
    this.commandName = name;
    this.allFromDeclared = true;
    this.anyFromReached = false;
  }

  /**
   * Spec command `From` (in `"JUDGING"`, after `beginCommand`): one state the
   * command being judged can be executed in. May ask `DeclaredStates` about
   * that state. Emits nothing.
   */
  from(state: string): void {
    this.allFromDeclared = this.allFromDeclared && this.declared.isDeclared(state);
    this.anyFromReached = this.anyFromReached || this.reachedStates.includes(state);
  }

  /**
   * Spec command `EndCommand` (in `"JUDGING"`, after `beginCommand`): all
   * states of the command being judged have been given. May report
   * `"unreachable-command"` about that command.
   */
  endCommand(): void {
    if (this.allFromDeclared && !this.anyFromReached) {
      this.listener.report({ code: "unreachable-command", severity: "error", subject: this.commandName });
    }
  }

  /**
   * Spec command `BeginExits` (in `"JUDGING"`): a state is judged next for
   * whether it can be left. `final` says whether that state is final.
   * Followed by one `exit` per transition, then `endExits`.
   */
  beginExits(state: string, final: boolean): void {
    this.exitState = state;
    this.exitFinal = final;
    this.left = false;
  }

  /**
   * Spec command `Exit` (in `"JUDGING"`): one transition from state `from`
   * to state `to`, considered for the state being judged. Emits nothing.
   */
  exit(from: string, to: string): void {
    if (from === this.exitState && to !== this.exitState) this.left = true;
  }

  /**
   * Spec command `EndExits` (in `"JUDGING"`, after `beginExits`): all
   * transitions have been given. May report `"dead-end-state"` about the
   * state being judged.
   */
  endExits(): void {
    if (this.finalsAreDeclared && this.reachedStates.includes(this.exitState) && !this.exitFinal && !this.left) {
      this.listener.report({ code: "dead-end-state", severity: "error", subject: this.exitState });
    }
  }

  /**
   * Spec command `Vocabulary` (in `"JUDGING"`): one vocabulary entry. May
   * report `"unused-effect"`, `"unset-data"` or `"unasked-query"` about it.
   */
  vocabulary(entry: VocabularyEntry): void {
    const finding = vocabularyFinding(entry, this.strictCheck);
    if (finding !== null) this.listener.report(finding);
  }
}

/**
 * Pure decision for the `Vocabulary` command: the finding to report about
 * `entry` in a check that is strict or not (spec data `strictCheck`), or
 * `null` when nothing is reported.
 */
export function vocabularyFinding(entry: VocabularyEntry, strict: boolean): GraphFinding | null {
  if (entry.used) return null;
  const code = unusedCode(entry);
  if (code === null) return null;
  return { code, severity: vocabularySeverity(strict, entry.listed), subject: entry.name };
}

/** The finding code for an unused entry, or `null` when such an entry is never reported. */
function unusedCode(entry: VocabularyEntry): GraphFindingCode | null {
  switch (entry.group) {
    case "effects":
      return "unused-effect";
    case "data":
      return "unset-data";
    case "queries":
      return entry.takesInput ? "unasked-query" : null;
  }
}

/**
 * Pure calculation `severity` of the specification: the severity of a
 * vocabulary finding, from the check's strict flag (`GraphCheckStart.strict`)
 * and the entry's `listed` flag.
 */
export function vocabularySeverity(strict: boolean, listed: boolean): GraphFindingSeverity {
  return strict && !listed ? "error" : "warning";
}
