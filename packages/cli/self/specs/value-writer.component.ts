import { calculations, commands, conditions, input, list, oneOf, otherwise, record, service, types, value } from "@clp/core";
import { Decision, ReferenceFormIf } from "./value-writer.decisions.ts";

export const Type = types({
  // A value of a specification: a constant (any value as it was written, null included), a reference to something
  // the specification declares by name, a reference to a column of a decision table, or a reference to the state
  // before the command (the states it lists).
  Value: oneOf({
    constant: value(),
    reference: record({ target: ["input", "data", "query", "calculation"], name: "string" }),
    column: record({ table: "string", column: "string" }),
    was: list("string"),
  }),
  // What is written into the IR: the constant as it is, a reference as one text, or the states as they were listed
  Written: oneOf({ constant: value(), reference: "string", was: list("string") }),
});

export const If = conditions({
  valueIsConstant: "The value is a constant (whatever it is, null included)",
  valueIsReference: "The value is a reference by name, or a reference to a column of a decision table",
});

export const Calc = calculations({
  referenceText: {
    description:
      "The prefix the reference form gives, followed by what is referred to: for a reference by name, the name; " +
      "for a column of a decision table, the table, a dot, and the column. Nothing else is added and nothing is trimmed.",
    output: "string",
  },
});

export const WriteInput = input({ value: Type.Value });

export const Command = commands({
  Write: {
    description: "One value of a specification is written into the IR, and the answer is what is written.",
    input: WriteInput,
    output: Type.Written,
    cases: [
      If.valueIsConstant.then({ responds: { constant: WriteInput.value.constant } }),
      If.valueIsReference.then({ responds: { reference: Calc.referenceText } }),
      // A reference to the state before the command: the states, in the order they were listed
      otherwise({ responds: { was: WriteInput.value.was } }),
    ],
  },
});

// How the values of a specification are written into the IR (`serialize` in packages/cli/src/extract.ts),
// written as a spec. The caller hands over one value at a time and puts the answer into place.
export const ValueWriter = service({
  description:
    "Writes the values of a specification into its intermediate representation, one value at a time. " +
    "A constant is written as it is. A reference is written as one text. A reference to the state before a " +
    "command is written as the states it lists.",
  uses: [Decision, ReferenceFormIf, If, Calc, Command],
});
