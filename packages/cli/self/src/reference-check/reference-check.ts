import type {
  DeclaredNames,
  ReferenceCheckState,
  ReferenceDiagnosticCode,
  ReferenceDiagnosticSink,
} from "./types.ts";
import { verdictOf } from "./verdict.ts";

/**
 * Checks the references to states and effects made by the commands of a specification. It is driven as a
 * walk: `begin` once, then one command after another (`enterCommand`, any number of `allowFrom` calls,
 * any number of cases each opened by `enterCase` and described by `goTo` and `useEffect` calls, then
 * `leaveCommand`), then `finish` once. Diagnostics go to the sink passed to the constructor.
 *
 * One instance is one walk. A new instance starts in the specification's initial state with nothing
 * remembered. Each method below performs one command of the specification; a command returns nothing, and
 * its outcome is observed through `state`, `command`, `caseName`, `reported`, and the calls made on the
 * dependencies.
 */
export class ReferenceCheck {
  private readonly declared: DeclaredNames;
  private readonly diagnostics: ReferenceDiagnosticSink;
  private currentState: ReferenceCheckState = "idle";
  private currentCommand: string | undefined = undefined;
  private currentCaseName: string | undefined = undefined;
  private somethingReported: boolean | undefined = undefined;

  /**
   * @param declared answers the queries `stateDeclared` and `effectDeclared`
   * @param diagnostics receives the effect `ReportDiagnostic`
   */
  constructor(declared: DeclaredNames, diagnostics: ReferenceDiagnosticSink) {
    this.declared = declared;
    this.diagnostics = diagnostics;
  }

  /** The current state. `ReferenceCheckState` lists the specification name of each value. */
  get state(): ReferenceCheckState {
    return this.currentState;
  }

  /** The specification's `data.command`; `undefined` until a command has stored it. */
  get command(): string | undefined {
    return this.currentCommand;
  }

  /** The specification's `data.caseName`; `undefined` until a command has stored it. */
  get caseName(): string | undefined {
    return this.currentCaseName;
  }

  /** The specification's `data.reported`; `undefined` until a command has stored it. */
  get reported(): boolean | undefined {
    return this.somethingReported;
  }

  /** Performs the command `Begin`. Takes no arguments. */
  begin(): void {
    this.somethingReported = false;
    this.currentState = "between-commands";
  }

  /**
   * Performs the command `EnterCommand`.
   *
   * @param name the command's `name`: the name of the specification command being walked
   */
  enterCommand(name: string): void {
    this.currentCommand = name;
    this.currentCaseName = "";
    this.currentState = "in-command";
  }

  /**
   * Performs the command `AllowFrom`.
   *
   * @param state the command's `state`: a state name
   */
  allowFrom(state: string): void {
    if (!this.declared.declaresState(state)) this.reportUnknown("unknown-state", state);
  }

  /**
   * Performs the command `EnterCase`.
   *
   * @param name the command's `name`: a case name
   */
  enterCase(name: string): void {
    this.currentCaseName = name;
    this.currentState = "in-case";
  }

  /**
   * Performs the command `GoTo`.
   *
   * @param state the command's `state`: a state name
   */
  goTo(state: string): void {
    if (!this.declared.declaresState(state)) this.reportUnknown("unknown-state", state);
  }

  /**
   * Performs the command `UseEffect`.
   *
   * @param name the command's `name`: an effect name
   */
  useEffect(name: string): void {
    if (!this.declared.declaresEffect(name)) this.reportUnknown("unknown-effect", name);
  }

  /** Performs the command `LeaveCommand`. Takes no arguments. */
  leaveCommand(): void {
    this.currentState = "between-commands";
  }

  /** Performs the command `Finish`. Takes no arguments. */
  finish(): void {
    this.currentState = verdictOf(this.somethingReported as boolean);
  }

  /**
   * Reports a reference to an undeclared name at the walk's position and remembers that something was
   * reported. Outside a case the remembered case name is the empty one stored on entering the command.
   */
  private reportUnknown(code: ReferenceDiagnosticCode, subject: string): void {
    this.diagnostics.report({
      code,
      command: this.currentCommand as string,
      caseName: this.currentCaseName as string,
      subject,
    });
    this.somethingReported = true;
  }
}
