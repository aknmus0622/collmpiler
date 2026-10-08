import { constantFits, typeFits } from "./fit.ts";
import type { FieldFacts } from "./fit.ts";
import type {
  ConstantValue,
  EffectDeclarations,
  GivenPayload,
  PayloadCheckState,
  PayloadDiagnosticSink,
  ValueType,
} from "./types.ts";

/**
 * Compares effect payloads with effect declarations. It is driven as a walk over one effect after
 * another: `enterEffect`, then any number of `declaredField` and `givenField` calls (a `givenField` is
 * followed by `constant`, `typed` or `unresolved` calls describing its value), then `leaveEffect`.
 * Diagnostics go to the sink passed to the constructor.
 *
 * One instance is one walk. A new instance starts in the specification's initial state with nothing
 * remembered. Each method below performs one command of the specification; a command returns nothing, and
 * its outcome is observed through `state`, `effect`, `field`, and the calls made on the dependencies.
 */
export class PayloadCheck {
  private readonly declarations: EffectDeclarations;
  private readonly given: GivenPayload;
  private readonly diagnostics: PayloadDiagnosticSink;
  private currentState: PayloadCheckState = "outside";
  private currentEffect: string | undefined = undefined;
  private currentField: string | undefined = undefined;

  /**
   * @param declarations answers the queries `effectDeclared`, `fieldDeclared`, `fieldKind`, `hasMinimum`,
   *   `minimum`, `hasMaximum`, `maximum` and `memberOf`
   * @param given answers the query `fieldGiven`
   * @param diagnostics receives the effect `ReportDiagnostic`
   */
  constructor(declarations: EffectDeclarations, given: GivenPayload, diagnostics: PayloadDiagnosticSink) {
    this.declarations = declarations;
    this.given = given;
    this.diagnostics = diagnostics;
  }

  /** The current state. `PayloadCheckState` lists the specification name of each value. */
  get state(): PayloadCheckState {
    return this.currentState;
  }

  /** The specification's `data.effect`; `undefined` until a command has stored it. */
  get effect(): string | undefined {
    return this.currentEffect;
  }

  /** The specification's `data.field`; `undefined` until a command has stored it. */
  get field(): string | undefined {
    return this.currentField;
  }

  /**
   * Performs the command `EnterEffect`.
   *
   * @param name the command's `name`: an effect name
   */
  enterEffect(name: string): void {
    this.currentEffect = name;
    this.currentState = this.declarations.declaresEffect(name) ? "in-effect" : "in-unknown-effect";
  }

  /**
   * Performs the command `DeclaredField`.
   *
   * @param name the command's `name`: a field name
   */
  declaredField(name: string): void {
    if (this.currentState !== "in-effect") return;
    const effect = this.currentEffect as string;
    if (!this.given.givesField(effect, name)) {
      this.diagnostics.report({ code: "missing-field", effect, field: name });
    }
  }

  /**
   * Performs the command `GivenField`.
   *
   * @param name the command's `name`: a field name
   */
  givenField(name: string): void {
    if (this.currentState === "in-unknown-effect") return;
    const effect = this.currentEffect as string;
    this.currentField = name;
    if (this.declarations.declaresField(effect, name)) {
      this.currentState = "in-field";
    } else {
      this.settle(effect, name);
    }
  }

  /**
   * Performs the command `Constant`.
   *
   * @param value the command's input; `ConstantValue` documents how it maps to the command's `kind`,
   *   `text` and `number`
   */
  constant(value: ConstantValue): void {
    this.checkValue((facts) => constantFits(value, facts));
  }

  /**
   * Performs the command `Typed`.
   *
   * @param type the command's `type`
   */
  typed(type: ValueType): void {
    this.checkValue((facts) => typeFits(type, facts.type));
  }

  /** Performs the command `Unresolved`. Takes no arguments. */
  unresolved(): void {
    this.checkValue(() => false);
  }

  /** Performs the command `LeaveEffect`. Takes no arguments. */
  leaveEffect(): void {
    this.currentState = "outside";
  }

  /**
   * Judges a value of the field being walked. Does nothing unless the field's value is still being
   * checked; a value that does not fit settles the field with a bad-value diagnostic.
   */
  private checkValue(fits: (facts: FieldFacts) => boolean): void {
    if (this.currentState !== "in-field") return;
    const effect = this.currentEffect as string;
    const field = this.currentField as string;
    if (!fits(this.factsOf(effect, field))) this.settle(effect, field);
  }

  /** Reports the one diagnostic a given field gets and stops checking what follows about its value. */
  private settle(effect: string, field: string): void {
    this.diagnostics.report({ code: "bad-value", effect, field });
    this.currentState = "in-settled-field";
  }

  /** The declaration of one field, read from the catalogue only as far as a decision looks at it. */
  private factsOf(effect: string, field: string): FieldFacts {
    const declarations = this.declarations;
    return {
      get type() {
        return declarations.fieldType(effect, field);
      },
      get minimum() {
        return declarations.minimum(effect, field);
      },
      get maximum() {
        return declarations.maximum(effect, field);
      },
      isMember: (value) => declarations.isMember(effect, field, value),
    };
  }
}
