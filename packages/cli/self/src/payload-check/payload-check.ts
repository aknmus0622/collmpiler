import { constantFits, enterSlotVerdict, isVariants, nullFits, sourceAllowed, typeFits } from "./fit.ts";
import type { FieldFacts } from "./fit.ts";
import type {
  ConstantValue,
  GivenSlot,
  PayloadDiagnosticCode,
  PayloadCheckState,
  PayloadDiagnosticSink,
  Slot,
  SlotDeclarations,
  SlotKind,
  ValueSource,
  ValueType,
} from "./types.ts";

/**
 * Validates the values a specification writes against the declarations they must match. It is driven
 * as a walk over one slot after another: `enterSlot`, then any number of `declaredField` and `givenField`
 * calls (a `givenField` is followed by `source`, `constant`, `typed`, `nullValue`, `judged` or
 * `unresolved` calls describing its value), then `leaveSlot`. Diagnostics go to the sink passed to the
 * constructor.
 *
 * The dependencies answer about the slot currently being walked; whoever drives the walk keeps them
 * pointed at that slot.
 *
 * One instance is one walk. A new instance starts in the specification's initial state with nothing
 * remembered. Each method below performs one command of the specification; a command returns nothing, and
 * its outcome is observed through `state`, `field`, `slotKind`, `variants`, and the calls made on the
 * dependencies.
 */
export class PayloadCheck {
  private readonly declarations: SlotDeclarations;
  private readonly given: GivenSlot;
  private readonly diagnostics: PayloadDiagnosticSink;
  private currentState: PayloadCheckState = "outside";
  private currentField: string | undefined = undefined;
  private currentSlotKind: SlotKind | undefined = undefined;
  private currentVariants: boolean | undefined = undefined;

  /**
   * @param declarations answers the queries `fieldDeclared`, `fieldKind`, `fieldOptional`, `hasMinimum`,
   *   `minimum`, `hasMaximum`, `maximum` and `memberOf`
   * @param given answers the query `fieldGiven`
   * @param diagnostics receives the effect `Report`
   */
  constructor(declarations: SlotDeclarations, given: GivenSlot, diagnostics: PayloadDiagnosticSink) {
    this.declarations = declarations;
    this.given = given;
    this.diagnostics = diagnostics;
  }

  /** The current state. `PayloadCheckState` lists the specification name of each value. */
  get state(): PayloadCheckState {
    return this.currentState;
  }

  /**
   * The specification's `data.checkedField`: name passed to the latest `givenField`, or `""` after
   * `enterSlot`.
   * `undefined` until a command has stored it.
   */
  get field(): string | undefined {
    return this.currentField;
  }

  /** The specification's `data.slotKind`; `undefined` until a command has stored it. */
  get slotKind(): SlotKind | undefined {
    return this.currentSlotKind;
  }

  /** The specification's `data.variants`; `undefined` until a command has stored it. */
  get variants(): boolean | undefined {
    return this.currentVariants;
  }

  /**
   * Performs the command `EnterSlot`.
   *
   * @param slot the command's input; `Slot` documents each member
   */
  enterSlot(slot: Slot): void {
    const verdict = enterSlotVerdict(slot);
    if (verdict.report !== undefined) this.diagnostics.report({ code: verdict.report, field: "" });
    this.currentState = verdict.checked ? "active" : "inactive";
    this.currentField = "";
    this.currentSlotKind = slot.kind;
    this.currentVariants = isVariants(slot);
  }

  /**
   * Performs the command `DeclaredField`: announces one field name from the current slot's declaration.
   *
   * @param name the command's `name`: a field name
   */
  declaredField(name: string): void {
    if (!this.fieldsChecked() || !mustGiveAllFields(this.currentSlotKind, this.currentVariants)) return;
    if (!this.given.givesField(name)) this.diagnostics.report({ code: "missing-field", field: name });
  }

  /**
   * Performs the command `GivenField`: announces one field name written in the current slot; the calls
   * describing its value come after it.
   *
   * @param name the command's `name`: a field name
   */
  givenField(name: string): void {
    if (!this.fieldsChecked()) return;
    this.currentField = name;
    if (this.declarations.declaresField(name)) {
      this.currentState = "checking";
      return;
    }
    if (this.currentVariants === true) this.diagnostics.report({ code: "wrong-shape", field: "" });
    else this.diagnostics.report({ code: "unknown-field", field: name });
    this.currentState = "settled";
  }

  /**
   * Performs the command `Source`: tells the origin of the current field's value.
   *
   * @param kind the command's `kind`
   */
  source(kind: ValueSource): void {
    if (this.currentState !== "checking" || this.currentSlotKind === undefined) return;
    if (sourceAllowed(this.currentSlotKind, kind)) return;
    this.reportField("bad-source");
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

  /** Performs the command `Null`: the current field's value is a literal `null`. Takes no arguments. */
  nullValue(): void {
    this.checkValue((facts) => nullFits(facts));
  }

  /**
   * Performs the command `Judged`: passes on the caller's own compatibility result for a composite value
   * (record, list, ...) written for the current field.
   *
   * @param fits the command's `fits`
   */
  judged(fits: boolean): void {
    this.checkValue(() => fits);
  }

  /** Performs the command `Unresolved`. Takes no arguments. */
  unresolved(): void {
    this.checkValue(() => false);
  }

  /** Performs the command `LeaveSlot`. Takes no arguments. */
  leaveSlot(): void {
    this.currentState = "outside";
  }

  /**
   * Judges a value of the field being walked with the given decision, reporting it when it does not fit.
   */
  private checkValue(fits: (facts: FieldFacts) => boolean): void {
    if (this.currentState !== "checking" || this.currentField === undefined) return;
    if (fits(this.factsOf(this.currentField))) return;
    this.reportField("mismatch");
  }

  /** Reports a diagnostic about the field being walked; what follows about its value is ignored. */
  private reportField(code: PayloadDiagnosticCode): void {
    this.diagnostics.report({ code, field: this.currentField ?? "" });
    this.currentState = "settled";
  }

  /** Whether the walk is inside a slot whose fields are checked. */
  private fieldsChecked(): boolean {
    return this.currentState === "active" || this.currentState === "checking" || this.currentState === "settled";
  }

  /** The declaration of one field, read from `declarations` only as far as a decision looks at it. */
  private factsOf(field: string): FieldFacts {
    const declarations = this.declarations;
    return {
      get type() {
        return declarations.fieldType(field);
      },
      get minimum() {
        return declarations.minimum(field);
      },
      get maximum() {
        return declarations.maximum(field);
      },
      get optional() {
        return declarations.isOptional(field);
      },
      isMember(value: string): boolean {
        return declarations.isMember(field, value);
      },
    };
  }
}

/**
 * Whether every field a slot declares must be given: an effect, an asked query, a contained component's
 * command, or a command's answer with fields (not one of several variants).
 */
function mustGiveAllFields(slotKind: SlotKind | undefined, variants: boolean | undefined): boolean {
  switch (slotKind) {
    case "effect":
    case "asks":
    case "calls":
      return true;
    case "responds":
      return variants !== true;
    default:
      return false;
  }
}
