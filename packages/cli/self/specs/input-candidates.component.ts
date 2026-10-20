import { commands, data, input, integer, list, number, optional, record, service, string } from "@clp/core";

// Which values the generator of command inputs mixes in during verification (packages/cli/src/candidates.ts, used by
// `arbitraryOf` and `simulator` in runtime.ts): values a uniform random draw would almost never produce. Drawing at random,
// and how often each candidate is drawn, stay with the random generator; finding the strings and numbers in the meaning
// functions and decision tables, and comparing a remembered value with an input's type, are the caller's, which gives the
// results as facts.
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): what it decides shapes the oracle's run, so in use it must
// agree with Stage 0 (R4).
export const Data = data({
  knownTexts: { type: list("string"), initially: [], description: "The strings given so far for a string input, each once, in the order first given." },
  foundLengths: { type: list("integer"), initially: [], description: "The lengths decided so far for a string input, each once, in the order first decided." },
  wholeOnly: { type: "boolean", initially: false, description: "Whether the number input takes integers only." },
  lowest: { type: optional("number"), initially: null, description: "The smallest value the number input takes, if any." },
  highest: { type: optional("number"), initially: null, description: "The largest value the number input takes, if any." },
  aroundValues: { type: list("number"), initially: [], description: "The thresholds given so far for a number input, in the order given." },
  usablePositions: { type: list("integer"), initially: [], description: "The positions (from 0) of the remembered values given so far that can be used." },
  itemsGiven: { type: "integer", initially: 0, description: "How many remembered values have been given so far." },
  pickGiven: { type: optional("integer"), initially: null, description: "The position to pick, if one is to be picked." },
});

export const TextInput = input({ text: string({ examples: ["a", "b", ""] }) });
export const LengthNumberInput = input({ number: number({ min: -2, max: 10_002, around: [0, 1, 2.5, 10_000, 10_001] }) });
export const BeginNumbersInput = input({ integer: "boolean", min: optional(integer({ min: -3, max: 12 })), max: optional(integer({ min: -3, max: 12 })) });
export const AroundInput = input({ around: number({ min: -4, max: 13, around: [0.5, 3] }) });
export const BeginAmongInput = input({ pick: optional(integer({ min: 0, max: 20 })) });
export const ItemInput = input({ usable: "boolean" });

export const Command = commands({
  BeginStrings: { does: "The candidates for a string input are decided next. Nothing has been given yet." },
  Text: { input: TextInput, does: "A string found in the specification, or an example declared for the input." },
  LengthNumber: {
    input: LengthNumberInput,
    does:
      "A number found in the specification. If it is an integer from 1 to 10000, strings one shorter, of that length and one " +
      "longer are to be tried (those lengths, in that order: the number minus one, the number, the number plus one; each kept once).",
  },
  DecideStrings: {
    output: record({ known: list("string"), lengths: list("integer") }),
    does: "The answer: the strings given (each once, in the order first given) and the lengths decided (each once, in the order first decided).",
  },
  BeginNumbers: {
    input: BeginNumbersInput,
    does: "The candidates for a number input are decided next: whether it takes integers only, and its smallest and largest value if it has them. No threshold has been given yet.",
  },
  Around: { input: AroundInput, does: "A threshold: a number found in the specification or declared with `around`." },
  DecideNumbers: {
    output: record({ limits: list("number"), thresholds: list("number") }),
    does:
      "The answer. The limits: the smallest and then the largest value, those that exist. The thresholds: for each threshold " +
      "(taking a threshold given twice once), the threshold itself, or, for an input that takes integers only, one less, itself " +
      "and one more. Both keep only values the input takes (an integer if it takes integers only, within its smallest and largest " +
      "value), each once, in the order first found.",
  },
  BeginAmong: {
    input: BeginAmongInput,
    does: "An input is to be picked from what the component remembers: at the position `pick`, or not at all when there is none. No remembered value has been given yet.",
  },
  Item: { input: ItemInput, does: "A remembered value, and whether it can be used (it is not null and fits the input's type)." },
  DecideAmong: {
    output: optional("integer"),
    does:
      "The answer: the position (among all the values given, from 0) of the value picked, or null. Among the values that can be " +
      "used, the one at `pick` modulo their number is picked; none is picked when there is no `pick` or no value can be used.",
  },
});

export const InputCandidates = service({
  description: "Decides which values the generator of command inputs mixes in, and which remembered value an input is picked from.",
  uses: [Data, Command],
});
