/**
 * The reference check itself: a state machine that is driven by commands as a specification is walked,
 * remembers where the walk is, and talks to its dependencies.
 */

import { decideFinish, decideReference } from "./reference-check-decisions.ts";
import type { ReferenceCheckDependencies } from "./reference-check-ports.ts";
import type { DiagnosticCode, ReferenceCheckState, WalkMemory } from "./reference-check-types.ts";

/**
 * Checks the references to states and effects met while one specification is walked.
 *
 * Usage:
 *
 * 1. Construct it with its dependencies. A new check is in state `IDLE` and remembers nothing.
 * 2. Call `begin` once.
 * 3. For each command of the specification being walked call `enterCommand`, then the methods for what the
 *    command contains (`allowFrom`, `enterCase`, `goTo`, `useEffect`), then `leaveCommand`.
 * 4. Call `finish` once, then read `state` for the verdict.
 * 5. Read `state` and `memory` at any time to see where the walk stands.
 *
 * Every command method is synchronous and returns nothing; whatever it asks or tells the dependencies has
 * been asked or told by the time it returns. Each command applies only in the states named in its comment;
 * calling it in any other state is a usage error with unspecified behaviour.
 */
export class ReferenceCheck {
  private readonly dependencies: ReferenceCheckDependencies;

  /**
   * The current state. Deliberately not assigned in the skeleton: whoever writes the bodies gives it its
   * starting value (an initialiser may be added to this declaration).
   */
  private currentState: ReferenceCheckState = "IDLE";

  /** The remembered data; absent until the walk has begun. */
  private currentMemory: WalkMemory | null = null;

  /**
   * @param dependencies the declarations that are asked whether a state or an effect is declared, and the
   *   reporter that is told about each problem found.
   */
  constructor(dependencies: ReferenceCheckDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * The current state, under the specification's own state names (see `ReferenceCheckState` for what each
   * one means). Reading it has no side effect.
   */
  get state(): ReferenceCheckState {
    return this.currentState;
  }

  /**
   * The data remembered between commands (the specification's `data`; see `WalkMemory` for the fields), or
   * `null` while nothing has been remembered yet, that is, before `begin`. A single field that has not been
   * remembered yet is `null` inside the value. Reading it has no side effect.
   */
  get memory(): WalkMemory | null {
    return this.currentMemory;
  }

  /**
   * Specification command `Begin`. Applies in state `IDLE`. Takes no arguments.
   *
   * Begins the walk. Asks and tells the dependencies nothing.
   */
  begin(): void {
    this.currentState = "BETWEEN_COMMANDS";
    this.currentMemory = { errors: 0, command: null, caseName: null };
  }

  /**
   * Specification command `EnterCommand`. Applies in state `BETWEEN_COMMANDS`.
   *
   * Tells the check that the walk enters a command of the specification being walked. Asks and tells the
   * dependencies nothing.
   *
   * @param name the command's `name` input: the name of the command being entered.
   */
  enterCommand(name: string): void {
    this.currentMemory = { ...this.remembered(), command: name, caseName: "" };
    this.currentState = "IN_COMMAND";
  }

  /**
   * Specification command `AllowFrom`. Applies in state `IN_COMMAND`.
   *
   * Hands the check a state that the command being walked names as one it can be executed from. Asks
   * `Declarations.isStateDeclared` about that state and may tell the reporter one diagnostic.
   *
   * @param state the command's `state` input: the state name referred to.
   */
  allowFrom(state: string): void {
    this.checkReference("unknown-state", state, this.dependencies.declarations.isStateDeclared(state));
  }

  /**
   * Specification command `EnterCase`. Applies in states `IN_COMMAND` and `IN_CASE`.
   *
   * Tells the check that the walk enters a case of the command being walked. Asks and tells the
   * dependencies nothing.
   *
   * @param name the command's `name` input: the name of the case being entered.
   */
  enterCase(name: string): void {
    this.currentMemory = { ...this.remembered(), caseName: name };
    this.currentState = "IN_CASE";
  }

  /**
   * Specification command `GoTo`. Applies in state `IN_CASE`.
   *
   * Hands the check the state that the case being walked leads to. Asks `Declarations.isStateDeclared`
   * about that state and may tell the reporter one diagnostic.
   *
   * @param state the command's `state` input: the state name referred to.
   */
  goTo(state: string): void {
    this.checkReference("unknown-state", state, this.dependencies.declarations.isStateDeclared(state));
  }

  /**
   * Specification command `UseEffect`. Applies in state `IN_CASE`.
   *
   * Hands the check an effect that the case being walked performs. Asks `Declarations.isEffectDeclared`
   * about that effect and may tell the reporter one diagnostic.
   *
   * @param name the command's `name` input: the effect name referred to.
   */
  useEffect(name: string): void {
    this.checkReference("unknown-effect", name, this.dependencies.declarations.isEffectDeclared(name));
  }

  /**
   * Specification command `LeaveCommand`. Applies in states `IN_COMMAND` and `IN_CASE`. Takes no arguments.
   *
   * Tells the check that the walk leaves the command it is in. Asks and tells the dependencies nothing.
   */
  leaveCommand(): void {
    this.currentState = "BETWEEN_COMMANDS";
  }

  /**
   * Specification command `Finish`. Applies in state `BETWEEN_COMMANDS`. Takes no arguments.
   *
   * Ends the walk; afterwards `state` holds the verdict. Asks and tells the dependencies nothing.
   */
  finish(): void {
    this.currentState = decideFinish(this.remembered());
  }

  /** The remembered data, for the commands that apply only after `begin`. */
  private remembered(): WalkMemory {
    if (this.currentMemory === null) {
      throw new Error("the walk has not begun");
    }
    return this.currentMemory;
  }

  /** Reports the diagnostic the reference leads to, if any, and remembers its data. The walk stays put. */
  private checkReference(code: DiagnosticCode, subject: string, declared: boolean): void {
    const outcome = decideReference(code, subject, declared, this.remembered());
    if (outcome.diagnostic !== null) {
      this.dependencies.diagnostics.report(outcome.diagnostic);
    }
    this.currentMemory = outcome.memory;
  }
}
