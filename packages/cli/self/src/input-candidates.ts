/**
 * Decides which values the generator of command inputs mixes in for one
 * input, and which remembered value an input is picked from.
 *
 * Corresponds to the specification component "input-candidates". The
 * component has no states of its own (it is always in the specification
 * state `READY`), no dependencies and no effects. One `InputCandidates`
 * object remembers what it has been given between calls; each method
 * performs one specification command. It is used in three independent
 * sequences, each started by its `begin...` method, fed by the methods
 * listed with it, and closed by its `decide...` method, which answers:
 *
 *   numbers: `beginNumbers`, then `around` per threshold, then `decideNumbers`
 *   strings: `beginStrings`, then `text` / `lengthNumber` in any order, then `decideStrings`
 *   among:   `beginAmong`, then `item` per remembered value, then `decideAmong`
 *
 * Command -> method:
 *   `Around`        -> `around`
 *   `BeginAmong`    -> `beginAmong`
 *   `BeginNumbers`  -> `beginNumbers`
 *   `BeginStrings`  -> `beginStrings`
 *   `DecideAmong`   -> `decideAmong`
 *   `DecideNumbers` -> `decideNumbers`
 *   `DecideStrings` -> `decideStrings`
 *   `Item`          -> `item`
 *   `LengthNumber`  -> `lengthNumber`
 *   `Text`          -> `text`
 *
 * Remembered data (spec `data`) is private; it is observable only through
 * the answers of the `decide...` methods.
 */

/** Input of `BeginNumbers`: the number input whose candidates are decided. Field names identical to the specification's. */
export interface NumberInput {
  /** Whether the input takes integers only (spec data `wholeOnly`). */
  integer: boolean;
  /** The smallest value the input takes, or `null` when it has none (spec data `lowest`). */
  min: number | null;
  /** The largest value the input takes, or `null` when it has none (spec data `highest`). */
  max: number | null;
}

/** Answer of `DecideNumbers`. Field names identical to the specification's. */
export interface NumberCandidates {
  /** The input's limit values to try, in order (spec calculation `limits`). */
  limits: number[];
  /** The values to try around the thresholds given, in order (spec calculation `thresholds`). */
  thresholds: number[];
}

/** Answer of `DecideStrings`. Field names identical to the specification's. */
export interface StringCandidates {
  /** The strings given through `text`, each once, in the order first given (spec data `knownTexts`). */
  known: string[];
  /** The string lengths decided through `lengthNumber`, each once, in the order first decided (spec data `foundLengths`). */
  lengths: number[];
}

/**
 * Remembers what one generator run gives it and answers which candidates to
 * use. Starts with nothing given (spec `model.initial`). Every method can be
 * called at any time.
 */
export class InputCandidates {
  #number: NumberInput = { integer: false, min: null, max: null };
  #thresholds: number[] = [];
  #texts: string[] = [];
  #lengths: number[] = [];
  #pick: number | null = null;
  #itemsGiven = 0;
  #usablePositions: number[] = [];

  /**
   * Spec command `BeginNumbers`: the candidates for the number input `input`
   * are decided next. Forgets the thresholds given before.
   */
  beginNumbers(input: NumberInput): void {
    this.#number = { integer: input.integer, min: input.min, max: input.max };
    this.#thresholds = [];
  }

  /**
   * Spec command `Around`: one threshold for the current number input (a
   * number found in the specification or declared with `around`), given in
   * order. A threshold may be given more than once.
   */
  around(threshold: number): void {
    this.#thresholds = [...this.#thresholds, threshold];
  }

  /**
   * Spec command `DecideNumbers`: answers the candidates for the number input
   * described by the last `beginNumbers` and the thresholds given since.
   * Changes nothing.
   */
  decideNumbers(): NumberCandidates {
    return {
      limits: numberLimits(this.#number),
      thresholds: thresholdCandidates(this.#number, this.#thresholds),
    };
  }

  /**
   * Spec command `BeginStrings`: the candidates for a string input are
   * decided next. Forgets the strings and lengths given before.
   */
  beginStrings(): void {
    this.#texts = [];
    this.#lengths = [];
  }

  /**
   * Spec command `Text`: one string found in the specification, or an
   * example declared for the input (`""` included).
   */
  text(text: string): void {
    this.#texts = textsAfterText(this.#texts, text);
  }

  /**
   * Spec command `LengthNumber`: one number found in the specification, any
   * number (not only integers). May add string lengths to try, or ignore it.
   */
  lengthNumber(number: number): void {
    this.#lengths = lengthsAfterNumber(this.#lengths, number);
  }

  /**
   * Spec command `DecideStrings`: answers the strings and lengths given since
   * the last `beginStrings`. Changes nothing.
   */
  decideStrings(): StringCandidates {
    return { known: [...this.#texts], lengths: [...this.#lengths] };
  }

  /**
   * Spec command `BeginAmong`: an input is to be picked from the values the
   * system remembers. `pick` is the position to pick (a whole number from 0),
   * or `null` when none is to be picked (spec data `pickGiven`). Forgets the
   * remembered values given before.
   */
  beginAmong(pick: number | null): void {
    this.#pick = pick;
    this.#itemsGiven = 0;
    this.#usablePositions = [];
  }

  /**
   * Spec command `Item`: the next remembered value, in order (its position
   * is the number of `item` calls since `beginAmong`, from 0). `usable` says
   * whether it can be used for the input (it is not null and fits the
   * input's type).
   */
  item(usable: boolean): void {
    if (usable) this.#usablePositions = [...this.#usablePositions, this.#itemsGiven];
    this.#itemsGiven += 1;
  }

  /**
   * Spec command `DecideAmong`: answers the position (among all values given
   * through `item` since `beginAmong`, from 0) of the value picked, or `null`
   * when none is picked. Changes nothing.
   */
  decideAmong(): number | null {
    return pickedPosition(this.#usablePositions, this.#pick);
  }
}

/** Whether the number input `input` takes the value `value`. */
function takes(input: NumberInput, value: number): boolean {
  if (input.integer && !Number.isInteger(value)) return false;
  if (input.min !== null && value < input.min) return false;
  if (input.max !== null && value > input.max) return false;
  return true;
}

/** `values` without repeats, in the order first found. */
function distinct<T>(values: readonly T[]): T[] {
  const result: T[] = [];
  for (const value of values) if (!result.includes(value)) result.push(value);
  return result;
}

/**
 * Pure calculation `limits` of the specification: the limit values to try
 * for the number input `input`.
 */
export function numberLimits(input: NumberInput): number[] {
  const limits = [input.min, input.max].filter((value): value is number => value !== null);
  return distinct(limits.filter((value) => takes(input, value)));
}

/**
 * Pure calculation `thresholds` of the specification: the values to try for
 * the number input `input`, given the thresholds given for it in order
 * (possibly with repeats).
 */
export function thresholdCandidates(input: NumberInput, thresholds: readonly number[]): number[] {
  const values = distinct(thresholds).flatMap((threshold) =>
    input.integer ? [threshold - 1, threshold, threshold + 1] : [threshold],
  );
  return distinct(values.filter((value) => takes(input, value)));
}

/**
 * Pure calculation `lengthsWithNew` of the specification, together with the
 * condition of `LengthNumber`: the string lengths decided so far (`lengths`)
 * after the number `number` has been found. Returns `lengths` unchanged in
 * content when the number adds no length.
 */
export function lengthsAfterNumber(lengths: readonly number[], number: number): number[] {
  if (!Number.isInteger(number) || number < 1 || number > 10000) return [...lengths];
  return distinct([...lengths, number - 1, number, number + 1]);
}

/**
 * Pure calculation `textsWithNew` of the specification: the strings given so
 * far (`texts`) after `text` has been given.
 */
export function textsAfterText(texts: readonly string[], text: string): string[] {
  return texts.includes(text) ? [...texts] : [...texts, text];
}

/**
 * Pure calculation `picked` of the specification: the position to answer
 * from `DecideAmong`, given the positions (from 0, in order) of the usable
 * values (spec data `usablePositions`) and the position to pick, or `null`
 * (spec data `pickGiven`).
 */
export function pickedPosition(usablePositions: readonly number[], pick: number | null): number | null {
  if (pick === null || usablePositions.length === 0) return null;
  return usablePositions[pick % usablePositions.length];
}
