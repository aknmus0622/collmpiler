/**
 * Outcome application: for the simulator of a specification, applies what
 * happens in the case chosen for a command, and finds where that case does
 * not fit what the specification declares.
 *
 * Corresponds to the specification component "outcome-apply". One
 * `OutcomeApply` object applies one case after another. It has no states of
 * its own (it is always in the specification's single state `READY`); every
 * method may be called at any time. It is driven from outside: whoever owns
 * it calls `begin` for the next step, then gives the facts about the chosen
 * case one method call per fact, and finally calls `end` for the state the
 * step ends in. It asks nothing of its environment; it tells its
 * `OutcomeFaultListener` each fault it finds.
 *
 * Command -> method:
 *   `Begin`        -> `begin`
 *   `Call`         -> `call`
 *   `Effect`       -> `effect`
 *   `GoTo`         -> `goTo`
 *   `Set`          -> `set`
 *   `Responds`     -> `responds`
 *   `RespondField` -> `respondField`
 *   `Fits`         -> `fits`
 *   `Add`          -> `add`
 *   `AddField`     -> `addField`
 *   `Key`          -> `key`
 *   `Remove`       -> `remove`
 *   `End`          -> `end`
 *
 * Effect -> listener method:
 *   `Fail` -> `OutcomeFaultListener.fail`
 */

/** Kind of fault (spec field `code` of the `Fail` effect); values identical to the specification's. */
export type OutcomeFaultCode =
  | "undeclared-state"
  | "undeclared-effect"
  | "undeclared-data"
  | "missing-responds"
  | "bad-value"
  | "not-many"
  | "duplicate-key";

/**
 * Kind of guard on an effect of the case (spec input `guard` of `Effect`);
 * values identical to the specification's.
 *   `"none"`      the effect has no guard.
 *   `"condition"` the guard is a condition sentence.
 *   `"value"`     the guard is a reference to a value.
 */
export type EffectGuard = "none" | "condition" | "value";

/** Input of `Effect`: facts about one effect the case may perform. Field names identical to the specification's. */
export interface EffectFacts {
  /** Whether the specification declares this effect. */
  declared: boolean;
  /** The kind of guard the effect has. */
  guard: EffectGuard;
  /** For a `"condition"` guard: whether that condition's case is the one chosen. Ignored otherwise. */
  chosen: boolean;
  /** For a `"value"` guard: the guard's value, already resolved (any JSON value). Ignored otherwise. */
  guardValue: unknown;
}

/** Input of `RespondField`: facts about one field of a record answer. Field names identical to the specification's. */
export interface RespondFieldFacts {
  /** Whether the value given for the field is null. */
  isNull: boolean;
  /** Whether the declared output lists the field as optional. */
  optional: boolean;
  /** Whether the field's declared type takes any value. */
  anyValue: boolean;
  /** The result of comparing the value with the field's declared type: `true` if it fits. */
  fits: boolean;
}

/** Dependency: told the faults found (spec effect `Fail`). */
export interface OutcomeFaultListener {
  /**
   * Spec effect `Fail`: one fault, with its code, about the fact given in
   * the method call just performed. At most one per call.
   */
  fail(code: OutcomeFaultCode): void;
}

/**
 * What the application remembers between commands (spec `model.data`;
 * field names identical to the specification's). Before the first `begin`,
 * both are `""`.
 */
export interface OutcomeProgress {
  /** Spec `current`: the state the step starts from. Set by `begin`. */
  current: string;
  /** Spec `destination`: the state the step ends in, as far as the facts so far say. Set by `begin` and `goTo`; read by `end`. */
  destination: string;
}

/**
 * Applies the chosen case of one step after another. Each method performs
 * one specification command.
 */
export class OutcomeApply {
  private readonly listener: OutcomeFaultListener;
  private current = "";
  private destination = "";

  /** @param listener receives the faults found. */
  constructor(listener: OutcomeFaultListener) {
    this.listener = listener;
  }

  /** What the application currently remembers (spec data); a copy. */
  get progress(): OutcomeProgress {
    return { current: this.current, destination: this.destination };
  }

  /**
   * Spec command `Begin`: a case is applied in a step from `state` (spec
   * input `state`, any string, `""` included). Updates `current` and
   * `destination`. Reports nothing.
   */
  begin(state: string): void {
    this.current = state;
    this.destination = state;
  }

  /**
   * Spec command `Call`: a command of a contained component is called
   * before the case is chosen. `keyed` is whether that component is one of
   * many; `found` whether an item has the key asked for. Answers whether
   * the call is run (spec output of `Call`). Remembers nothing; reports
   * nothing.
   */
  call(keyed: boolean, found: boolean): boolean {
    return isCallRun(keyed, found);
  }

  /**
   * Spec command `Effect`: one effect the case may perform, given in the
   * order written. Answers whether it is performed (spec output of
   * `Effect`). May report `"undeclared-effect"`.
   */
  effect(facts: EffectFacts): boolean {
    const performed = isPerformed(facts);
    if (performed && !facts.declared) this.listener.fail("undeclared-effect");
    return performed;
  }

  /**
   * Spec command `GoTo`: the case goes to the state `target` (already
   * resolved; any string, `""` included); `declared` is whether the
   * specification declares that state. May update `destination`; may
   * report `"undeclared-state"`.
   */
  goTo(target: string, declared: boolean): void {
    if (!declared) {
      this.listener.fail("undeclared-state");
      return;
    }
    this.destination = target;
  }

  /**
   * Spec command `Set`: a datum the case remembers; `declared` is whether
   * the specification declares it. May report `"undeclared-data"`.
   */
  set(declared: boolean): void {
    if (!declared) this.listener.fail("undeclared-data");
  }

  /**
   * Spec command `Responds`: the command declares an output; `given` is
   * whether the case gives an answer. May report `"missing-responds"`.
   */
  responds(given: boolean): void {
    if (!given) this.listener.fail("missing-responds");
  }

  /**
   * Spec command `RespondField`: one field of a record answer, with the
   * facts about it. May report `"bad-value"`.
   */
  respondField(facts: RespondFieldFacts): void {
    if (!respondFieldFits(facts)) this.listener.fail("bad-value");
  }

  /**
   * Spec command `Fits`: a value the case gives (an effect's input field, a
   * remembered datum, an answer, a field of a new item) has been compared
   * with its declared type; `fits` is the result. May report `"bad-value"`.
   */
  fits(fits: boolean): void {
    if (!fits) this.listener.fail("bad-value");
  }

  /**
   * Spec command `Add`: the case adds an item to a contained component;
   * `many` is whether that component is one of many. May report
   * `"not-many"`.
   */
  add(many: boolean): void {
    if (!many) this.listener.fail("not-many");
  }

  /**
   * Spec command `AddField`: a datum given to the item being added;
   * `declared` is whether the contained component declares it. May report
   * `"undeclared-data"`.
   */
  addField(declared: boolean): void {
    if (!declared) this.listener.fail("undeclared-data");
  }

  /**
   * Spec command `Key`: the key of the item being added; `exists` is
   * whether an item with that key exists already. May report
   * `"duplicate-key"`.
   */
  key(exists: boolean): void {
    if (exists) this.listener.fail("duplicate-key");
  }

  /**
   * Spec command `Remove`: the case removes an item from a contained
   * component; `many` is whether that component is one of many. May report
   * `"not-many"`.
   */
  remove(many: boolean): void {
    if (!many) this.listener.fail("not-many");
  }

  /**
   * Spec command `End`: every fact about the case has been given. Answers
   * the state the step ends in (spec output of `End`, the remembered
   * `destination`). Changes nothing; reports nothing.
   */
  end(): string {
    return this.destination;
  }
}

/** Pure calculation `performed`: whether the effect described by `facts` is performed. */
export function isPerformed(facts: EffectFacts): boolean {
  switch (facts.guard) {
    case "none":
      return true;
    case "condition":
      return facts.chosen;
    case "value":
      return facts.guardValue === true;
  }
}

/** Pure decision for `call`: whether the call is run, from the inputs of `call`. */
export function isCallRun(keyed: boolean, found: boolean): boolean {
  return !keyed || found;
}

/** Pure decision for `respondField`: whether the field of the record answer fits. */
export function respondFieldFits(facts: RespondFieldFacts): boolean {
  if (facts.isNull && !facts.anyValue) return facts.optional;
  return facts.fits;
}
