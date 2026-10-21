/**
 * Turns answers drawn at random into answers that keep the promises a
 * dependency makes about its answers (`fresh`, `increasing`), and decides
 * what survives a restart of the system.
 *
 * Corresponds to the specification component "promise-keeper". The
 * component has no states of its own (it is always in the specification
 * state `READY`), no dependencies and no effects. One `PromiseKeeper` object
 * remembers what it has been given between calls; each method performs one
 * specification command.
 *
 * Fresh answers are decided in a sequence: start it with `beginFreshNumber`
 * or `beginFreshText` (which forgets the values answered before), give each
 * value the query answered before with `usedNumber` / `usedText`, in the
 * order they were answered, then ask `fresh` for the answer. `increasing`
 * and `restart` depend only on their arguments and can be called at any time.
 *
 * Command -> method:
 *   `BeginFreshNumber` -> `beginFreshNumber`
 *   `BeginFreshText`   -> `beginFreshText`
 *   `Fresh`            -> `fresh`
 *   `Increasing`       -> `increasing`
 *   `Restart`          -> `restart`
 *   `UsedNumber`       -> `usedNumber`
 *   `UsedText`         -> `usedText`
 *
 * Remembered data (spec `data`: `freshDrawn`, `used`) is private; it is
 * observable only through the answer of `fresh`. It starts as in the
 * specification's `model.initial`.
 */

/** A value a query answers: a number (an integer) or a text (spec type `value`). */
export type AnsweredValue = number | string;

/** Answer of `Restart` (spec output `Restart`). */
export type RestartOutcome = "keep" | "start-again";

/** Input of `Increasing`. Field names identical to the specification's. */
export interface IncreasingInput {
  /** The answer of the increasing query before this one, or `null` when it has not answered before. */
  previous: number | null;
  /** The value drawn at random for this answer (an integer). */
  drawn: number;
  /** The increment to apply to the previous answer (a non-negative integer). */
  delta: number;
  /** The largest answer allowed, or `null` when there is none. */
  max: number | null;
}

/**
 * Remembers the value drawn for the fresh answer being decided and the
 * values answered before, and answers the promise-keeping values.
 */
export class PromiseKeeper {
  private freshDrawn: AnsweredValue | null = null;
  private used: AnsweredValue[] = [];

  /**
   * Spec command `BeginFreshNumber`: the fresh answer of a query that answers
   * numbers is decided next, for the integer `drawn` (spec data
   * `freshDrawn`). Forgets the values answered before (spec data `used`).
   */
  beginFreshNumber(drawn: number): void {
    this.freshDrawn = drawn;
    this.used = [];
  }

  /**
   * Spec command `BeginFreshText`: the fresh answer of a query that answers
   * texts is decided next, for the text `drawn` (spec data `freshDrawn`).
   * Forgets the values answered before (spec data `used`).
   */
  beginFreshText(drawn: string): void {
    this.freshDrawn = drawn;
    this.used = [];
  }

  /**
   * Spec command `UsedNumber`: the integer `value` is a number the query
   * answered before; appended to the values answered before (spec data `used`).
   */
  usedNumber(value: number): void {
    this.used = usedWithValue(this.used, value);
  }

  /**
   * Spec command `UsedText`: the text `value` is a text the query answered
   * before; appended to the values answered before (spec data `used`).
   */
  usedText(value: string): void {
    this.used = usedWithValue(this.used, value);
  }

  /**
   * Spec command `Fresh`: answers the fresh answer for the value given to the
   * last `beginFresh...` and the values given through `used...` since. A
   * number when the sequence was started with a number, a text otherwise.
   * Changes nothing.
   */
  fresh(): AnsweredValue {
    // Before any `beginFresh...` no value has been drawn; the answer is that absent value.
    return freshAnswer(this.freshDrawn as AnsweredValue, this.used);
  }

  /**
   * Spec command `Increasing`: answers the integer a query that promises
   * never to answer less than before answers this time. Changes nothing.
   */
  increasing(input: IncreasingInput): number {
    return increasingAnswer(input);
  }

  /**
   * Spec command `Restart`: the system restarts; `durable` tells whether the
   * component that restarts is durable. Answers `"keep"` when it keeps its
   * state and data, `"start-again"` when it starts again. Changes nothing.
   */
  restart(durable: boolean): RestartOutcome {
    return restartOutcome(durable);
  }
}

/**
 * The fresh answer for the value drawn `drawn`, given the values answered
 * before `used` (in order). Pure; used by `PromiseKeeper.fresh`.
 */
export function freshAnswer(drawn: AnsweredValue, used: readonly AnsweredValue[]): AnsweredValue {
  if (!used.includes(drawn)) return drawn;
  if (typeof drawn === "number") return oneMoreThanLargest(used);
  return drawnNumbered(drawn, used);
}

/** Spec calculation `oneMoreThanLargest`, over the values answered before `used`. */
export function oneMoreThanLargest(used: readonly AnsweredValue[]): number {
  const numbers = used.filter((value): value is number => typeof value === "number");
  return Math.max(...numbers) + 1;
}

/** Spec calculation `drawnNumbered`, for the text drawn `drawn` and the values answered before `used`. */
export function drawnNumbered(drawn: string, used: readonly AnsweredValue[]): string {
  return `${drawn}#${used.length}`;
}

/** Spec calculation `usedWithValue`: the new list of values answered before after `value` is given. Does not change `used`. */
export function usedWithValue(used: readonly AnsweredValue[], value: AnsweredValue): AnsweredValue[] {
  return [...used, value];
}

/** The answer of the increasing query for `input`. Pure; used by `PromiseKeeper.increasing`. */
export function increasingAnswer(input: IncreasingInput): number {
  if (input.previous === null) return input.drawn;
  return increasedAnswer(input.previous, input.delta, input.max);
}

/** Spec calculation `increasedAnswer`, for an answer before `previous`, increment `delta` and optional maximum `max`. */
export function increasedAnswer(previous: number, delta: number, max: number | null): number {
  const increased = previous + delta;
  return max === null ? increased : Math.min(increased, max);
}

/** What a component does on a restart, given whether it is `durable`. Pure; used by `PromiseKeeper.restart`. */
export function restartOutcome(durable: boolean): RestartOutcome {
  return durable ? "keep" : "start-again";
}
