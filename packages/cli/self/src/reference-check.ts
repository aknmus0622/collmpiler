/**
 * Reference check of a specification: walks its commands, one element at a
 * time, and reports references to states or effects that are not declared.
 *
 * Corresponds to the specification component "reference-check". One
 * `ReferenceCheck` object performs one walk. It is driven from outside:
 * whoever owns it calls its methods in the order the elements of the checked
 * specification's commands are met, and it tells its `ReferenceCheckListener`
 * about every bad reference it finds.
 *
 * Command -> method:
 *   `Begin`        -> `begin`
 *   `EnterCommand` -> `enterCommand`
 *   `AllowFrom`    -> `allowFrom`
 *   `EnterCase`    -> `enterCase`
 *   `GoTo`         -> `goTo`
 *   `UseEffect`    -> `useEffect`
 *   `LeaveCommand` -> `leaveCommand`
 *   `Finish`       -> `finish`
 *
 * Effect -> listener method:
 *   `ReportDiagnostic` -> `ReferenceCheckListener.reportDiagnostic`
 *
 * Query -> dependency method:
 *   `stateDeclared`  -> `DeclaredStates.isDeclared` (shared with graph-check)
 *   `effectDeclared` -> `DeclaredEffects.isDeclared`
 */

import type { DeclaredStates } from "./graph-check.ts";

export type { DeclaredStates };

/**
 * Where the walk stands; values identical to the specification's states.
 *   `"IDLE"`             before `begin` (the starting state).
 *   `"BETWEEN_COMMANDS"` the walk has started and is outside any command:
 *                        the next command can be entered, or the walk finished.
 *   `"IN_COMMAND"`       inside a command, before any of its cases: the
 *                        states it can be executed in are being given.
 *   `"IN_CASE"`          inside a case of the current command: its target
 *                        states and effects are being given.
 *   `"ACCEPTED"`         the walk is finished and accepted (final).
 *   `"REJECTED"`         the walk is finished and rejected (final).
 */
export type ReferenceCheckState =
  | "IDLE"
  | "BETWEEN_COMMANDS"
  | "IN_COMMAND"
  | "IN_CASE"
  | "ACCEPTED"
  | "REJECTED";

/** Kind of bad reference (spec field `code` of `ReportDiagnostic`); values identical to the specification's. */
export type ReferenceDiagnosticCode = "unknown-state" | "unknown-effect";

/** Payload of the `ReportDiagnostic` effect. Field names identical to the specification's. */
export interface ReferenceDiagnostic {
  /** What kind of reference is bad. */
  code: ReferenceDiagnosticCode;
  /** Name of the command (of the checked specification) the reference occurs in. */
  command: string;
  /** Name of the case the reference occurs in; `""` when it is not inside a case. */
  caseName: string;
  /** The referenced name: a state or an effect. */
  subject: string;
}

/**
 * Dependency: the declared effects of the specification being checked
 * (spec query `effectDeclared`). Asked by `useEffect` when the answer is
 * needed; answers are never cached.
 */
export interface DeclaredEffects {
  /** `true` if `name` is among the checked specification's declared effects. May be called with any string. */
  isDeclared(name: string): boolean;
}

/** Dependency: told what the walk does to its environment (spec effects). */
export interface ReferenceCheckListener {
  /** Spec effect `ReportDiagnostic`: one bad reference, with its code, location and subject. */
  reportDiagnostic(diagnostic: ReferenceDiagnostic): void;
}

/**
 * Performs one walk. Starts in `"IDLE"`. Each method performs one
 * specification command; calling a method in a state the command is not
 * listed for has unspecified behaviour.
 */
export class ReferenceCheck {
  private readonly states: DeclaredStates;
  private readonly effects: DeclaredEffects;
  private readonly listener: ReferenceCheckListener;
  private current: ReferenceCheckState = "IDLE";
  private hasReported = false;
  private commandName = "";
  private currentCase = "";

  /**
   * @param states answers whether a state name is declared in the checked specification (spec query `stateDeclared`).
   * @param effects answers whether an effect name is declared in the checked specification (spec query `effectDeclared`).
   * @param listener receives the diagnostics (spec effect `ReportDiagnostic`).
   */
  constructor(states: DeclaredStates, effects: DeclaredEffects, listener: ReferenceCheckListener) {
    this.states = states;
    this.effects = effects;
    this.listener = listener;
  }

  /** Current state of the walk (spec state names). */
  get state(): ReferenceCheckState {
    return this.current;
  }

  /**
   * Whether the walk has reported anything so far (spec data `reported`).
   * `false` before `begin`.
   */
  get reported(): boolean {
    return this.hasReported;
  }

  /** Name of the command being walked (spec data `command`); `""` before any command was entered. */
  get command(): string {
    return this.commandName;
  }

  /** Name of the case being walked (spec data `caseName`); `""` when not inside a case. */
  get caseName(): string {
    return this.currentCase;
  }

  /** Spec command `Begin` (from `"IDLE"`): starts the walk; moves to `"BETWEEN_COMMANDS"`. Emits nothing. */
  begin(): void {
    this.hasReported = false;
    this.current = "BETWEEN_COMMANDS";
  }

  /**
   * Spec command `EnterCommand` (in `"BETWEEN_COMMANDS"`): the walk enters
   * the checked specification's command called `name`; moves to `"IN_COMMAND"`.
   */
  enterCommand(name: string): void {
    this.commandName = name;
    this.currentCase = "";
    this.current = "IN_COMMAND";
  }

  /**
   * Spec command `AllowFrom` (in `"IN_COMMAND"`): `state` is a state the
   * current command can be executed in. Asks `DeclaredStates` about `state`
   * and may report an `"unknown-state"` diagnostic about it.
   */
  allowFrom(state: string): void {
    if (!this.states.isDeclared(state)) {
      this.report("unknown-state", "", state);
    }
  }

  /**
   * Spec command `EnterCase` (in `"IN_COMMAND"` or `"IN_CASE"`): the walk
   * enters the current command's case called `name`; moves to `"IN_CASE"`.
   */
  enterCase(name: string): void {
    this.currentCase = name;
    this.current = "IN_CASE";
  }

  /**
   * Spec command `GoTo` (in `"IN_CASE"`): the current case leads to `state`.
   * Asks `DeclaredStates` about `state` and may report an `"unknown-state"`
   * diagnostic about it.
   */
  goTo(state: string): void {
    if (!this.states.isDeclared(state)) {
      this.report("unknown-state", this.currentCase, state);
    }
  }

  /**
   * Spec command `UseEffect` (in `"IN_CASE"`): the current case performs the
   * effect called `name`. Asks `DeclaredEffects` about `name` and may report
   * an `"unknown-effect"` diagnostic about it.
   */
  useEffect(name: string): void {
    if (!this.effects.isDeclared(name)) {
      this.report("unknown-effect", this.currentCase, name);
    }
  }

  /**
   * Spec command `LeaveCommand` (in `"IN_COMMAND"` or `"IN_CASE"`): the
   * current command is over; moves to `"BETWEEN_COMMANDS"`.
   */
  leaveCommand(): void {
    this.current = "BETWEEN_COMMANDS";
  }

  /**
   * Spec command `Finish` (in `"BETWEEN_COMMANDS"`): ends the walk, moving
   * to `"ACCEPTED"` or `"REJECTED"`. Emits nothing.
   */
  finish(): void {
    this.current = finalState(this.hasReported);
  }

  /** Performs `ReportDiagnostic` for the current command and remembers that something was reported. */
  private report(code: ReferenceDiagnosticCode, caseName: string, subject: string): void {
    this.listener.reportDiagnostic({ code, command: this.commandName, caseName, subject });
    this.hasReported = true;
  }
}

/**
 * Pure decision for `Finish`: the final state of a walk, given whether it
 * has reported anything (spec data `reported`).
 */
export function finalState(reported: boolean): "ACCEPTED" | "REJECTED" {
  return reported ? "REJECTED" : "ACCEPTED";
}
