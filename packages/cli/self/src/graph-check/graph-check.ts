import {
  allFromDeclaredNow,
  anyFromReachedNow,
  commandUnreachable,
  edgeReachesNew,
  initiallyReached,
  isDeadEnd,
  reachedWithTo,
  stateUnreachable,
  transitionLeaves,
  vocabularyFindingCode,
  vocabularySeverity,
} from "./rules.ts";
import type {
  DeclaredStates,
  GraphCheckDriver,
  GraphCheckState,
  GraphFindingSink,
  VocabularyEntry,
} from "./types.ts";

/**
 * Checks what follows from the written structure of a specification: unreachable states, commands that can
 * never be executed, states that cannot be left, and unused vocabulary. It is driven from outside: `begin`
 * once; then, each time the driver is told `runRound`, every transition through `edge` followed by
 * `roundEnd`; once the driver is told `reachingDone`, the states (`checkState`), the commands (`beginCommand`,
 * its `from` calls, `endCommand`), the exits of states (`beginExits`, its `exit` calls, `endExits`) and the
 * vocabulary (`vocabulary`).
 *
 * One instance is one check. A new instance starts in the specification's initial state (`"idle"`) with
 * nothing remembered. Each method below performs one command of the specification; a command returns nothing,
 * and its outcome is observed through `state`, the data getters, and the calls made on the dependencies.
 */
export class GraphCheck {
  private readonly declared: DeclaredStates;
  private readonly findings: GraphFindingSink;
  private readonly driver: GraphCheckDriver;
  private currentState: GraphCheckState = "idle";
  private reachedStates: readonly string[] | undefined = undefined;
  private roundFoundNew: boolean | undefined = undefined;
  private strict: boolean | undefined = undefined;
  private finalsDeclared: boolean | undefined = undefined;
  private judgedCommand: string | undefined = undefined;
  private everyFromDeclared: boolean | undefined = undefined;
  private someFromReached: boolean | undefined = undefined;
  private judgedExitState: string | undefined = undefined;
  private judgedExitFinal: boolean | undefined = undefined;
  private judgedLeft: boolean | undefined = undefined;

  /**
   * @param declared answers the query `stateDeclared`
   * @param findings receives the effect `Report`
   * @param driver receives the effects `RunRound` and `ReachingDone`
   */
  constructor(declared: DeclaredStates, findings: GraphFindingSink, driver: GraphCheckDriver) {
    this.declared = declared;
    this.findings = findings;
    this.driver = driver;
  }

  /** The current state. `GraphCheckState` lists the specification name of each value. */
  get state(): GraphCheckState {
    return this.currentState;
  }

  /** The specification's `data.reached`, in order; `undefined` until a command has stored it. */
  get reached(): readonly string[] | undefined {
    return this.reachedStates;
  }

  /** The specification's `data.foundNew`; `undefined` until a command has stored it. */
  get foundNew(): boolean | undefined {
    return this.roundFoundNew;
  }

  /** The specification's `data.strictCheck`; `undefined` until a command has stored it. */
  get strictCheck(): boolean | undefined {
    return this.strict;
  }

  /** The specification's `data.finalsAreDeclared`; `undefined` until a command has stored it. */
  get finalsAreDeclared(): boolean | undefined {
    return this.finalsDeclared;
  }

  /** The specification's `data.commandName`; `undefined` until a command has stored it. */
  get commandName(): string | undefined {
    return this.judgedCommand;
  }

  /** The specification's `data.allFromDeclared`; `undefined` until a command has stored it. */
  get allFromDeclared(): boolean | undefined {
    return this.everyFromDeclared;
  }

  /** The specification's `data.anyFromReached`; `undefined` until a command has stored it. */
  get anyFromReached(): boolean | undefined {
    return this.someFromReached;
  }

  /** The specification's `data.exitState`; `undefined` until a command has stored it. */
  get exitState(): string | undefined {
    return this.judgedExitState;
  }

  /** The specification's `data.exitFinal`; `undefined` until a command has stored it. */
  get exitFinal(): boolean | undefined {
    return this.judgedExitFinal;
  }

  /** The specification's `data.left`; `undefined` until a command has stored it. */
  get left(): boolean | undefined {
    return this.judgedLeft;
  }

  /**
   * Performs the command `Begin`. Executable in `"idle"`.
   *
   * @param init the command's `init`: the specification's initial state
   * @param strict the command's `strict`: whether the check is strict
   * @param finalsDeclared the command's `finalsDeclared`: whether the specification declares final states
   */
  begin(init: string, strict: boolean, finalsDeclared: boolean): void {
    this.finalsDeclared = finalsDeclared;
    this.roundFoundNew = false;
    this.reachedStates = initiallyReached(init);
    this.strict = strict;
    this.currentState = "reaching";
    this.driver.runRound();
  }

  /**
   * Performs the command `Edge`, one transition of a round. Executable in `"reaching"`. May ask
   * `stateDeclared` about `to`.
   *
   * @param from the command's `from`: the state a command can be executed in
   * @param to the command's `to`: the state it can go to
   */
  edge(from: string, to: string): void {
    const reached = this.reachedStates ?? [];
    if (edgeReachesNew(reached, from, to, this.declared.declaresState(to))) {
      this.roundFoundNew = true;
      this.reachedStates = reachedWithTo(reached, to);
    }
  }

  /** Performs the command `RoundEnd`: the round is over. Executable in `"reaching"`. Takes no arguments. */
  roundEnd(): void {
    if (this.roundFoundNew === true) {
      this.roundFoundNew = false;
      this.driver.runRound();
    } else {
      this.currentState = "judging";
      this.driver.reachingDone();
    }
  }

  /**
   * Performs the command `CheckState`. Executable in `"judging"`.
   *
   * @param name the command's `name`: one of the declared states
   */
  checkState(name: string): void {
    if (stateUnreachable(this.reachedStates ?? [], name)) {
      this.findings.report({ code: "unreachable-state", severity: "error", subject: name });
    }
  }

  /**
   * Performs the command `BeginCommand`: a command is judged next. Executable in `"judging"`.
   *
   * @param name the command's `name`: the name of the specification command being judged
   */
  beginCommand(name: string): void {
    this.everyFromDeclared = true;
    this.someFromReached = false;
    this.judgedCommand = name;
  }

  /**
   * Performs the command `From`: one state the command being judged can be executed in. Executable in
   * `"judging"` after `beginCommand`. Asks `stateDeclared` about `state`.
   *
   * @param state the command's `state`: a state name
   */
  from(state: string): void {
    const fromDeclared = this.declared.declaresState(state);
    this.everyFromDeclared = allFromDeclaredNow(this.everyFromDeclared as boolean, fromDeclared);
    this.someFromReached = anyFromReachedNow(this.someFromReached as boolean, this.reachedStates ?? [], state);
  }

  /**
   * Performs the command `EndCommand`: all states of the command being judged have been given. Executable
   * in `"judging"` after `beginCommand`. Takes no arguments.
   */
  endCommand(): void {
    if (commandUnreachable(this.everyFromDeclared as boolean, this.someFromReached as boolean)) {
      this.findings.report({ code: "unreachable-command", severity: "error", subject: this.judgedCommand as string });
    }
  }

  /**
   * Performs the command `BeginExits`: a state is judged next for whether it can be left. Executable in
   * `"judging"`.
   *
   * @param state the command's `state`: the state being judged
   * @param final the command's `final`: whether that state is final
   */
  beginExits(state: string, final: boolean): void {
    this.judgedExitFinal = final;
    this.judgedExitState = state;
    this.judgedLeft = false;
  }

  /**
   * Performs the command `Exit`: one transition of the specification. Executable in `"judging"`.
   *
   * @param from the command's `from`: the state the transition goes from
   * @param to the command's `to`: the state it goes to
   */
  exit(from: string, to: string): void {
    if (this.judgedExitState !== undefined && transitionLeaves(this.judgedExitState, from, to)) {
      this.judgedLeft = true;
    }
  }

  /**
   * Performs the command `EndExits`: all transitions have been given for the state being judged.
   * Executable in `"judging"` after `beginExits`. Takes no arguments.
   */
  endExits(): void {
    const exitState = this.judgedExitState as string;
    const deadEnd = isDeadEnd(
      this.finalsDeclared as boolean,
      this.reachedStates ?? [],
      exitState,
      this.judgedExitFinal as boolean,
      this.judgedLeft as boolean,
    );
    if (deadEnd) {
      this.findings.report({ code: "dead-end-state", severity: "error", subject: exitState });
    }
  }

  /**
   * Performs the command `Vocabulary`: one entry of the vocabulary. Executable in `"judging"`.
   *
   * @param entry the command's input, field for field (`group`, `name`, `used`, `listed`, `takesInput`)
   */
  vocabulary(entry: VocabularyEntry): void {
    const code = vocabularyFindingCode(entry.group, entry.used, entry.takesInput);
    if (code !== null) {
      this.findings.report({ code, severity: vocabularySeverity(this.strict as boolean, entry.listed), subject: entry.name });
    }
  }
}
