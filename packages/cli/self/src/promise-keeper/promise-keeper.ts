import { freshAnswer, increasingAnswer, restartOutcome, usedWithValue } from "./rules.ts";
import type { AnsweredValue, IncreasingRequest, RestartOutcome } from "./types.ts";

/**
 * The promise-keeper component: turns answers drawn at random into answers that keep a dependency's
 * promises (`fresh`: never the same answer twice; `increasing`: never less than before), and decides what
 * survives a restart.
 *
 * It is driven as follows. For a fresh answer: `beginFreshNumber` or `beginFreshText` with the value drawn,
 * then one `usedNumber` or `usedText` per value the query answered before, in the order given; finally
 * `fresh`. `increasing` and `restart` stand alone and use nothing remembered.
 *
 * The component has no states of its own (the specification's only state is `READY`), so every method can
 * be called at any time. A new instance starts with the specification's initial data. Each method below
 * performs one command of the specification; what it remembers is observed through the data getters, and
 * `fresh`, `increasing` and `restart` return the command's answer. It has no dependencies.
 */
export class PromiseKeeper {
  private freshDrawnValue: AnsweredValue | null = null;
  private usedValue: readonly AnsweredValue[] = [];

  /**
   * The specification's `data.freshDrawn`: the value drawn for the fresh answer being decided (a number or
   * a text); `null` before any `beginFreshNumber` or `beginFreshText`.
   */
  get freshDrawn(): AnsweredValue | null {
    return this.freshDrawnValue;
  }

  /**
   * The specification's `data.used`: the values answered before by the query whose fresh answer is being
   * decided, in the order given.
   */
  get used(): readonly AnsweredValue[] {
    return this.usedValue;
  }

  /**
   * Performs the command `BeginFreshNumber`: the fresh answer of a query that answers numbers is decided
   * next. Forgets the values given before.
   *
   * @param drawn the command's `drawn`: the whole number drawn at random
   */
  beginFreshNumber(drawn: number): void {
    this.freshDrawnValue = drawn;
    this.usedValue = [];
  }

  /**
   * Performs the command `BeginFreshText`: the fresh answer of a query that answers texts is decided next.
   * Forgets the values given before.
   *
   * @param drawn the command's `drawn`: the text drawn at random
   */
  beginFreshText(drawn: string): void {
    this.freshDrawnValue = drawn;
    this.usedValue = [];
  }

  /**
   * Performs the command `UsedNumber`: gives one number the query answered before.
   *
   * @param value the command's `value`
   */
  usedNumber(value: number): void {
    this.usedValue = usedWithValue(this.usedValue, value);
  }

  /**
   * Performs the command `UsedText`: gives one text the query answered before.
   *
   * @param value the command's `value`
   */
  usedText(value: string): void {
    this.usedValue = usedWithValue(this.usedValue, value);
  }

  /**
   * Performs the command `Fresh`. Takes no arguments; reads the value drawn and the values given since the
   * last `beginFreshNumber` / `beginFreshText`. Remembers nothing.
   *
   * @returns the command's answer: the fresh answer, a number or a text; `null` while no value has been
   *   drawn (the answer is then the specification's `data.freshDrawn`, which is still unset)
   */
  fresh(): AnsweredValue | null {
    if (this.freshDrawnValue === null) {
      return null;
    }
    return freshAnswer(this.freshDrawnValue, this.usedValue);
  }

  /**
   * Performs the command `Increasing`. Remembers nothing.
   *
   * @param request the command's input, field for field (`drawn`, `previous`, `delta`, `max`)
   * @returns the command's answer: the answer of a query that promises never to answer less than before
   */
  increasing(request: IncreasingRequest): number {
    return increasingAnswer(request);
  }

  /**
   * Performs the command `Restart`: the system restarts. Remembers nothing.
   *
   * @param durable the command's `durable`: whether the component that restarts is durable
   * @returns the command's answer, `"keep"` or `"start-again"` (see `RestartOutcome`)
   */
  restart(durable: boolean): RestartOutcome {
    return restartOutcome(durable);
  }
}
