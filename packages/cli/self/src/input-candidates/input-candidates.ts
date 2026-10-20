import {
  isLengthNumber,
  itemsAfter,
  lengthsWithNew,
  limits,
  picked,
  positionsWithItem,
  textsWithNew,
  thresholds,
  thresholdsWithNew,
} from "./candidates.ts";
import type { NumberCandidates, NumberInput, StringCandidates } from "./types.ts";

/**
 * The input-candidates component: decides which values the generator of command inputs mixes in, and which
 * remembered value an input is picked from.
 *
 * It is driven in three independent sequences, which can be interleaved (each `begin…` resets only the data
 * of its own sequence):
 * - numbers: `beginNumbers`, then any number of `around`, finally `decideNumbers`;
 * - strings: `beginStrings`, then any number of `text` and `lengthNumber`, finally `decideStrings`;
 * - picking among remembered values: `beginAmong`, then one `item` per remembered value, in order, finally
 *   `decideAmong`.
 *
 * The component has no states of its own (the specification's only state is `READY`), so every method can
 * be called at any time. It has no dependencies. A new instance starts with the specification's initial
 * data. Each method below performs one command of the specification; what it remembers is observed through
 * the data getters, and the `decide…` methods return the command's answer.
 */
export class InputCandidates {
  private aroundValuesValue: readonly number[] = [];
  private foundLengthsValue: readonly number[] = [];
  private highestValue: number | null = null;
  private itemsGivenValue = 0;
  private knownTextsValue: readonly string[] = [];
  private lowestValue: number | null = null;
  private pickGivenValue: number | null = null;
  private usablePositionsValue: readonly number[] = [];
  private wholeOnlyValue = false;

  /** The specification's `data.aroundValues`: the thresholds given so far for a number input, in the order given. */
  get aroundValues(): readonly number[] {
    return this.aroundValuesValue;
  }

  /** The specification's `data.foundLengths`: the lengths decided so far for a string input, in order. */
  get foundLengths(): readonly number[] {
    return this.foundLengthsValue;
  }

  /** The specification's `data.highest`: the largest value the number input takes, or `null` when none. */
  get highest(): number | null {
    return this.highestValue;
  }

  /** The specification's `data.itemsGiven`: how many remembered values have been given so far. */
  get itemsGiven(): number {
    return this.itemsGivenValue;
  }

  /** The specification's `data.knownTexts`: the strings given so far for a string input, in order. */
  get knownTexts(): readonly string[] {
    return this.knownTextsValue;
  }

  /** The specification's `data.lowest`: the smallest value the number input takes, or `null` when none. */
  get lowest(): number | null {
    return this.lowestValue;
  }

  /** The specification's `data.pickGiven`: the position to pick, or `null` when none is to be picked. */
  get pickGiven(): number | null {
    return this.pickGivenValue;
  }

  /**
   * The specification's `data.usablePositions`: the positions (from 0) of the remembered values given so far
   * that can be used.
   */
  get usablePositions(): readonly number[] {
    return this.usablePositionsValue;
  }

  /** The specification's `data.wholeOnly`: whether the number input takes integers only. */
  get wholeOnly(): boolean {
    return this.wholeOnlyValue;
  }

  /**
   * Performs the command `Around`: gives one threshold of the number input begun with `beginNumbers`.
   *
   * @param value the command's `around`: the threshold
   */
  around(value: number): void {
    this.aroundValuesValue = thresholdsWithNew(this.aroundValuesValue, value);
  }

  /**
   * Performs the command `BeginAmong`: an input is to be picked from the remembered values given next.
   *
   * @param pick the command's `pick`: the position to pick, or `null` when nothing is to be picked
   */
  beginAmong(pick: number | null): void {
    this.itemsGivenValue = 0;
    this.pickGivenValue = pick;
    this.usablePositionsValue = [];
  }

  /**
   * Performs the command `BeginNumbers`: the candidates for a number input are decided next.
   *
   * @param integer the command's `integer`: whether the input takes integers only
   * @param min the command's `min`: the smallest value the input takes, or `null` when it has none
   * @param max the command's `max`: the largest value the input takes, or `null` when it has none
   */
  beginNumbers(integer: boolean, min: number | null, max: number | null): void {
    this.aroundValuesValue = [];
    this.highestValue = max;
    this.lowestValue = min;
    this.wholeOnlyValue = integer;
  }

  /** Performs the command `BeginStrings`: the candidates for a string input are decided next. Takes no arguments. */
  beginStrings(): void {
    this.foundLengthsValue = [];
    this.knownTextsValue = [];
  }

  /**
   * Performs the command `DecideAmong`. Takes no arguments.
   *
   * @returns the command's answer: the position (among all the values given to `item`, from 0) of the value
   *   picked, or `null` when none is picked
   */
  decideAmong(): number | null {
    return picked(this.usablePositionsValue, this.pickGivenValue);
  }

  /**
   * Performs the command `DecideNumbers`. Takes no arguments.
   *
   * @returns the command's answer
   */
  decideNumbers(): NumberCandidates {
    const input: NumberInput = { wholeOnly: this.wholeOnlyValue, lowest: this.lowestValue, highest: this.highestValue };
    return { limits: limits(input), thresholds: thresholds(input, this.aroundValuesValue) };
  }

  /**
   * Performs the command `DecideStrings`. Takes no arguments.
   *
   * @returns the command's answer
   */
  decideStrings(): StringCandidates {
    return { known: this.knownTextsValue, lengths: this.foundLengthsValue };
  }

  /**
   * Performs the command `Item`: the next remembered value.
   *
   * @param usable the command's `usable`: whether that remembered value can be used for the input
   */
  item(usable: boolean): void {
    if (usable) this.usablePositionsValue = positionsWithItem(this.usablePositionsValue, this.itemsGivenValue);
    this.itemsGivenValue = itemsAfter(this.itemsGivenValue);
  }

  /**
   * Performs the command `LengthNumber`: a number found in the specification, which may decide string lengths
   * to try.
   *
   * @param number the command's `number`
   */
  lengthNumber(number: number): void {
    if (isLengthNumber(number)) this.foundLengthsValue = lengthsWithNew(this.foundLengthsValue, number);
  }

  /**
   * Performs the command `Text`: gives one known string for the string input begun with `beginStrings`.
   *
   * @param text the command's `text`
   */
  text(text: string): void {
    this.knownTextsValue = textsWithNew(this.knownTextsValue, text);
  }
}
