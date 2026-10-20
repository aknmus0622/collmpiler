import { appended, chooseCommand, decideCaseOf, hasCondition, isSendablePathValue } from "./choice.ts";
import type { CaseChoice, CommandChoice, Conditions } from "./types.ts";

/**
 * The step-choice component: chooses, for the simulator of a specification, the command executed at a step
 * and the case that happens.
 *
 * It is driven as follows. For the command of a step: `beginStep` with the step's state, then, for each
 * command of the simulated specification, `consider`, then every `from`, then every `pathValue`, then every
 * `onlyIf` about it, then `considered`; finally `choose`. For the case: `beginCases`, then one `addCase` per
 * case, in order; finally `decideCase`. The two can be interleaved: `beginStep` does not forget the cases,
 * and `beginCases` does not forget the commands.
 *
 * The component has no states of its own (the specification's only state is `READY`), so every method can
 * be called at any time. A new instance starts with the specification's initial data. Each method below
 * performs one command of the specification; what it remembers is observed through the data getters, and
 * `choose` and `decideCase` return the command's answer. Conditions are asked through the `Conditions`
 * passed to the constructor.
 */
export class StepChoice {
  private readonly conditions: Conditions;
  private consideringValue = "";
  private enabledValue: readonly string[] = [];
  private hitsValue: readonly string[] = [];
  private possibleValue = false;
  private stepStateValue = "";

  /**
   * @param conditions answers the query `holds`
   */
  constructor(conditions: Conditions) {
    this.conditions = conditions;
  }

  /** The specification's `data.considering`: the command being considered. */
  get considering(): string {
    return this.consideringValue;
  }

  /**
   * The specification's `data.enabled`: the commands that can be executed at this step, in the order they
   * were considered (a name appears once per `considered` call that added it).
   */
  get enabled(): readonly string[] {
    return this.enabledValue;
  }

  /** The specification's `data.hits`: the cases whose condition holds, in the order they were given. */
  get hits(): readonly string[] {
    return this.hitsValue;
  }

  /**
   * The specification's `data.possible`: whether the command being considered can still be executed, as far
   * as the facts given so far say.
   */
  get possible(): boolean {
    return this.possibleValue;
  }

  /** The specification's `data.stepState`: the state the simulated component is in at this step. */
  get stepState(): string {
    return this.stepStateValue;
  }

  /** Performs the command `BeginCases`: a case is chosen next. Takes no arguments. */
  beginCases(): void {
    this.hitsValue = [];
  }

  /**
   * Performs the command `BeginStep`: a new step begins.
   *
   * @param state the command's `state`: the state the simulated component is in at this step
   */
  beginStep(state: string): void {
    this.enabledValue = [];
    this.stepStateValue = state;
  }

  /**
   * Performs the command `Case`: one case, named by its condition. May ask the conditions `holds` with
   * `name`.
   *
   * @param name the command's `name`: the case's name, which is also the name of its condition
   */
  addCase(name: string): void {
    if (hasCondition(name) && this.conditions.holds(name)) {
      this.hitsValue = appended(this.hitsValue, name);
    }
  }

  /**
   * Performs the command `Choose`: which command is executed at this step. Asks no condition.
   *
   * @param forced the command's `forced`: the command another component called, or `null` when none is
   *   forced
   * @param pick the command's `pick`: a whole number, 0 or more, selecting among the commands that can be
   *   executed
   * @param strict the command's `strict`: whether a forced command that cannot be executed is refused
   * @returns the command's answer
   */
  choose(forced: string | null, pick: number, strict: boolean): CommandChoice {
    return chooseCommand(this.enabledValue, forced, pick, strict);
  }

  /**
   * Performs the command `Consider`: a command of the simulated specification is considered next.
   *
   * @param command the command's `command`: the name of the command considered
   * @param everywhere the command's `everywhere`: true when the considered command names no states it is
   *   executed from (it can be executed in every state)
   */
  consider(command: string, everywhere: boolean): void {
    this.consideringValue = command;
    this.possibleValue = everywhere;
  }

  /**
   * Performs the command `Considered`: every fact about the command being considered has been given. Takes
   * no arguments.
   */
  considered(): void {
    if (this.possibleValue) {
      this.enabledValue = appended(this.enabledValue, this.consideringValue);
    }
  }

  /**
   * Performs the command `DecideCase`: which case happens. Asks no condition.
   *
   * @returns the command's answer
   */
  decideCase(): CaseChoice {
    return decideCaseOf(this.hitsValue);
  }

  /**
   * Performs the command `From`: a state the command being considered can be executed from.
   *
   * @param state the command's `state`: a state name
   */
  from(state: string): void {
    if (state === this.stepStateValue) {
      this.possibleValue = true;
    }
  }

  /**
   * Performs the command `OnlyIf`: a condition that must hold for the command being considered to be
   * executed. May ask the conditions `holds` with `condition`.
   *
   * @param condition the command's `condition`: the name of the condition
   */
  onlyIf(condition: string): void {
    if (this.possibleValue && !this.conditions.holds(condition)) {
      this.possibleValue = false;
    }
  }

  /**
   * Performs the command `PathValue`: a value the command being considered would put into a path segment of
   * its HTTP route.
   *
   * @param value the command's `value`
   */
  pathValue(value: string): void {
    if (!isSendablePathValue(value)) {
      this.possibleValue = false;
    }
  }
}
