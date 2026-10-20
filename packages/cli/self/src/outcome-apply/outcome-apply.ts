import type { AnyValue, EffectGuard, OutcomeApplyState, OutcomeFaults } from "./types.ts";
import { callRuns, isPerformed, respondFieldFits } from "./rules.ts";

/**
 * The outcome-apply component: applies, for the simulator of a specification, what happens in the chosen case
 * of one step, and finds where it does not fit the declarations. It is driven as a walk over the facts of one
 * step: `begin` once with the state the step starts from, then one call per fact of the case (`call`,
 * `effect`, `goTo`, `set`, `fits`, `responds`, `respondField`, `add`, `addField`, `key`, `remove`), then
 * `end`, which answers the state the step ends in. The facts are already worked out by the caller (whether
 * something is declared, whether a value fits, ...); this component only turns them into faults and the
 * resulting state. Faults go to the `OutcomeFaults` passed to the constructor.
 *
 * A new instance starts in the specification's only state (`"ready"`) with `current` and `destination` both
 * the empty string. One instance may apply many steps, one after another: each `begin` starts a new one.
 * Each method below performs one command of the specification; its outcome is observed through what it
 * returns, `state`, the data getters, and the calls made on the dependency.
 */
export class OutcomeApply {
  private readonly faults: OutcomeFaults;
  private currentState = "";
  private destinationState = "";

  /**
   * @param faults receives the effect `Fail`
   */
  constructor(faults: OutcomeFaults) {
    this.faults = faults;
  }

  /** The current state. `OutcomeApplyState` lists the specification name of each value. */
  get state(): OutcomeApplyState {
    return "ready";
  }

  /** The specification's `data.current`: the state the step starts from. */
  get current(): string {
    return this.currentState;
  }

  /** The specification's `data.destination`: the state the step ends in, as far as the facts so far say. */
  get destination(): string {
    return this.destinationState;
  }

  /**
   * Performs the command `Begin`: a case is applied, in a step from the given state.
   *
   * @param state the command's `state`: the state the step starts from
   */
  begin(state: string): void {
    this.currentState = state;
    this.destinationState = state;
  }

  /**
   * Performs the command `Call`: before the case is chosen, a command of a contained component is called.
   * Remembers nothing and tells the faults nothing.
   *
   * @param keyed the command's `keyed`: whether the contained component is one of many
   * @param found the command's `found`: whether an item has the key asked for
   * @returns the command's answer: whether the contained command is run
   */
  call(keyed: boolean, found: boolean): boolean {
    return callRuns(keyed, found);
  }

  /**
   * Performs the command `Effect`: an effect the case may perform, given in the order written. May tell the
   * faults `fail("undeclared-effect")`.
   *
   * @param guard the command's `guard`: what kind of guard the effect has
   * @param chosen the command's `chosen`: for a condition guard, whether that condition's case was chosen
   * @param guardValue the command's `guardValue`: for a value guard, the value, already resolved
   * @param declared the command's `declared`: whether the effect is declared
   * @returns the command's answer: whether the effect is performed
   */
  effect(guard: EffectGuard, chosen: boolean, guardValue: AnyValue, declared: boolean): boolean {
    const performed = isPerformed(guard, chosen, guardValue);
    if (performed && !declared) this.faults.fail("undeclared-effect");
    return performed;
  }

  /**
   * Performs the command `GoTo`: the case goes to a state. May tell the faults `fail("undeclared-state")`.
   *
   * @param target the command's `target`: the state gone to, already resolved
   * @param declared the command's `declared`: whether that state is declared
   */
  goTo(target: string, declared: boolean): void {
    if (declared) this.destinationState = target;
    else this.faults.fail("undeclared-state");
  }

  /**
   * Performs the command `Set`: a datum the case remembers. May tell the faults `fail("undeclared-data")`.
   *
   * @param declared the command's `declared`: whether the datum is declared
   */
  set(declared: boolean): void {
    if (!declared) this.faults.fail("undeclared-data");
  }

  /**
   * Performs the command `Fits`: a value the case gives (an effect's input field, a remembered datum, an
   * answer, a field of a new item) has been compared with its declared type. May tell the faults
   * `fail("bad-value")`.
   *
   * @param fits the command's `fits`: the result of that comparison
   */
  fits(fits: boolean): void {
    if (!fits) this.faults.fail("bad-value");
  }

  /**
   * Performs the command `Responds`: the command being simulated declares an output. May tell the faults
   * `fail("missing-responds")`.
   *
   * @param given the command's `given`: whether the case gives an answer
   */
  responds(given: boolean): void {
    if (!given) this.faults.fail("missing-responds");
  }

  /**
   * Performs the command `RespondField`: a field of a record answer. May tell the faults `fail("bad-value")`.
   *
   * @param isNull the command's `isNull`: whether the field's value is null
   * @param optional the command's `optional`: whether the field is declared optional
   * @param anyValue the command's `anyValue`: whether the field takes any value
   * @param fits the command's `fits`: the result of comparing the value with the field's declared type
   */
  respondField(isNull: boolean, optional: boolean, anyValue: boolean, fits: boolean): void {
    if (!respondFieldFits(isNull, optional, anyValue, fits)) this.faults.fail("bad-value");
  }

  /**
   * Performs the command `Add`: the case adds an item to a contained component. May tell the faults
   * `fail("not-many")`.
   *
   * @param many the command's `many`: whether the contained component is one of many
   */
  add(many: boolean): void {
    if (!many) this.faults.fail("not-many");
  }

  /**
   * Performs the command `AddField`: a datum given to the item being added. May tell the faults
   * `fail("undeclared-data")`.
   *
   * @param declared the command's `declared`: whether the contained component declares the datum
   */
  addField(declared: boolean): void {
    if (!declared) this.faults.fail("undeclared-data");
  }

  /**
   * Performs the command `Key`: the key of the item being added. May tell the faults `fail("duplicate-key")`.
   *
   * @param exists the command's `exists`: whether an item with that key exists already
   */
  key(exists: boolean): void {
    if (exists) this.faults.fail("duplicate-key");
  }

  /**
   * Performs the command `Remove`: the case removes an item from a contained component. May tell the faults
   * `fail("not-many")`.
   *
   * @param many the command's `many`: whether the contained component is one of many
   */
  remove(many: boolean): void {
    if (!many) this.faults.fail("not-many");
  }

  /**
   * Performs the command `End`: every fact of the step has been given. Tells the faults nothing.
   *
   * @returns the command's answer: the state the step ends in
   */
  end(): string {
    return this.destinationState;
  }
}
