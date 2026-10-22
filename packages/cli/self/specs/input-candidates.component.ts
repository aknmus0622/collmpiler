import { answer, decisions, does, external, failed, init, is, otherwise, requires, service, value } from "@clp/core";
import type { Int, Json } from "@clp/core";

export const InputCandidates = service("Decides which values the generator of command inputs mixes in, and which remembered value an input is picked from.", {
  state: {
    // The strings given so far for a string input, each once, in the order first given.
    knownTexts: init<string[]>([]),
    // The lengths decided so far for a string input, each once, in the order first decided.
    foundLengths: init<Int[]>([]),
    // Whether the number input takes integers only.
    wholeOnly: init<boolean>(false),
    // The smallest value the number input takes, if any.
    lowest: init<Int | null>(null),
    // The largest value the number input takes, if any.
    highest: init<Int | null>(null),
    // The thresholds given so far for a number input, in the order given.
    aroundValues: init<Int[]>([]),
    // The positions (from 0) of the remembered values given so far that can be used.
    usablePositions: init<Int[]>([]),
    // How many remembered values have been given so far.
    itemsGiven: init<Int>(0),
    // The position to pick, if one is to be picked.
    pickGiven: init<Int | null>(null),
  },
  commands: {
    BeginStrings() {
      does.beginStrings("The candidates for a string input are decided next. Nothing has been given yet.");
    },
    Text(text: string) {
      does.text("A string found in the specification, or an example declared for the input.");
    },
    LengthNumber(number: Int) {
      requires(number >= -2 && number <= 10002);
      does.lengthNumber("A number found in the specification. If it is an integer from 1 to 10000, strings one shorter, of that length and one longer are to be tried (those lengths, in that order: the number minus one, the number, the number plus one; each kept once).");
    },
    BeginNumbers(integer: boolean, min: Int | null, max: Int | null) {
      does.beginNumbers("The candidates for a number input are decided next: whether it takes integers only, and its smallest and largest value if it has them. No threshold has been given yet.");
    },
    Around(around: Int) {
      requires(around >= -4 && around <= 13);
      does.around("A threshold: a number found in the specification or declared with `around`.");
    },
    BeginAmong(pick: Int | null) {
      does.beginAmong("An input is to be picked from what the component remembers: at the position `pick`, or not at all when there is none. No remembered value has been given yet.");
    },
    Item(usable: boolean) {
      does.item("A remembered value, and whether it can be used (it is not null and fits the input's type).");
    },
  },
  queries: {
    DecideStrings(): { known: string[]; lengths: Int[] } {
      return value.decideStrings("The answer: the strings given (each once, in the order first given) and the lengths decided (each once, in the order first decided).");
    },
    DecideNumbers(): { limits: Int[]; thresholds: Int[] } {
      return value.decideNumbers("The answer. The limits: the smallest and then the largest value, those that exist. The thresholds: for each threshold (taking a threshold given twice once), the threshold itself, or, for an input that takes integers only, one less, itself and one more. Both keep only values the input takes (an integer if it takes integers only, within its smallest and largest value), each once, in the order first found.");
    },
    DecideAmong(): Int | null {
      return value.decideAmong("The answer: the position (among all the values given, from 0) of the value picked, or null. Among the values that can be used, the one at `pick` modulo their number is picked; none is picked when there is no `pick` or no value can be used.");
    },
  },
});
