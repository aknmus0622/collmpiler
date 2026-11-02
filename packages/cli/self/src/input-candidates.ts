/**
 * Decides which values the generator of command inputs mixes in, and which
 * remembered value an input is picked from.
 *
 * Nothing here looks at a specification or generates anything: the caller
 * announces what it is about to decide, feeds in what it found, one call per
 * finding, and then reads the answer.
 *
 * It corresponds to the specification's component `input-candidates`. It has no
 * dependencies and keeps nothing across a restart: a new instance starts empty.
 */

/**
 * The number input whose candidates are decided next. The field names are the
 * parameter names of the specification's command `BeginNumbers`.
 */
export interface NumberInput {
  /** Whether the input takes integers only (specification parameter `integer`). */
  integer: boolean;
  /** Its smallest value, or `null` if it has none (specification parameter `min`). */
  min: number | null;
  /** Its largest value, or `null` if it has none (specification parameter `max`). */
  max: number | null;
}

/**
 * The answer for a number input. A new plain object with exactly these two
 * fields, so it can be compared by value. The field names are those of the
 * result of the specification's query `DecideNumbers`.
 */
export interface NumberCandidates {
  /** The candidates that come from the input's own limits, in order. */
  limits: number[];
  /** The candidates that come from the thresholds given, in order. */
  thresholds: number[];
}

/**
 * The answer for a string input. A new plain object with exactly these two
 * fields, so it can be compared by value. The field names are those of the
 * result of the specification's query `DecideStrings`.
 */
export interface StringCandidates {
  /** The strings to try as they are, in order. */
  known: string[];
  /** The lengths of strings to try, in order. */
  lengths: number[];
}

/** Appends `value` to `values` unless it is already there. */
function addOnce<T>(values: T[], value: T): void {
  if (!values.includes(value)) {
    values.push(value);
  }
}

/** The smallest and then the largest value, those that exist, each once. */
function limitsOf(lowest: number | null, highest: number | null): number[] {
  if (lowest === null) {
    return highest === null ? [] : [highest];
  }
  if (highest === null) {
    return [lowest];
  }
  if (lowest < highest) {
    return [lowest, highest];
  }
  return lowest === highest ? [lowest] : [];
}

/** Whether `value` lies within the bounds that exist. */
function isWithin(value: number, lowest: number | null, highest: number | null): boolean {
  return (lowest === null || value >= lowest) && (highest === null || value <= highest);
}

/**
 * For each threshold in order, the values from `reach` below it to `reach`
 * above it that are accepted, each once, in the order first found.
 */
function thresholdsNear(
  thresholds: number[],
  reach: number,
  accepts: (value: number) => boolean,
): number[] {
  const found: number[] = [];
  for (const threshold of thresholds) {
    for (let value = threshold - reach; value <= threshold + reach; value += 1) {
      if (accepts(value)) {
        addOnce(found, value);
      }
    }
  }
  return found;
}

/**
 * The position of the usable value at `pick` modulo their number, or `null` when
 * there is no `pick` or no usable value. A negative `pick` counts from the end.
 */
function positionPicked(pick: number | null, usablePositions: number[]): number | null {
  const count = usablePositions.length;
  if (pick === null || count === 0) {
    return null;
  }
  return usablePositions[((pick % count) + count) % count];
}

/**
 * One generator's working memory while it decides inputs. Create one with
 * `new InputCandidates()`; it takes no arguments.
 *
 * It answers three separate questions, each with its own sequence of calls:
 *
 * - number input: `beginNumbers`, then `around` any number of times, then
 *   `decideNumbers`;
 * - string input: `beginStrings`, then `text` and `lengthNumber` any number of
 *   times and in any mix, then `decideStrings`;
 * - picking a remembered value: `beginAmong`, then `item` once per remembered
 *   value, in order, then `decideAmong`.
 *
 * The three sequences do not affect one another, so they may be interleaved. A
 * `begin…` call discards what its own sequence had gathered. The `decide…`
 * methods only read: they change nothing, may be called at any point, also
 * before any `begin…`, and repeated calls give equal answers.
 */
export class InputCandidates {
  private aroundValues: number[] = [];
  private lowest: number | null = null;
  private highest: number | null = null;
  private wholeOnly = false;

  private knownTexts: string[] = [];
  private foundLengths: number[] = [];

  private pickGiven: number | null = null;
  private itemsGiven = 0;
  private usablePositions: number[] = [];

  /**
   * Performs the specification's command `BeginNumbers`: the candidates for a
   * number input are decided next, and no threshold has been given yet.
   *
   * @param input the input's description.
   */
  beginNumbers(input: NumberInput): void {
    this.wholeOnly = input.integer;
    this.lowest = input.min;
    this.highest = input.max;
    this.aroundValues = [];
  }

  /**
   * Performs the specification's command `Around`: gives one threshold, a number
   * found in the specification or declared with `around`, for the number input
   * begun last. Call it once per threshold found, in the order found.
   *
   * @param around the threshold (specification parameter `around`). The
   *   specification's `requires` limits it; other values are never passed.
   */
  around(around: number): void {
    this.aroundValues.push(around);
  }

  /**
   * Performs the specification's query `DecideNumbers`.
   *
   * @returns the candidates for the number input begun last, from everything
   *   given for it so far.
   */
  decideNumbers(): NumberCandidates {
    return {
      limits: limitsOf(this.lowest, this.highest),
      thresholds: thresholdsNear(
        this.aroundValues,
        this.wholeOnly ? 1 : 0,
        (value) => isWithin(value, this.lowest, this.highest),
      ),
    };
  }

  /**
   * Performs the specification's command `BeginStrings`: the candidates for a
   * string input are decided next, and nothing has been given yet.
   */
  beginStrings(): void {
    this.knownTexts = [];
    this.foundLengths = [];
  }

  /**
   * Performs the specification's command `Text`: gives one string found in the
   * specification, or an example declared for the input, for the string input
   * begun last.
   *
   * @param text the string (specification parameter `text`).
   */
  text(text: string): void {
    addOnce(this.knownTexts, text);
  }

  /**
   * Performs the specification's command `LengthNumber`: gives one number found
   * in the specification, from which lengths of strings to try may follow, for
   * the string input begun last.
   *
   * @param number the number found (specification parameter `number`). The
   *   specification's `requires` limits it; other values are never passed.
   */
  lengthNumber(number: number): void {
    if (number >= 1 && number <= 10000) {
      addOnce(this.foundLengths, number - 1);
      addOnce(this.foundLengths, number);
      addOnce(this.foundLengths, number + 1);
    }
  }

  /**
   * Performs the specification's query `DecideStrings`.
   *
   * @returns the candidates for the string input begun last, from everything
   *   given for it so far.
   */
  decideStrings(): StringCandidates {
    return { known: [...this.knownTexts], lengths: [...this.foundLengths] };
  }

  /**
   * Performs the specification's command `BeginAmong`: an input is to be picked
   * from what the component remembers, and no remembered value has been given
   * yet.
   *
   * @param pick the position to pick at, or `null` to pick nothing
   *   (specification parameter `pick`).
   */
  beginAmong(pick: number | null): void {
    this.pickGiven = pick;
    this.itemsGiven = 0;
    this.usablePositions = [];
  }

  /**
   * Performs the specification's command `Item`: gives the next remembered value
   * for the pick begun last. The value itself is not needed, only whether it can
   * be used.
   *
   * @param usable whether the value can be used, meaning it is not null and fits
   *   the input's type (specification parameter `usable`).
   */
  item(usable: boolean): void {
    if (usable) {
      this.usablePositions.push(this.itemsGiven);
    }
    this.itemsGiven += 1;
  }

  /**
   * Performs the specification's query `DecideAmong`.
   *
   * @returns where the value picked stands among all the values given to `item`
   *   since `beginAmong`, counting from 0, or `null` if none is picked.
   */
  decideAmong(): number | null {
    return positionPicked(this.pickGiven, this.usablePositions);
  }
}
