import { commands, data, input, integer, list, optional, service, string, value } from "@clp/core";

// How the stand-ins for a component's dependencies keep their promises during verification (packages/cli/src/promise.ts,
// used by `simulator` in runtime.ts): an answer drawn at random is turned into one that keeps the promise of the query
// (`increasing`: never less than before; `fresh`: never the same value twice), and a restart either keeps a component's
// state or starts it again. What was answered before is kept by the caller and given with each question; drawing the
// random values is not this component's job.
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): what it decides is a value of the oracle's run, so in use it
// must agree with Stage 0 (R4).
export const Data = data({
  freshDrawn: { type: value(), initially: null, description: "The value drawn for the fresh answer being decided (a number or a text)." },
  used: { type: list(value()), initially: [], description: "The values answered before by the query whose fresh answer is being decided, in the order given." },
});

export const IncreasingInput = input({
  drawn: integer({ min: -1000, max: 1000 }),
  previous: optional(integer({ min: -1000, max: 1000 })),
  delta: integer({ min: 0, max: 100 }),
  max: optional(integer({ min: -1000, max: 1000 })),
});
// Small ranges, so that the value drawn is often one answered before (that is when the promise matters)
export const FreshNumberInput = input({ drawn: integer({ min: 0, max: 4 }) });
export const UsedNumberInput = input({ value: integer({ min: 0, max: 4 }) });
const Texts = ["a", "b", "a#1", ""];
export const FreshTextInput = input({ drawn: string({ examples: Texts }) });
export const UsedTextInput = input({ value: string({ examples: Texts }) });
export const RestartInput = input({ durable: "boolean" });

export const Command = commands({
  Increasing: {
    input: IncreasingInput,
    output: "integer",
    does:
      "The answer of a query that promises never to answer less than before. If it has not answered before (`previous` is null), " +
      "the value drawn. Otherwise the previous answer plus the increment `delta`, but not more than `max` when a maximum is given.",
  },
  BeginFreshNumber: {
    input: FreshNumberInput,
    does: "The fresh answer of a query that answers numbers is decided next, for the number drawn. No value answered before has been given yet.",
  },
  BeginFreshText: {
    input: FreshTextInput,
    does: "The fresh answer of a query that answers texts is decided next, for the text drawn. No value answered before has been given yet.",
  },
  UsedNumber: { input: UsedNumberInput, does: "A number the query answered before." },
  UsedText: { input: UsedTextInput, does: "A text the query answered before." },
  Fresh: {
    output: value(),
    does:
      "The fresh answer: the value drawn, if it is not one of the values answered before (the same number, or the same text). " +
      "Otherwise, if it is a number, one more than the largest number answered before; if it is a text, the text drawn followed " +
      "by \"#\" and the number of values answered before (counting every value given, of either kind).",
  },
  Restart: {
    input: RestartInput,
    output: ["keep", "start-again"],
    does: "The system restarts. A component that is durable keeps its state and data; any other starts again.",
  },
});

export const PromiseKeeper = service({
  description: "Turns answers drawn at random into answers that keep a dependency's promises, and decides what survives a restart.",
  uses: [Data, Command],
});
