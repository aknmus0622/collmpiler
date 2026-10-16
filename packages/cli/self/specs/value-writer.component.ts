import { calculations, commands, effects, input, service, states } from "@clp/core";
import { Decision, ReferenceFormIf } from "./value-writer.decisions.ts";
export const State = states(["READY"]);

export const Effect = effects({
  WriteConstant: {
    description: "A constant, as it was given.",
    input: input({ kind: ["string", "number", "boolean"], text: "string", number: "number", flag: "boolean" }),
  },
  WriteReference: { description: "A reference, as one text.", input: input({ text: "string" }) },
  WriteWasState: { description: "One state of a reference to the state before the command.", input: input({ state: "string" }) },
});

export const Calc = calculations({
  referenceText: {
    description:
      "The prefix the reference form gives, followed by what is referred to: the name, or, for a column of a " +
      "decision table, the table, a dot, and the column. Nothing else is added and nothing is trimmed.",
    output: "string",
  },
});

export const ConstantInput = input({ kind: ["string", "number", "boolean"], text: "string", number: "number", flag: "boolean" });

export const ReferenceInput = input({ target: ["input", "data", "query", "calculation", "decision"], name: "string", table: "string", column: "string" });

export const WasStateInput = input({ state: "string" });

export const Command = commands({
  Constant: {
    description:
      "A constant written in the specification. `kind` says what it is; `text` holds a string, `number` a number, " +
      "`flag` a boolean. It is written as a constant with exactly the kind, text, number and flag it was given.",
    input: ConstantInput,
  },

  Reference: {
    description:
      "A reference to something the specification declares. `target` says what kind of thing. `name` is the " +
      "thing's name; for a column of a decision table, `table` and `column` name it instead. " +
      "It is written as a reference whose text is the reference text.",
    input: ReferenceInput,
  },

  WasState: {
    description: "One of the states listed by a reference to the state before the command. It is written as that state.",
    input: WasStateInput,
  },
});

// How the values of a specification are written into the IR (`serialize` in packages/cli/src/extract.ts),
// written as a spec. A value is a constant or a reference; the IR holds a constant as it is and a reference
// as a short text.
//
// This component assembles output. Its effects carry only flat values, so it does not return a piece of JSON:
// the caller hands over one value at a time and puts what is written into place.
export const ValueWriter = service({
  description:
    "Writes the values of a specification into its intermediate representation, one value at a time. " +
    "A constant is written as it is. A reference is written as one text. A reference to the state before a " +
    "command lists states; they are handed over, and written, one at a time.",
  init: State.READY,
  uses: [State, Effect, Decision, ReferenceFormIf, Calc, Command],
});
