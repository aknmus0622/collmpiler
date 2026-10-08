import { nextErrors, verdictFor } from "./tally.ts";
import type {
  DeclaredNames,
  ReferenceCheckState,
  ReferenceDiagnosticCode,
  ReferenceDiagnosticSink,
} from "./types.ts";

/**
 * Checks the references a specification's commands make to states and effects. It is driven as a walk
 * over one command after another: `begin` once, then per command `enterCommand`, any number of
 * `allowFrom` calls, any number of cases (`enterCase` followed by `goTo` and `useEffect` calls), then
 * `leaveCommand`; `finish` ends the walk. Diagnostics go to the sink passed to the constructor.
 *
 * One instance is one walk. A new instance starts in the specification's initial state with nothing
 * remembered. Each method below performs one command of the specification; a command returns nothing, and
 * its outcome is observed through `state`, `command`, `caseName`, `errors`, and the calls made on the
 * dependencies. Calls on the dependencies are made synchronously, in the order the specification lists
 * the effects.
 */
export class ReferenceCheck {
  private readonly declared: DeclaredNames;
  private readonly diagnostics: ReferenceDiagnosticSink;
  private currentState: ReferenceCheckState = "idle";
  private currentCommand: string | undefined = undefined;
  private currentCaseName: string | undefined = undefined;
  private errorCount: number | undefined = undefined;

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

  /** The specification's `data.errors`; `undefined` until a command has stored it. */
  get errors(): number | undefined {
    return this.errorCount;
  }

  /** Performs the command `Begin`. Takes no arguments. */
  begin(): void {
    if (this.currentState !== "idle") return;
    this.errorCount = 0;
    this.currentState = "between-commands";
  }

  /**
   * Performs the command `EnterCommand`.
   *
   * @param name the command's `name`: the name of a command of the specification under check
   */
  enterCommand(name: string): void {
    if (this.currentState !== "between-commands") return;
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
    if (this.currentState !== "in-command") return;
    if (!this.declared.declaresState(state)) this.reportUnknown("unknown-state", "", state);
  }

  /**
   * Performs the command `EnterCase`.
   *
   * @param name the command's `name`: a case name
   */
  enterCase(name: string): void {
    if (this.currentState !== "in-command" && this.currentState !== "in-case") return;
    this.currentCaseName = name;
    this.currentState = "in-case";
  }

  /**
   * Performs the command `GoTo`.
   *
   * @param state the command's `state`: a state name
   */
  goTo(state: string): void {
    if (this.currentState !== "in-case") return;
    if (!this.declared.declaresState(state)) {
      this.reportUnknown("unknown-state", this.currentCaseName as string, state);
    }
  }

  /**
   * Performs the command `UseEffect`.
   *
   * @param name the command's `name`: an effect name
   */
  useEffect(name: string): void {
    if (this.currentState !== "in-case") return;
    if (!this.declared.declaresEffect(name)) {
      this.reportUnknown("unknown-effect", this.currentCaseName as string, name);
    }
  }

  /** Performs the command `LeaveCommand`. Takes no arguments. */
  leaveCommand(): void {
    if (this.currentState !== "in-command" && this.currentState !== "in-case") return;
    this.currentState = "between-commands";
  }

  /** Performs the command `Finish`. Takes no arguments. */
  finish(): void {
    if (this.currentState !== "between-commands") return;
    this.currentState = verdictFor(this.errorCount as number);
  }

  /** Reports one unresolved reference for the remembered command and counts it as an error. */
  private reportUnknown(code: ReferenceDiagnosticCode, caseName: string, subject: string): void {
    this.diagnostics.report({ code, command: this.currentCommand as string, caseName, subject });
    this.errorCount = nextErrors(this.errorCount as number);
  }
}
