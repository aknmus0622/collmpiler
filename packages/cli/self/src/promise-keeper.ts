/**
 * Turns answers drawn at random into answers that keep the promises of a dependency
 * of a simulated system, and says what a component does when that system restarts.
 *
 * Nothing here draws anything or remembers a dependency: the caller draws a value,
 * announces it, feeds in the values the query answered before, one call per value,
 * and then reads the answer it should give.
 *
 * It corresponds to the specification's component `promise-keeper`. It has no
 * dependencies, and it keeps nothing across a restart: a new instance starts over.
 *
 * The specification's queries map to code as follows: `Fresh` is
 * `PromiseKeeper.fresh()` (and the pure `freshAnswer`), `Increasing` is the pure
 * `increasingAnswer`, and `Restart` is the pure `restartOutcome`. The last two read
 * no state, so they need no instance.
 */

/**
 * Any JSON value. Specification type `json`. Numbers are integers in everything this
 * component is given or answers.
 */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Which kind of value the query being decided answers. Specification type of the
 * state field `freshKind`: `"number"` for a query that answers numbers, `"text"` for
 * one that answers texts.
 */
export type FreshKind = "number" | "text";

/**
 * What a component does when the system restarts. Specification result of the query
 * `Restart`, under the same names: `"keep"` means it keeps its state and data,
 * `"start-again"` means it starts over from its initial state.
 */
export type RestartOutcome = "keep" | "start-again";

/**
 * Everything the promise keeper remembers, one field per state field of the
 * specification, under the same names.
 */
export interface PromiseKeeperState {
  /** The value announced by the last `begin…` call; `null` before any (`freshDrawn`). */
  freshDrawn: Json;
  /**
   * The replacement prepared so far for the value drawn, a number or a text; `null`
   * while none has been prepared (`freshInstead`).
   */
  freshInstead: Json;
  /** The kind announced by the last `begin…` call; `null` before any (`freshKind`). */
  freshKind: FreshKind | null;
  /**
   * The running largest of the numbers given since the last `begin…` call; `null`
   * while none has been given (`largestUsed`).
   */
  largestUsed: number | null;
  /**
   * The values given since the last `begin…` call, numbers and texts alike, in the
   * order given (`used`).
   */
  used: Json[];
}

/**
 * What is known about a query that promises never to answer less than before. The
 * field names are the parameter names of the specification's query `Increasing`.
 */
export interface IncreasingFacts {
  /** The increment to apply to the previous answer (specification parameter `delta`). */
  delta: number;
  /** The value drawn at random for this answer (specification parameter `drawn`). */
  drawn: number;
  /** The maximum of the query, or `null` if it has none (specification parameter `max`). */
  max: number | null;
  /**
   * The query's previous answer, or `null` if it has not answered before
   * (specification parameter `previous`).
   */
  previous: number | null;
}

/**
 * The answer a query that promises fresh values should give, in the given state.
 * Pure: it reads only its argument and changes nothing. It corresponds to the
 * specification's calculation `fresh`.
 *
 * @param state what the promise keeper remembers.
 * @returns the answer to give: a number or a text, of the kind announced.
 */
export function freshAnswer(state: PromiseKeeperState): Json {
  return state.used.includes(state.freshDrawn) ? state.freshInstead : state.freshDrawn;
}

/**
 * The replacement for a drawn text: the text followed by "#" and the number of values
 * given, counting the one being given now.
 *
 * @param drawn the value drawn.
 * @param usedBefore how many values were given before this one.
 * @returns the replacement text.
 */
function numberedText(drawn: Json, usedBefore: number): string {
  return `${drawn}#${usedBefore + 1}`;
}

/**
 * The running largest of the numbers given, after one more.
 *
 * @param largest the largest so far, or `null` if none has been given.
 * @param answered the number being given.
 * @returns the new largest.
 */
function largestAfter(largest: number | null, answered: number): number {
  return largest === null ? answered : Math.max(largest, answered);
}

/** What the promise keeper remembers before any `begin…` call. */
function initialState(): PromiseKeeperState {
  return { freshDrawn: null, freshInstead: null, freshKind: null, largestUsed: null, used: [] };
}

/**
 * The answer a query that promises never to answer less than before should give.
 * Pure. It corresponds to the specification's calculation and query `Increasing`.
 *
 * @param facts the value drawn and what is known about the query.
 * @returns the answer to give.
 */
export function increasingAnswer(facts: IncreasingFacts): number {
  const { delta, drawn, max, previous } = facts;
  if (previous === null) {
    return drawn;
  }
  const next = previous + delta;
  return max === null ? next : Math.min(next, max);
}

/**
 * What a component does when the system restarts. Pure. It corresponds to the
 * specification's calculation and query `Restart`.
 *
 * @param durable whether the component is durable (specification parameter `durable`).
 * @returns the outcome for that component.
 */
export function restartOutcome(durable: boolean): RestartOutcome {
  return durable ? "keep" : "start-again";
}

/**
 * One decision of a fresh answer, reusable for the next by calling a `begin…` method
 * again. Create one with `new PromiseKeeper()`; it takes no arguments and starts in
 * the specification's initial state.
 *
 * `beginFreshNumber`, `beginFreshText`, `usedNumber` and `usedText` each perform one
 * command of the specification and return nothing: what they lead to is seen in
 * `state()` and `fresh()`. The usual sequence is: one `begin…` call, then `usedNumber`
 * or `usedText` once per value the query answered before, in order, and last `fresh`.
 * Values of either kind may be given after either `begin…` call, but neither may come
 * before the first `begin…` call.
 */
export class PromiseKeeper {
  #state: PromiseKeeperState = initialState();

  /**
   * Reads what the promise keeper remembers. It only reads, and may be called at any
   * point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): PromiseKeeperState {
    return { ...this.#state, used: [...this.#state.used] };
  }

  /**
   * Performs the specification's command `BeginFreshNumber`: the fresh answer of a
   * query that answers numbers is decided next, and no value answered before has been
   * given yet. It discards what an earlier decision gathered.
   *
   * @param drawn the number drawn (specification parameter `drawn`).
   */
  beginFreshNumber(drawn: number): void {
    this.#state = { ...initialState(), freshDrawn: drawn, freshKind: "number" };
  }

  /**
   * Performs the specification's command `BeginFreshText`: the fresh answer of a query
   * that answers texts is decided next, and no value answered before has been given
   * yet. It discards what an earlier decision gathered.
   *
   * @param drawn the text drawn (specification parameter `drawn`).
   */
  beginFreshText(drawn: string): void {
    this.#state = { ...initialState(), freshDrawn: drawn, freshKind: "text" };
  }

  /**
   * Performs the specification's command `UsedNumber`: gives one number the query
   * answered before.
   *
   * @param answered that number (specification parameter `answered`).
   */
  usedNumber(answered: number): void {
    const { freshDrawn, freshKind, largestUsed, used } = this.#state;
    const largest = largestAfter(largestUsed, answered);
    this.#state = {
      ...this.#state,
      freshInstead: freshKind === "number" ? largest + 1 : numberedText(freshDrawn, used.length),
      largestUsed: largest,
      used: [...used, answered],
    };
  }

  /**
   * Performs the specification's command `UsedText`: gives one text the query answered
   * before.
   *
   * @param answered that text (specification parameter `answered`).
   */
  usedText(answered: string): void {
    const { freshDrawn, freshInstead, freshKind, used } = this.#state;
    this.#state = {
      ...this.#state,
      freshInstead: freshKind === "text" ? numberedText(freshDrawn, used.length) : freshInstead,
      used: [...used, answered],
    };
  }

  /**
   * Performs the specification's query `Fresh`. It only reads, and may be called at
   * any point, including more than once.
   *
   * @returns the answer to give for the values given so far; see `freshAnswer`.
   */
  fresh(): Json {
    return freshAnswer(this.#state);
  }
}
