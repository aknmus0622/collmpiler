import type { NumberInput } from "./types.ts";

/**
 * Pure decisions and calculations of the input candidates. They read only their arguments and never
 * modify them.
 */

/** The smallest number from which a number found in the specification decides string lengths. */
const SHORTEST_LENGTH = 1;
/** The largest number up to which a number found in the specification decides string lengths. */
const LONGEST_LENGTH = 10000;
/** How far around a threshold of an integer input (and around a string length) values are tried. */
const STEP = 1;

/** The list followed by the value, unless the list already has it. */
function withOnce<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? [...list] : [...list, value];
}

/** The values, each once, in the order first found. */
function once<T>(values: readonly T[]): T[] {
  return values.reduce<T[]>((kept, value) => withOnce(kept, value), []);
}

/** Whether the number input takes the value: an integer if it takes integers only, within its limits. */
function takes(input: NumberInput, value: number): boolean {
  if (input.wholeOnly && !Number.isInteger(value)) return false;
  if (input.lowest !== null && value < input.lowest) return false;
  if (input.highest !== null && value > input.highest) return false;
  return true;
}

/**
 * Corresponds to the specification's calculation `thresholdsWithNew`.
 *
 * @param thresholds the specification's `data.aroundValues`: the thresholds given so far
 * @param threshold the `Around` command's `around`
 * @returns the new list to remember as `data.aroundValues`
 */
export function thresholdsWithNew(thresholds: readonly number[], threshold: number): number[] {
  return [...thresholds, threshold];
}

/**
 * Corresponds to the specification's calculation `textsWithNew`.
 *
 * @param texts the specification's `data.knownTexts`: the strings given so far
 * @param text the `Text` command's `text`
 * @returns the new list to remember as `data.knownTexts`
 */
export function textsWithNew(texts: readonly string[], text: string): string[] {
  return withOnce(texts, text);
}

/**
 * Pure decision for the specification's `LengthNumber` command: whether the number leads to string lengths
 * being decided, i.e. whether the command's only named case (rather than `otherwise`) applies.
 *
 * @param number the `LengthNumber` command's `number`
 * @returns true when that named case applies, false for `otherwise`
 */
export function isLengthNumber(number: number): boolean {
  return Number.isInteger(number) && number >= SHORTEST_LENGTH && number <= LONGEST_LENGTH;
}

/**
 * Corresponds to the specification's calculation `lengthsWithNew`.
 *
 * @param lengths the specification's `data.foundLengths`: the lengths decided so far
 * @param number the `LengthNumber` command's `number`
 * @returns the new list to remember as `data.foundLengths`
 */
export function lengthsWithNew(lengths: readonly number[], number: number): number[] {
  return [number - STEP, number, number + STEP].reduce<number[]>((kept, length) => withOnce(kept, length), [...lengths]);
}

/**
 * Corresponds to the specification's calculation `itemsAfter`.
 *
 * @param itemsGiven the specification's `data.itemsGiven`
 * @returns the new value to remember as `data.itemsGiven`
 */
export function itemsAfter(itemsGiven: number): number {
  return itemsGiven + 1;
}

/**
 * Corresponds to the specification's calculation `positionsWithItem`.
 *
 * @param positions the specification's `data.usablePositions`
 * @param itemsGiven the specification's `data.itemsGiven`, before the `Item` command changes it
 * @returns the new list to remember as `data.usablePositions`
 */
export function positionsWithItem(positions: readonly number[], itemsGiven: number): number[] {
  return [...positions, itemsGiven];
}

/**
 * Corresponds to the specification's calculation `picked`: the answer of `DecideAmong`.
 *
 * @param positions the specification's `data.usablePositions`
 * @param pick the specification's `data.pickGiven`, or `null` when none
 * @returns a position among all the values given (from 0), or `null`
 */
export function picked(positions: readonly number[], pick: number | null): number | null {
  if (pick === null || positions.length === 0) return null;
  return positions[pick % positions.length] ?? null;
}

/**
 * Corresponds to the specification's calculation `limits`.
 *
 * @param input what is known about the number input
 * @returns the limits answered by `DecideNumbers`
 */
export function limits(input: NumberInput): number[] {
  const existing = [input.lowest, input.highest].filter((limit): limit is number => limit !== null);
  return once(existing.filter((limit) => takes(input, limit)));
}

/**
 * Corresponds to the specification's calculation `thresholds`.
 *
 * @param input what is known about the number input
 * @param aroundValues the specification's `data.aroundValues`: the thresholds given, in the order given
 * @returns the thresholds answered by `DecideNumbers`
 */
export function thresholds(input: NumberInput, aroundValues: readonly number[]): number[] {
  const tried = once(aroundValues).flatMap((threshold) =>
    input.wholeOnly ? [threshold - STEP, threshold, threshold + STEP] : [threshold],
  );
  return once(tried.filter((value) => takes(input, value)));
}
