/**
 * Input candidates: decides which values the generator of command inputs mixes
 * in, and which remembered value an input is picked from.
 *
 * Corresponds to the specification component `input-candidates`. It has no
 * dependencies and nothing durable. Its state is {@link InputCandidatesState};
 * each specification command is a pure step function on that state (and a
 * method of {@link InputCandidates}, which keeps the state for the caller), and
 * each specification query is a pure function of the state.
 *
 * The component is used in three independent rounds, each opened by its own
 * "begin" command and then fed values one at a time:
 *
 * - numbers: {@link InputCandidates.beginNumbers}, then any number of
 *   {@link InputCandidates.around}, then {@link InputCandidates.decideNumbers};
 * - strings: {@link InputCandidates.beginStrings}, then any number of
 *   {@link InputCandidates.text} and {@link InputCandidates.lengthNumber}, then
 *   {@link InputCandidates.decideStrings};
 * - picking a remembered value: {@link InputCandidates.beginAmong}, then one
 *   {@link InputCandidates.item} per remembered value in order, then
 *   {@link InputCandidates.decideAmong}.
 */

/**
 * Everything the component remembers (the specification's `state`). Each field
 * has the name of the specification state field it holds.
 */
export interface InputCandidatesState {
  /** Thresholds given in the current numbers round, in the order given (state `aroundValues`). */
  aroundValues: readonly number[];
  /** String lengths decided in the current strings round, in the order decided (state `foundLengths`). */
  foundLengths: readonly number[];
  /** The largest value the number input takes, or `null` when it has none (state `highest`). */
  highest: number | null;
  /** How many remembered values have been given in the current picking round (state `itemsGiven`). */
  itemsGiven: number;
  /** Strings given in the current strings round (state `knownTexts`). */
  knownTexts: readonly string[];
  /** The smallest value the number input takes, or `null` when it has none (state `lowest`). */
  lowest: number | null;
  /** The position asked for in the current picking round, or `null` for none (state `pickGiven`). */
  pickGiven: number | null;
  /** Positions (from 0, among all remembered values given) of the values that can be used (state `usablePositions`). */
  usablePositions: readonly number[];
  /** Whether the number input takes integers only (state `wholeOnly`). */
  wholeOnly: boolean;
}

/**
 * The answer of the query `DecideNumbers`: the candidate values for a number input.
 */
export interface NumberCandidates {
  /** The smallest and then the largest value the input takes, those that exist (specification field `limits`). */
  limits: number[];
  /** Values around the thresholds given, that the input takes (specification field `thresholds`). */
  thresholds: number[];
}

/**
 * The answer of the query `DecideStrings`: the candidate values for a string input.
 */
export interface StringCandidates {
  /** The strings given, each once, in the order first given (specification field `known`). */
  known: string[];
  /** The string lengths to try, each once, in the order first decided (specification field `lengths`). */
  lengths: number[];
}

/** The smallest string length a number found in the specification can suggest. */
const SHORTEST_SUGGESTED_LENGTH = 1;
/** The largest string length a number found in the specification can suggest. */
const LONGEST_SUGGESTED_LENGTH = 10000;

/** The list with the value appended, unless it is already there. */
function appendOnce<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list : [...list, value];
}

/** How far from a threshold a value may be to count as around it. */
function thresholdReach(wholeOnly: boolean): number {
  return wholeOnly ? 1 : 0;
}

/** Whether the number input takes the value: within its smallest and largest value. */
function withinLimits(state: InputCandidatesState, value: number): boolean {
  return (state.lowest === null || value >= state.lowest) && (state.highest === null || value <= state.highest);
}

/** The state the component starts from (the specification's `init`). */
export function initialInputCandidatesState(): InputCandidatesState {
  return {
    aroundValues: [],
    foundLengths: [],
    highest: null,
    itemsGiven: 0,
    knownTexts: [],
    lowest: null,
    pickGiven: null,
    usablePositions: [],
    wholeOnly: false,
  };
}

/**
 * Command `BeginNumbers`: the candidates for a number input are decided next;
 * forgets the thresholds of the previous numbers round.
 *
 * @param state the state before the command.
 * @param integer whether the input takes integers only (parameter `integer`).
 * @param min its smallest value, or `null` when it has none (parameter `min`).
 * @param max its largest value, or `null` when it has none (parameter `max`).
 * @returns the state after the command.
 */
export function beginNumbers(
  state: InputCandidatesState,
  integer: boolean,
  min: number | null,
  max: number | null,
): InputCandidatesState {
  return { ...state, aroundValues: [], highest: max, lowest: min, wholeOnly: integer };
}

/**
 * Command `Around`: a threshold, a number found in the specification or
 * declared with `around`, for the current number input.
 *
 * @param state the state before the command.
 * @param around the threshold (parameter `around`); only small integers are ever sent.
 * @returns the state after the command.
 */
export function around(state: InputCandidatesState, around: number): InputCandidatesState {
  return { ...state, aroundValues: [...state.aroundValues, around] };
}

/**
 * Command `BeginStrings`: the candidates for a string input are decided next;
 * forgets what the previous strings round was given.
 *
 * @param state the state before the command.
 * @returns the state after the command.
 */
export function beginStrings(state: InputCandidatesState): InputCandidatesState {
  return { ...state, foundLengths: [], knownTexts: [] };
}

/**
 * Command `Text`: a string found in the specification, or an example declared
 * for the current string input.
 *
 * @param state the state before the command.
 * @param text the string (parameter `text`).
 * @returns the state after the command.
 */
export function text(state: InputCandidatesState, text: string): InputCandidatesState {
  return { ...state, knownTexts: appendOnce(state.knownTexts, text) };
}

/**
 * Command `LengthNumber`: a number found in the specification, from which
 * string lengths to try may be decided for the current string input.
 *
 * @param state the state before the command.
 * @param number the number (parameter `number`); only integers in a bounded range are ever sent.
 * @returns the state after the command.
 */
export function lengthNumber(state: InputCandidatesState, number: number): InputCandidatesState {
  if (number < SHORTEST_SUGGESTED_LENGTH || number > LONGEST_SUGGESTED_LENGTH) return state;
  let lengths = state.foundLengths;
  for (const length of [number - 1, number, number + 1]) lengths = appendOnce(lengths, length);
  return { ...state, foundLengths: lengths };
}

/**
 * Command `BeginAmong`: an input is to be picked from the remembered values
 * given next; starts a new picking round.
 *
 * @param state the state before the command.
 * @param pick the position asked for, or `null` to pick none (parameter `pick`).
 * @returns the state after the command.
 */
export function beginAmong(state: InputCandidatesState, pick: number | null): InputCandidatesState {
  return { ...state, itemsGiven: 0, pickGiven: pick, usablePositions: [] };
}

/**
 * Command `Item`: the next remembered value of the current picking round.
 *
 * @param state the state before the command.
 * @param usable whether the value can be used: it is not null and fits the
 *               input's type (parameter `usable`).
 * @returns the state after the command.
 */
export function item(state: InputCandidatesState, usable: boolean): InputCandidatesState {
  return {
    ...state,
    itemsGiven: state.itemsGiven + 1,
    usablePositions: usable ? [...state.usablePositions, state.itemsGiven] : state.usablePositions,
  };
}

/**
 * Query `DecideNumbers` (calculation `decideNumbers`): the candidate values for
 * the current number input. Pure.
 */
export function decideNumbers(state: InputCandidatesState): NumberCandidates {
  const { lowest, highest } = state;
  let limits: number[];
  if (lowest !== null && highest !== null) {
    limits = lowest < highest ? [lowest, highest] : lowest === highest ? [lowest] : [];
  } else if (lowest !== null) {
    limits = [lowest];
  } else if (highest !== null) {
    limits = [highest];
  } else {
    limits = [];
  }

  const reach = thresholdReach(state.wholeOnly);
  let thresholds: readonly number[] = [];
  for (const threshold of state.aroundValues) {
    for (let value = threshold - reach; value <= threshold + reach; value++) {
      if (withinLimits(state, value)) thresholds = appendOnce(thresholds, value);
    }
  }
  return { limits, thresholds: [...thresholds] };
}

/**
 * Query `DecideStrings` (calculation `decideStrings`): the candidate values for
 * the current string input. Pure.
 */
export function decideStrings(state: InputCandidatesState): StringCandidates {
  return { known: [...state.knownTexts], lengths: [...state.foundLengths] };
}

/**
 * Query `DecideAmong` (calculation `decideAmong`): the position (from 0, among
 * all remembered values given in the current picking round) of the value
 * picked, or `null` when none is picked. Pure.
 */
export function decideAmong(state: InputCandidatesState): number | null {
  const usable = state.usablePositions;
  if (state.pickGiven === null || usable.length === 0) return null;
  const index = ((state.pickGiven % usable.length) + usable.length) % usable.length;
  return usable[index];
}

/**
 * Keeps the component's state between commands. Each method is the
 * specification command or query of the same name (see the pure function of
 * the same name for its arguments and answer); commands replace the kept
 * state, queries only read it. A new instance is in the specification's
 * initial state.
 */
export class InputCandidates {
  private state: InputCandidatesState = initialInputCandidatesState();

  /** Command `BeginNumbers`; see {@link beginNumbers}. */
  beginNumbers(integer: boolean, min: number | null, max: number | null): void {
    this.state = beginNumbers(this.state, integer, min, max);
  }

  /** Command `Around`; see {@link around}. */
  around(around: number): void {
    this.state = around_(this.state, around);
  }

  /** Command `BeginStrings`; see {@link beginStrings}. */
  beginStrings(): void {
    this.state = beginStrings(this.state);
  }

  /** Command `Text`; see {@link text}. */
  text(text: string): void {
    this.state = text_(this.state, text);
  }

  /** Command `LengthNumber`; see {@link lengthNumber}. */
  lengthNumber(number: number): void {
    this.state = lengthNumber(this.state, number);
  }

  /** Command `BeginAmong`; see {@link beginAmong}. */
  beginAmong(pick: number | null): void {
    this.state = beginAmong(this.state, pick);
  }

  /** Command `Item`; see {@link item}. */
  item(usable: boolean): void {
    this.state = item(this.state, usable);
  }

  /** Query `DecideNumbers`; see {@link decideNumbers}. */
  decideNumbers(): NumberCandidates {
    return decideNumbers(this.state);
  }

  /** Query `DecideStrings`; see {@link decideStrings}. */
  decideStrings(): StringCandidates {
    return decideStrings(this.state);
  }

  /** Query `DecideAmong`; see {@link decideAmong}. */
  decideAmong(): number | null {
    return decideAmong(this.state);
  }
}

// The methods `around` and `text` shadow the functions of the same name through their parameters.
const around_ = around;
const text_ = text;
