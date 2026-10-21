/**
 * Payload check over a specification: walks, slot by slot, every place where
 * the specification puts values (an effect's input, an asked query's input, a
 * contained component's command, remembered data, a command's answer, ...)
 * and reports what does not fit what is declared for that place.
 *
 * Corresponds to the specification component "payload-check". One
 * `PayloadCheck` object checks one specification. It is driven from outside:
 * whoever owns it walks the specification and, for each slot, calls
 * `enterSlot`, then per declared field `declaredField`, then per given field
 * `givenField` followed by what is known about that field's value
 * (`source`, `constant`, `typed`, `judged`, `nullValue`, `unresolved`), and
 * finally `leaveSlot`. It tells its `PayloadCheckListener` each finding.
 *
 * Command -> method:
 *   `EnterSlot`     -> `enterSlot`
 *   `DeclaredField` -> `declaredField`
 *   `GivenField`    -> `givenField`
 *   `Source`        -> `source`
 *   `Constant`      -> `constant`
 *   `Typed`         -> `typed`
 *   `Judged`        -> `judged`
 *   `Null`          -> `nullValue`
 *   `Unresolved`    -> `unresolved`
 *   `LeaveSlot`     -> `leaveSlot`
 *
 * Effect -> listener method:
 *   `Report` -> `PayloadCheckListener.report`
 *
 * Query -> dependency method (all on `SlotDeclaration`):
 *   `fieldDeclared` -> `SlotDeclaration.declaresField`
 *   `fieldGiven`    -> `SlotDeclaration.givesField`
 *   `fieldKind`     -> `SlotDeclaration.fieldKind`
 *   `fieldOptional` -> `SlotDeclaration.isOptional`
 *   `hasMinimum`    -> `SlotDeclaration.hasMinimum`
 *   `minimum`       -> `SlotDeclaration.minimum`
 *   `hasMaximum`    -> `SlotDeclaration.hasMaximum`
 *   `maximum`       -> `SlotDeclaration.maximum`
 *   `memberOf`      -> `SlotDeclaration.isMember`
 */

/**
 * Where the walk stands; values identical to the specification's states.
 *   `"OUTSIDE"`  between slots (the starting state).
 *   `"INACTIVE"` in a slot whose fields are not checked (its target is
 *                unknown, or its shape is already wrong); nothing is reported
 *                until the walk leaves it.
 *   `"ACTIVE"`   in a slot whose fields are checked, with no given field
 *                being checked.
 *   `"CHECKING"` a given, declared field's value is being checked.
 *   `"SETTLED"`  a given field has already been reported; what follows about
 *                its value is ignored.
 */
export type PayloadCheckState = "OUTSIDE" | "INACTIVE" | "ACTIVE" | "CHECKING" | "SETTLED";

/** Kind of slot (spec input `kind` of `EnterSlot`, spec data `slotKind`); values identical to the specification's. */
export type SlotKind =
  | "effect"
  | "asks"
  | "calls"
  | "set"
  | "responds"
  | "change"
  | "adds"
  | "initially"
  | "onlyWhen";

/**
 * How the specification gives the slot's value (spec input `given` of
 * `EnterSlot`); values identical to the specification's.
 *   `"none"`   nothing is given.
 *   `"single"` a single value is given.
 *   `"fields"` a value per field is given.
 */
export type GivenShape = "none" | "single" | "fields";

/**
 * What the slot's target declares as its output (spec input `output` of
 * `EnterSlot`; meaningful for a command's answer); values identical to the
 * specification's.
 *   `"none"`    no output is declared.
 *   `"single"`  a single value.
 *   `"fields"`  a record with fields.
 *   `"variant"` one of several variants.
 */
export type DeclaredOutput = "none" | "single" | "fields" | "variant";

/** Kind of finding (spec field `code` of the `Report` effect); values identical to the specification's. */
export type PayloadFindingCode =
  | "unknown-target"
  | "keyed-mismatch"
  | "unknown-command"
  | "missing-field"
  | "unknown-field"
  | "bad-source"
  | "mismatch"
  | "no-output"
  | "missing-response"
  | "wrong-shape";

/** Payload of the `Report` effect. Field names identical to the specification's. */
export interface PayloadFinding {
  /** What is wrong. */
  code: PayloadFindingCode;
  /** The field it is about; `""` for the slot as a whole. */
  field: string;
}

/** Input of `EnterSlot`: what is known about the slot being entered. Field names identical to the specification's. */
export interface SlotEntry {
  /** What kind of slot it is. */
  kind: SlotKind;
  /** `true` if the slot's target (effect, query, part, ...) is declared. */
  declared: boolean;
  /** For a contained component's command: `true` if the part has that command. */
  commandDeclared: boolean;
  /** For a contained component's command: `true` if the part is asked with a key exactly when it needs one. */
  keyedOk: boolean;
  /** How the specification gives the slot's value. */
  given: GivenShape;
  /** How many fields are given (0 to 100). */
  givenCount: number;
  /** What the target declares as its output. */
  output: DeclaredOutput;
}

/** Kind of origin of a field's value (spec input `kind` of `Source`); values identical to the specification's. */
export type ValueSourceKind = "constant" | "input" | "data" | "other";

/** A primitive value type (spec input `type` of `Typed`, `kind` of `Constant`); values identical to the specification's. */
export type PrimitiveType = "boolean" | "integer" | "number" | "string";

/**
 * Input of `Constant`: a concrete value. Field names identical to the
 * specification's. `kind` says what the value is; `text` carries it when it
 * is a string, `number` when it is a number (integer or not). For a boolean
 * the value itself is not passed.
 */
export interface ConstantValue {
  kind: PrimitiveType;
  text: string;
  number: number;
}

/**
 * What a field takes (answer of spec query `fieldKind`); values identical to
 * the specification's.
 *   a `PrimitiveType` that primitive.
 *   `"enum"`          one of a fixed set of strings.
 *   `"value"`         any value.
 *   `"structured"`    a structured type (list, record, ...).
 */
export type FieldKind = PrimitiveType | "enum" | "value" | "structured";

/**
 * Dependency: the declaration of the slot currently being walked, and what
 * the specification gives in it. Asked at the moment an answer is needed;
 * answers are never cached. Every `field` argument is a field name of the
 * current slot (the one given to `declaredField` / `givenField`, or the
 * remembered `checkedField`).
 */
export interface SlotDeclaration {
  /** Spec query `fieldDeclared`: `true` if the slot declares a field named `field`. Asked by `givenField`. */
  declaresField(field: string): boolean;
  /** Spec query `fieldGiven`: `true` if the specification gives a value for `field`. Asked by `declaredField`. */
  givesField(field: string): boolean;
  /** Spec query `fieldKind`: what `field` takes. Asked by `constant`, `typed` and `nullValue`. */
  fieldKind(field: string): FieldKind;
  /** Spec query `fieldOptional`: `true` if `field` may be absent (null). Asked by `nullValue`. */
  isOptional(field: string): boolean;
  /** Spec query `hasMinimum`: `true` if `field` has a minimum. Asked by `constant`. */
  hasMinimum(field: string): boolean;
  /** Spec query `minimum`: `field`'s minimum; meaningful only if `hasMinimum` answers `true`. Asked by `constant`. */
  minimum(field: string): number;
  /** Spec query `hasMaximum`: `true` if `field` has a maximum. Asked by `constant`. */
  hasMaximum(field: string): boolean;
  /** Spec query `maximum`: `field`'s maximum; meaningful only if `hasMaximum` answers `true`. Asked by `constant`. */
  maximum(field: string): number;
  /** Spec query `memberOf`: `true` if the string `value` is in the fixed set `field` takes. Asked by `constant` (with the constant's `text`). */
  isMember(field: string, value: string): boolean;
}

/** Dependency: told what the check finds (spec effect `Report`). */
export interface PayloadCheckListener {
  /** Spec effect `Report`: one finding about the slot being walked. At most one is told per command. */
  report(finding: PayloadFinding): void;
}

/**
 * What is known about a field when deciding whether a constant fits it (the
 * inputs of the spec decision table `constantFit`). Bounds and membership are
 * `null` when they were not asked.
 */
export interface ConstantFieldFacts {
  /** What the field takes (`SlotDeclaration.fieldKind`). */
  kind: FieldKind;
  /** The field's minimum, or `null` if it has none or it was not asked. */
  minimum: number | null;
  /** The field's maximum, or `null` if it has none or it was not asked. */
  maximum: number | null;
  /** Whether the constant's text is in the field's fixed set, or `null` if not asked. */
  member: boolean | null;
}

/**
 * Outcome of entering a slot (pure decision behind `enterSlot`): whether its
 * fields are checked (`true` -> `"ACTIVE"`, `false` -> `"INACTIVE"`), and the
 * code to report for the slot as a whole, or `null` if none.
 */
export interface SlotVerdict {
  checked: boolean;
  report: PayloadFindingCode | null;
}

/**
 * Checks one specification, slot by slot. Starts in `"OUTSIDE"`. Each method
 * performs one specification command; calling a method in a state the
 * command is not listed for has unspecified behaviour. `enterSlot` is for
 * `"OUTSIDE"`; every other method is for inside a slot.
 */
export class PayloadCheck {
  private readonly declaration: SlotDeclaration;
  private readonly listener: PayloadCheckListener;
  private current: PayloadCheckState = "OUTSIDE";
  private field = "";
  private kind: SlotKind | null = null;
  private variantAnswer = false;

  /**
   * @param declaration answers questions about the declaration of the slot being walked.
   * @param listener receives the findings.
   */
  constructor(declaration: SlotDeclaration, listener: PayloadCheckListener) {
    this.declaration = declaration;
    this.listener = listener;
  }

  /** Current state of the walk (spec state names). */
  get state(): PayloadCheckState {
    return this.current;
  }

  /** Spec data `checkedField`: the given field being walked; `""` when none (and before any slot). */
  get checkedField(): string {
    return this.field;
  }

  /** Spec data `slotKind`: the kind of the slot being (or last) walked; `null` before any slot was entered. */
  get slotKind(): SlotKind | null {
    return this.kind;
  }

  /** Spec data `variants`: whether the slot is a command's answer of the form "one of several variants". `false` before any slot. */
  get variants(): boolean {
    return this.variantAnswer;
  }

  /**
   * Spec command `EnterSlot` (in `"OUTSIDE"`): the walk enters a slot.
   * Remembers its kind and whether it is an answer of variants, clears the
   * field being checked, moves to `"ACTIVE"` or `"INACTIVE"`, and may report
   * one finding about the slot as a whole (field `""`).
   */
  enterSlot(slot: SlotEntry): void {
    const verdict = slotVerdict(slot);
    this.field = "";
    this.kind = slot.kind;
    this.variantAnswer = isVariants(slot);
    this.current = verdict.checked ? "ACTIVE" : "INACTIVE";
    if (verdict.report !== null) this.listener.report({ code: verdict.report, field: "" });
  }

  /**
   * Spec command `DeclaredField`: a field the slot declares, by name. May
   * ask `SlotDeclaration.givesField` and may report `"missing-field"` for
   * it. Does not change the state or the field being checked.
   */
  declaredField(name: string): void {
    if (!this.fieldsChecked() || !mustGiveAllFields(this.kind, this.variantAnswer)) return;
    if (!this.declaration.givesField(name)) this.listener.report({ code: "missing-field", field: name });
  }

  /**
   * Spec command `GivenField`: a field the specification gives, by name;
   * what is known about its value follows. May ask
   * `SlotDeclaration.declaresField`, remembers it as the field being checked
   * and moves to `"CHECKING"` or `"SETTLED"`, possibly reporting one finding.
   * In `"INACTIVE"` nothing happens.
   */
  givenField(name: string): void {
    if (!this.fieldsChecked()) return;
    this.field = name;
    if (this.declaration.declaresField(name)) {
      this.current = "CHECKING";
      return;
    }
    this.current = "SETTLED";
    this.listener.report(this.variantAnswer ? { code: "wrong-shape", field: "" } : { code: "unknown-field", field: name });
  }

  /**
   * Spec command `Source`: where the value of the field being checked comes
   * from (given only for an asked query's input). May report `"bad-source"`
   * and move to `"SETTLED"`.
   */
  source(kind: ValueSourceKind): void {
    if (this.current === "CHECKING" && !isUsableSource(kind)) this.settle("bad-source");
  }

  /**
   * Spec command `Constant`: a concrete value for the field being checked.
   * May ask `SlotDeclaration.fieldKind`, the bounds and `isMember` about the
   * field being checked; may report `"mismatch"` and move to `"SETTLED"`.
   */
  constant(value: ConstantValue): void {
    if (this.current !== "CHECKING") return;
    if (!constantFits(value, this.constantFacts(value))) this.settle("mismatch");
  }

  /**
   * Spec command `Typed`: a value known only by its type `type`. May ask
   * `SlotDeclaration.fieldKind`; may report `"mismatch"` and move to
   * `"SETTLED"`.
   */
  typed(type: PrimitiveType): void {
    if (this.current !== "CHECKING") return;
    if (!typeFits(type, this.declaration.fieldKind(this.field))) this.settle("mismatch");
  }

  /**
   * Spec command `Judged`: whether a value of a structured type fits
   * (`fits`), as the framework compared it. May report `"mismatch"` and move
   * to `"SETTLED"`.
   */
  judged(fits: boolean): void {
    if (this.current === "CHECKING" && !fits) this.settle("mismatch");
  }

  /**
   * Spec command `Null`: the value is null. May ask
   * `SlotDeclaration.isOptional` and `fieldKind`; may report `"mismatch"`
   * and move to `"SETTLED"`.
   */
  nullValue(): void {
    if (this.current !== "CHECKING") return;
    if (this.declaration.isOptional(this.field)) return;
    if (!takesAnyValue(this.declaration.fieldKind(this.field))) this.settle("mismatch");
  }

  /**
   * Spec command `Unresolved`: the value is a reference that points at
   * nothing. May report `"mismatch"` and move to `"SETTLED"`.
   */
  unresolved(): void {
    if (this.current === "CHECKING") this.settle("mismatch");
  }

  /** Spec command `LeaveSlot`: the walk leaves the slot and returns to `"OUTSIDE"`. Reports nothing. */
  leaveSlot(): void {
    this.current = "OUTSIDE";
  }

  private fieldsChecked(): boolean {
    return this.current === "ACTIVE" || this.current === "CHECKING" || this.current === "SETTLED";
  }

  private settle(code: PayloadFindingCode): void {
    this.listener.report({ code, field: this.field });
    this.current = "SETTLED";
  }

  /** Asks only what `constantFits` needs to judge this value. */
  private constantFacts(value: ConstantValue): ConstantFieldFacts {
    const kind = this.declaration.fieldKind(this.field);
    const facts: ConstantFieldFacts = { kind, minimum: null, maximum: null, member: null };
    if ((kind === "integer" || kind === "number") && isNumeric(value.kind)) {
      if (this.declaration.hasMinimum(this.field)) facts.minimum = this.declaration.minimum(this.field);
      if (this.declaration.hasMaximum(this.field)) facts.maximum = this.declaration.maximum(this.field);
    } else if (kind === "enum" && value.kind === "string") {
      facts.member = this.declaration.isMember(this.field, value.text);
    }
    return facts;
  }
}

/** Pure calculation `isVariants`, from the input of `enterSlot`. */
export function isVariants(slot: SlotEntry): boolean {
  return slot.kind === "responds" && slot.output === "variant";
}

/** Pure decision behind `enterSlot`: whether the slot is checked and what is reported about it. */
export function slotVerdict(slot: SlotEntry): SlotVerdict {
  switch (slot.kind) {
    case "effect":
      return slot.declared ? checked() : unchecked(null);
    case "asks":
    case "change":
      return slot.declared ? checked() : unchecked("unknown-target");
    case "calls":
      if (!slot.declared) return unchecked("unknown-target");
      if (!slot.keyedOk) return unchecked("keyed-mismatch");
      if (!slot.commandDeclared) return unchecked("unknown-command");
      return checked();
    case "responds":
      return answerVerdict(slot);
    default:
      return checked();
  }
}

function answerVerdict(slot: SlotEntry): SlotVerdict {
  if (slot.output === "none") return slot.given === "none" ? checked() : unchecked("no-output");
  if (slot.given === "none") return unchecked("missing-response");
  if (!answerShapeFits(slot.output, slot.given, slot.givenCount)) return unchecked("wrong-shape");
  return checked();
}

function answerShapeFits(output: DeclaredOutput, given: GivenShape, givenCount: number): boolean {
  switch (output) {
    case "fields":
      return given !== "single";
    case "variant":
      return given === "fields" && givenCount === 1;
    case "single":
      return given !== "fields";
    default:
      return true;
  }
}

function checked(): SlotVerdict {
  return { checked: true, report: null };
}

function unchecked(report: PayloadFindingCode | null): SlotVerdict {
  return { checked: false, report };
}

/** Whether every field a slot of this kind declares must be given (an effect, an asked query, a contained component's command, an answer with fields). */
function mustGiveAllFields(kind: SlotKind | null, variants: boolean): boolean {
  return kind === "effect" || kind === "asks" || kind === "calls" || (kind === "responds" && !variants);
}

function isUsableSource(kind: ValueSourceKind): boolean {
  return kind === "constant" || kind === "input" || kind === "data";
}

function takesAnyValue(kind: FieldKind): boolean {
  return kind === "value";
}

function isNumeric(kind: PrimitiveType): boolean {
  return kind === "integer" || kind === "number";
}

function withinBounds(value: number, field: ConstantFieldFacts): boolean {
  return (field.minimum === null || value >= field.minimum) && (field.maximum === null || value <= field.maximum);
}

/** Pure decision table `constantFit`: `true` if the constant `value` fits a field described by `field`. */
export function constantFits(value: ConstantValue, field: ConstantFieldFacts): boolean {
  switch (field.kind) {
    case "boolean":
      return value.kind === "boolean";
    case "string":
      return value.kind === "string";
    case "enum":
      return value.kind === "string" && field.member === true;
    case "integer":
      return value.kind === "integer" && withinBounds(value.number, field);
    case "number":
      return isNumeric(value.kind) && withinBounds(value.number, field);
    default:
      return false;
  }
}

/** Pure decision table `typeFit`: `true` if a value of type `type` fits a field that takes `kind`. */
export function typeFits(type: PrimitiveType, kind: FieldKind): boolean {
  return type === kind || (type === "integer" && kind === "number");
}
