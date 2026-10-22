/**
 * Promise keeper: turns answers drawn at random into answers that keep a
 * dependency's promises, and decides what survives a restart.
 *
 * Corresponds to the specification component `promise-keeper`. It has no
 * dependencies and is not durable. Its entries map onto this module as follows:
 *
 * - Commands `BeginFreshNumber`, `BeginFreshText`, `UsedNumber`, `UsedText`
 *   and query `Fresh`: the methods of {@link FreshAnswer}, one instance per
 *   fresh answer being decided.
 * - Query `Increasing`: the pure function {@link increasingAnswer}.
 * - Query `Restart`: the pure function {@link restartOutcome}.
 *
 * The decisions themselves live in the pure functions {@link freshAnswer},
 * {@link afterUsedNumber} and {@link afterUsedText}; the class only holds the
 * state between commands.
 */

/** Any JSON value (specification type `json`). */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * The kind of value a fresh answer is decided for (specification state
 * `freshKind`, without its `null`).
 *
 * - `"number"`: the query answers numbers (started by `BeginFreshNumber`).
 * - `"text"`: the query answers texts (started by `BeginFreshText`).
 */
export type FreshKind = "number" | "text";

/**
 * What the promise keeper remembers about the fresh answer being decided.
 * Each field is the specification state field of the same name; the initial
 * value is {@link initialFreshState}.
 */
export interface FreshState {
  /** The value drawn at random, or `null` before any `Begin…` command (state `freshDrawn`). */
  freshDrawn: Json;
  /** The answer to give instead of the drawn value when that one was already answered before (state `freshInstead`). */
  freshInstead: Json;
  /** Whether the query answers numbers or texts; `null` before any `Begin…` command (state `freshKind`). */
  freshKind: FreshKind | null;
  /** The largest number reported as answered before, or `null` if none yet (state `largestUsed`). */
  largestUsed: number | null;
  /** Every value reported as answered before, of either kind, in the order reported (state `used`). */
  used: Json[];
}

/** The state before any command: the specification's `init`. */
export function initialFreshState(): FreshState {
  return { freshDrawn: null, freshInstead: null, freshKind: null, largestUsed: null, used: [] };
}

/** The state right after a `Begin…` command: the drawn value, nothing answered before yet. */
function beginFresh(drawn: Json, freshKind: FreshKind): FreshState {
  return { freshDrawn: drawn, freshInstead: null, freshKind, largestUsed: null, used: [] };
}

/** The drawn text followed by "#" and the count of values answered before, including the one being reported. */
function numberedText(state: FreshState): string {
  return `${state.freshDrawn}#${state.used.length + 1}`;
}

/**
 * Specification command `BeginFreshNumber`: start deciding the fresh answer of
 * a query that answers numbers. Forgets everything about any earlier answer.
 *
 * @param drawn the number drawn at random.
 * @returns the new state.
 */
export function beginFreshNumber(drawn: number): FreshState {
  return beginFresh(drawn, "number");
}

/**
 * Specification command `BeginFreshText`: start deciding the fresh answer of
 * a query that answers texts. Forgets everything about any earlier answer.
 *
 * @param drawn the text drawn at random.
 * @returns the new state.
 */
export function beginFreshText(drawn: string): FreshState {
  return beginFresh(drawn, "text");
}

/**
 * Specification command `UsedNumber`: report a number the query answered
 * before. Only called after a `Begin…` command.
 *
 * @param state the state before the command.
 * @param answered the number answered before.
 * @returns the new state.
 */
export function afterUsedNumber(state: FreshState, answered: number): FreshState {
  const largestUsed = state.largestUsed === null ? answered : Math.max(state.largestUsed, answered);
  return {
    ...state,
    freshInstead: state.freshKind === "number" ? largestUsed + 1 : numberedText(state),
    largestUsed,
    used: [...state.used, answered],
  };
}

/**
 * Specification command `UsedText`: report a text the query answered before.
 * Only called after a `Begin…` command.
 *
 * @param state the state before the command.
 * @param answered the text answered before.
 * @returns the new state.
 */
export function afterUsedText(state: FreshState, answered: string): FreshState {
  return {
    ...state,
    freshInstead: state.freshKind === "text" ? numberedText(state) : state.freshInstead,
    used: [...state.used, answered],
  };
}

/**
 * Specification query `Fresh` (calculation `fresh`): the answer that keeps the
 * promise of never answering the same value twice, read from the state.
 *
 * @param state the current state.
 * @returns the fresh answer (`null` if no `Begin…` command has happened).
 */
export function freshAnswer(state: FreshState): Json {
  // Drawn and answered values are numbers or texts, so strict equality is value equality.
  return state.used.includes(state.freshDrawn) ? state.freshInstead : state.freshDrawn;
}

/**
 * Holds the state of one fresh answer between commands. Start it with
 * {@link FreshAnswer.beginNumber} or {@link FreshAnswer.beginText}, report each
 * value answered before with {@link FreshAnswer.usedNumber} or
 * {@link FreshAnswer.usedText}, then read the answer with {@link FreshAnswer.fresh}.
 * A new instance is in the specification's initial state.
 */
export class FreshAnswer {
  #state: FreshState;

  constructor() {
    this.#state = initialFreshState();
  }

  /** Specification command `BeginFreshNumber`; see {@link beginFreshNumber}. */
  beginNumber(drawn: number): void {
    this.#state = beginFreshNumber(drawn);
  }

  /** Specification command `BeginFreshText`; see {@link beginFreshText}. */
  beginText(drawn: string): void {
    this.#state = beginFreshText(drawn);
  }

  /** Specification command `UsedNumber`; see {@link afterUsedNumber}. */
  usedNumber(answered: number): void {
    this.#state = afterUsedNumber(this.#state, answered);
  }

  /** Specification command `UsedText`; see {@link afterUsedText}. */
  usedText(answered: string): void {
    this.#state = afterUsedText(this.#state, answered);
  }

  /** Specification query `Fresh`; see {@link freshAnswer}. */
  fresh(): Json {
    return freshAnswer(this.#state);
  }

  /** The current state, as the specification's state fields (a copy). */
  get state(): FreshState {
    return { ...this.#state, used: [...this.#state.used] };
  }
}

/**
 * The input of the `Increasing` query: one answer of a query that promises
 * never to answer less than before. Each field is the specification parameter
 * of the same name.
 */
export interface IncreasingInput {
  /** The increment to apply to the previous answer (parameter `delta`). */
  delta: number;
  /** The value drawn at random (parameter `drawn`). */
  drawn: number;
  /** The largest value the query may answer, or `null` when there is none (parameter `max`). */
  max: number | null;
  /** The previous answer, or `null` when it has not answered before (parameter `previous`). */
  previous: number | null;
}

/**
 * Specification query `Increasing` (calculation `increasing`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 *
 * @param input the specification's parameters, as one record.
 * @returns the answer to give.
 */
export function increasingAnswer(input: IncreasingInput): number {
  const { delta, drawn, max, previous } = input;
  if (previous === null) return drawn;
  return max === null ? previous + delta : Math.min(previous + delta, max);
}

/**
 * What happens to a component when the system restarts (specification result
 * of `Restart`).
 *
 * - `"keep"`: it keeps its state and data.
 * - `"start-again"`: it starts over from its initial state.
 */
export type RestartOutcome = "keep" | "start-again";

/**
 * Specification query `Restart` (calculation `restart`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 *
 * @param durable whether the component is declared durable (parameter `durable`).
 * @returns what happens to it on restart.
 */
export function restartOutcome(durable: boolean): RestartOutcome {
  return durable ? "keep" : "start-again";
}
