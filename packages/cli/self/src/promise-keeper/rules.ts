import type { AnsweredValue, IncreasingRequest, RestartOutcome } from "./types.ts";

/**
 * Pure decisions and calculations of the promise keeper. They read only their arguments.
 */

/**
 * Pure decision for the specification's `Fresh` command (its calculations `oneMoreThanLargest` and
 * `drawnNumbered` included).
 *
 * @param drawn the specification's `data.freshDrawn`: the value drawn for the fresh answer
 * @param used the specification's `data.used`: the values answered before, in the order given
 * @returns the answer of `Fresh`
 */
export function freshAnswer(drawn: AnsweredValue, used: readonly AnsweredValue[]): AnsweredValue {
  if (!used.includes(drawn)) {
    return drawn;
  }
  if (typeof drawn === "number") {
    return oneMoreThanLargest(used);
  }
  return drawnNumbered(drawn, used);
}

/** The specification's calculation `oneMoreThanLargest`: one more than the largest number answered before. */
function oneMoreThanLargest(used: readonly AnsweredValue[]): number {
  const numbers = used.filter((value): value is number => typeof value === "number");
  return Math.max(...numbers) + 1;
}

/**
 * The specification's calculation `drawnNumbered`: the text drawn, "#", and the number of values answered
 * before (of either kind).
 */
function drawnNumbered(drawn: string, used: readonly AnsweredValue[]): string {
  return `${drawn}#${used.length}`;
}

/**
 * Pure decision for the specification's `Increasing` command (its calculation `increasedAnswer` included).
 *
 * @param request the command's input
 * @returns the answer of `Increasing`
 */
export function increasingAnswer(request: IncreasingRequest): number {
  if (request.previous === null) {
    return request.drawn;
  }
  const increased = request.previous + request.delta;
  return request.max === null ? increased : Math.min(increased, request.max);
}

/**
 * Pure decision for the specification's `Restart` command.
 *
 * @param durable the command's `durable`: whether the component that restarts is durable
 * @returns the answer of `Restart`
 */
export function restartOutcome(durable: boolean): RestartOutcome {
  return durable ? "keep" : "start-again";
}

/**
 * Corresponds to the specification's calculation `usedWithValue`.
 *
 * @param used the values answered before given so far (`data.used`)
 * @param value the value just given
 * @returns the new list to remember; `used` is not modified
 */
export function usedWithValue(used: readonly AnsweredValue[], value: AnsweredValue): AnsweredValue[] {
  return [...used, value];
}
