/**
 * The payload check itself: a state machine that is driven by commands as the effects of a specification
 * are walked, remembers where the walk is, and talks to its dependencies.
 */

import { decideDeclaredField, decideEnterEffect, decideGivenField } from "./payload-check-decisions.ts";
import type { PayloadCheckDependencies } from "./payload-check-ports.ts";
import type { PayloadCheckState, PayloadDiagnostic, ValueKind } from "./payload-check-types.ts";

/**
 * Checks the payload a specification gives to an effect against the effect's declaration, one effect at a
 * time.
 *
 * Usage:
 *
 * 1. Construct it with its dependencies. A new check is in state `OUTSIDE` and remembers nothing.
 * 2. For each effect being walked call `enterEffect`, then the methods for its fields (`givenField` for a
 *    field the specification gives to it, `declaredField` for a field the effect declares), then
 *    `leaveEffect`.
 * 3. Read `state` and `effect` at any time to see where the walk stands.
 *
 * Every command method is synchronous and returns nothing; whatever it asks or tells the dependencies has
 * been asked or told by the time it returns. Each command applies only in the states named in its comment;
 * calling it in any other state is a usage error with unspecified behaviour.
 */
export class PayloadCheck {
  private readonly dependencies: PayloadCheckDependencies;

  /** The current state; a new check starts between effects. */
  private currentState: PayloadCheckState = "OUTSIDE";

  /** The remembered effect name; absent until an effect has been entered. */
  private currentEffect: string | null = null;

  /**
   * @param dependencies the declarations that are asked about effects and their fields, the payloads that
   *   are asked whether a field is given a value, and the reporter that is told about each problem found.
   */
  constructor(dependencies: PayloadCheckDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * The current state, under the specification's own state names (see `PayloadCheckState` for what each
   * one means). Reading it has no side effect.
   */
  get state(): PayloadCheckState {
    return this.currentState;
  }

  /**
   * The name of the effect the walk last entered (the specification's data field `effect`), or `null`
   * while no effect has been entered yet. Reading it has no side effect.
   */
  get effect(): string | null {
    return this.currentEffect;
  }

  /**
   * Specification command `EnterEffect`. Applies in state `OUTSIDE`.
   *
   * Tells the check that the walk enters an effect. Asks `EffectDeclarations.isEffectDeclared` about that
   * effect and may tell the reporter one diagnostic.
   *
   * @param name the command's `name` input: the name of the effect being entered.
   */
  enterEffect(name: string): void {
    const declared = this.dependencies.declarations.isEffectDeclared(name);
    const outcome = decideEnterEffect(name, declared);
    this.currentState = outcome.state;
    this.currentEffect = outcome.effect;
    this.report(outcome.diagnostic);
  }

  /**
   * Specification command `GivenField`. Applies in states `IN_EFFECT` and `IN_UNKNOWN_EFFECT`.
   *
   * Hands the check a field that the specification gives to the effect being walked. May ask
   * `EffectDeclarations.isFieldDeclared` and `EffectDeclarations.fieldKind` about that field of the
   * remembered effect, and may tell the reporter one diagnostic.
   *
   * @param field the command's `field` input: the name of the field given.
   * @param kind the command's `kind` input: the kind of the value given.
   */
  givenField(field: string, kind: ValueKind): void {
    const effect = this.currentEffect ?? "";
    let fieldDeclared: boolean | null = null;
    let fieldKind: ValueKind | null = null;
    // The fields of an effect that is not declared are not checked, so nothing is asked about them.
    if (this.currentState === "IN_EFFECT") {
      fieldDeclared = this.dependencies.declarations.isFieldDeclared(effect, field);
      if (fieldDeclared) {
        fieldKind = this.dependencies.declarations.fieldKind(effect, field);
      }
    }
    this.report(decideGivenField(this.currentState, effect, field, kind, fieldDeclared, fieldKind));
  }

  /**
   * Specification command `DeclaredField`. Applies in state `IN_EFFECT`.
   *
   * Hands the check a field that the effect being walked declares. Asks `GivenPayloads.isFieldGiven` about
   * that field of the remembered effect and may tell the reporter one diagnostic.
   *
   * @param field the command's `field` input: the name of the declared field.
   */
  declaredField(field: string): void {
    const effect = this.currentEffect ?? "";
    const given = this.dependencies.payloads.isFieldGiven(effect, field);
    this.report(decideDeclaredField(effect, field, given));
  }

  /**
   * Specification command `LeaveEffect`. Applies in states `IN_EFFECT` and `IN_UNKNOWN_EFFECT`. Takes no
   * arguments.
   *
   * Tells the check that the walk leaves the effect it is in. Asks and tells the dependencies nothing.
   */
  leaveEffect(): void {
    this.currentState = "OUTSIDE";
  }

  /** Tells the reporter about a diagnostic, if there is one. */
  private report(diagnostic: PayloadDiagnostic | null): void {
    if (diagnostic !== null) {
      this.dependencies.diagnostics.report(diagnostic);
    }
  }
}
