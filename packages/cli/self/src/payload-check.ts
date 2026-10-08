/**
 * The payload check itself: a state machine that is driven by commands as the effects of a specification
 * are walked, remembers where the walk is, and talks to its dependencies.
 */

import {
  constantFits,
  decideConstant,
  decideDeclaredField,
  decideEnterEffect,
  decideGivenField,
  decideTyped,
  decideUnresolved,
  inDeclaredEffect,
  kindFits,
  valueStillChecked,
} from "./payload-check-decisions.ts";
import type { FieldValueOutcome } from "./payload-check-decisions.ts";
import type { PayloadCheckDependencies } from "./payload-check-ports.ts";
import type {
  ConstantValue,
  FieldFacts,
  PayloadCheckState,
  PayloadDiagnostic,
  ValueType,
} from "./payload-check-types.ts";

/**
 * Checks the payload a specification gives to an effect against the effect's declaration, one effect at a
 * time.
 *
 * Usage:
 *
 * 1. Construct it with its dependencies. A new check is in state `OUTSIDE` and remembers nothing.
 * 2. For each effect being walked call `enterEffect`, then the methods for its fields, then `leaveEffect`.
 *    `declaredField` hands over a field the effect declares. `givenField` hands over a field the
 *    specification gives to it; what is known about that field's value follows as calls of `constant`
 *    (a concrete value), `typed` (a value known only by its type) and `unresolved` (a reference that
 *    points at nothing).
 * 3. Read `state`, `effect` and `field` at any time to see where the walk stands.
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

  /** The remembered field name; absent until a given field has been remembered. */
  private currentField: string | null = null;

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
   * The name of the given field the walk last remembered (the specification's data field `field`), or
   * `null` while none has been remembered yet. Reading it has no side effect.
   */
  get field(): string | null {
    return this.currentField;
  }

  /**
   * Specification command `EnterEffect`. Applies in state `OUTSIDE`.
   *
   * Tells the check that the walk enters an effect. Asks `EffectDeclarations.isEffectDeclared` about that
   * effect and tells the reporter nothing.
   *
   * @param name the command's `name` input: the name of the effect being entered.
   */
  enterEffect(name: string): void {
    const declared = this.dependencies.declarations.isEffectDeclared(name);
    const outcome = decideEnterEffect(name, declared);
    this.currentState = outcome.state;
    this.currentEffect = outcome.effect;
  }

  /**
   * Specification command `GivenField`. Applies in states `IN_EFFECT`, `IN_FIELD`, `IN_SETTLED_FIELD` and
   * `IN_UNKNOWN_EFFECT`.
   *
   * Hands the check a field that the specification gives to the effect being walked. May ask
   * `EffectDeclarations.isFieldDeclared` about that field of the remembered effect, and may tell the
   * reporter one diagnostic.
   *
   * @param name the command's `name` input: the name of the field given.
   */
  givenField(name: string): void {
    const effect = this.currentEffect ?? "";
    const fieldDeclared = inDeclaredEffect(this.currentState)
      ? this.dependencies.declarations.isFieldDeclared(effect, name)
      : null;
    const outcome = decideGivenField(this.currentState, effect, name, fieldDeclared);
    this.currentState = outcome.state;
    if (outcome.field !== null) {
      this.currentField = outcome.field;
    }
    this.report(outcome.diagnostic);
  }

  /**
   * Specification command `Constant`. Applies in states `IN_FIELD`, `IN_SETTLED_FIELD` and
   * `IN_UNKNOWN_EFFECT`.
   *
   * Hands the check a concrete value given for the field being walked. May ask
   * `EffectDeclarations.fieldKind`, `fieldMinimum`, `fieldMaximum` and `isInFieldSet` about the remembered
   * field of the remembered effect, and may tell the reporter one diagnostic.
   *
   * @param value the command's input as one value: its `kind`, and the `number` or `text` that goes with
   *   that kind (see `ConstantValue`).
   */
  constant(value: ConstantValue): void {
    const effect = this.currentEffect ?? "";
    const field = this.currentField ?? "";
    const fits = valueStillChecked(this.currentState)
      ? constantFits(value, this.fieldFacts(effect, field, value))
      : null;
    this.settle(decideConstant(this.currentState, effect, field, fits));
  }

  /**
   * Specification command `Typed`. Applies in states `IN_FIELD`, `IN_SETTLED_FIELD` and
   * `IN_UNKNOWN_EFFECT`.
   *
   * Hands the check a value for the field being walked that is known only by its type. May ask
   * `EffectDeclarations.fieldKind` about the remembered field of the remembered effect, and may tell the
   * reporter one diagnostic.
   *
   * @param type the command's `type` input: the type of the value.
   */
  typed(type: ValueType): void {
    const effect = this.currentEffect ?? "";
    const field = this.currentField ?? "";
    const fits = valueStillChecked(this.currentState)
      ? kindFits(type, this.dependencies.declarations.fieldKind(effect, field))
      : null;
    this.settle(decideTyped(this.currentState, effect, field, fits));
  }

  /**
   * Specification command `Unresolved`. Applies in states `IN_FIELD`, `IN_SETTLED_FIELD` and
   * `IN_UNKNOWN_EFFECT`. Takes no arguments.
   *
   * Tells the check that the value given for the field being walked is a reference that points at nothing.
   * Asks the dependencies nothing, and may tell the reporter one diagnostic.
   */
  unresolved(): void {
    const effect = this.currentEffect ?? "";
    const field = this.currentField ?? "";
    this.settle(decideUnresolved(this.currentState, effect, field));
  }

  /**
   * Specification command `DeclaredField`. Applies in states `IN_EFFECT` and `IN_UNKNOWN_EFFECT`.
   *
   * Hands the check a field that the effect being walked declares. May ask `GivenPayloads.isFieldGiven`
   * about that field of the remembered effect and may tell the reporter one diagnostic.
   *
   * @param field the command's `name` input: the name of the declared field.
   */
  declaredField(field: string): void {
    if (!inDeclaredEffect(this.currentState)) return;
    const effect = this.currentEffect ?? "";
    const given = this.dependencies.payloads.isFieldGiven(effect, field);
    this.report(decideDeclaredField(effect, field, given));
  }

  /**
   * Specification command `LeaveEffect`. Applies in states `IN_EFFECT`, `IN_FIELD`, `IN_SETTLED_FIELD` and
   * `IN_UNKNOWN_EFFECT`. Takes no arguments.
   *
   * Tells the check that the walk leaves the effect it is in. Asks and tells the dependencies nothing.
   */
  leaveEffect(): void {
    this.currentState = "OUTSIDE";
  }

  /**
   * Gathers what the declaration says about a field, as far as it can matter for the constant given: the
   * bounds only for a numeric constant, and the membership in the field's set only for a string.
   */
  private fieldFacts(effect: string, field: string, value: ConstantValue): FieldFacts {
    const declarations = this.dependencies.declarations;
    const numeric = value.kind === "integer" || value.kind === "number";
    return {
      kind: declarations.fieldKind(effect, field),
      minimum: numeric ? declarations.fieldMinimum(effect, field) : null,
      maximum: numeric ? declarations.fieldMaximum(effect, field) : null,
      inSet: value.kind === "string" ? declarations.isInFieldSet(effect, field, value.value) : null,
    };
  }

  /** Carries out what a value handed over for the field being walked leads to. */
  private settle(outcome: FieldValueOutcome): void {
    this.currentState = outcome.state;
    this.report(outcome.diagnostic);
  }

  /** Tells the reporter about a diagnostic, if there is one. */
  private report(diagnostic: PayloadDiagnostic | null): void {
    if (diagnostic !== null) {
      this.dependencies.diagnostics.report(diagnostic);
    }
  }
}
