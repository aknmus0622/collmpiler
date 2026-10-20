import { among, commands, data, input, list, service } from "@clp/core";

// Whether what the system showed after a command is what the specification expects (packages/cli/src/runtime.ts `check`):
// its state, the effects it performed in order, and, for a command that answers, its answer. Both observations are given
// as leaves: one string per value inside them, written `path|kind|text` (the path from the top: each key and array index written
// as JSON, joined by dots; the kind: null, boolean, number, string, array or object; the text: the value as JSON for a
// primitive, the length for an array, empty for an object). Two different leaves are never the same string. Flattening the
// values is not this component's job (packages/cli/src/observe.ts `leavesOf`).
//
// This is a grading component (SELF_HOSTING.md §10.3, R1). What it decides is a value of the oracle's run, so in use it must
// agree with Stage 0 (R4): a disagreement stops verification as an error of the framework.
export const Data = data({
  expected: { type: list("string"), initially: [], description: "The leaves of the expected observation given so far." },
  actual: { type: list("string"), initially: [], description: "The leaves of the actual observation given so far." },
  answerAbsent: { type: "boolean", initially: false, description: "Whether the command answers (the specification declares an output) but the system answered nothing." },
});

export const BeginInput = input({ answers: "boolean", answered: "boolean" });
export const LeafInput = input({ leaf: "string" });
// An actual leaf is usually one of the expected leaves (that is when two observations are equal)
export const ActualInput = input({ leaf: among(Data.expected) });

export const Command = commands({
  Begin: {
    input: BeginInput,
    does:
      "Two observations are compared next; no leaf has been given yet. Whether the command answers (declares an output), and " +
      "whether the system answered something, are remembered: a command that answers but answered nothing counts as answering null.",
  },
  Expected: { input: LeafInput, does: "A leaf of the expected observation." },
  Actual: { input: ActualInput, does: "A leaf of the actual observation." },
  Decide: {
    output: "boolean",
    does:
      "The answer is whether the two observations are equal: whether they have the same leaves (in any order of giving; a leaf " +
      "given twice counts once), where, if the command answers and the system answered nothing, the actual observation also has " +
      "the leaf `\"output\"|null|null`. Nothing is forgotten until the next Begin.",
  },
});

export const ObservationCompare = service({
  description: "Decides whether the observation of the system after a command equals the one the specification expects.",
  uses: [Data, Command],
});
