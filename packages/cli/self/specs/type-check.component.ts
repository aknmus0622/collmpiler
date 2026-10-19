import { among, commands, data, effects, input, integer, list, number, record, service } from "@clp/core";

// Checks of what a specification declares, on their own (packages/cli/src/extract.ts and loader.ts): a type that admits no
// value, a decision-table column whose values are of different kinds, a promise on a query that cannot keep it, a failure
// condition on a query that cannot fail, and names that collide. The walk over the specification is not this component's
// job: it is given one fact at a time. It reports what is wrong; the wording belongs to the framework.
export const Data = data({
  boundedBelow: { type: "boolean", initially: false, description: "Whether the number type last given has a minimum." },
  lowest: { type: "number", initially: 0, description: "Its minimum." },
  boundedAbove: { type: "boolean", initially: false, description: "Whether the number type last given has a maximum." },
  highest: { type: "number", initially: 0, description: "Its maximum." },
  kinds: { type: list("string"), initially: [], description: "The kinds of the values seen so far in the column being checked (null not counted), each once." },
  claims: { type: list(record({ name: "string", owner: "string" })), initially: [], description: "The names claimed so far, each with what claimed it." },
});

export const Effect = effects({
  Report: {
    description: "What was just given is wrong, for this reason. `owner` is what had already claimed the name (only for name-collision; empty otherwise).",
    input: input({
      code: [
        "empty-enum", "empty-one-of", "min-above-max", "around-outside", "mixed-column", "promise-kind", "promise-input",
        "failure-unknown", "failure-not-may-fail", "failure-not-asked", "name-collision",
      ],
      owner: "string",
    }),
  },
});

export const TypeInput = input({ kind: ["enum", "one-of", "number", "other"], members: integer({ min: 0, max: 1000 }), hasMin: "boolean", min: number(), hasMax: "boolean", max: number() });
export const AroundInput = input({ value: number() });
export const CellInput = input({ kind: ["number", "string", "boolean", "null"] });
export const PromiseInput = input({ promise: ["fresh", "increasing"], output: ["structured", "enum", "boolean", "string", "integer", "number"], takesInput: "boolean" });
export const FailureInput = input({ declared: "boolean", mayFail: "boolean", asked: "boolean", takesInput: "boolean" });
// A claimed name is usually one claimed before (that is when names collide)
export const ClaimInput = input({ name: among(Data.claims, "name"), owner: ["data", "queries", "asks", "parts", "input"], shared: "boolean" });

export const Command = commands({
  Type: {
    input: TypeInput,
    does:
      "A type, on its own (types inside it are given separately). An enumeration with no members is reported as empty-enum, and a " +
      "oneOf with no variants as empty-one-of. A number type with both a minimum and a maximum, the minimum above the maximum, is " +
      "reported as min-above-max. Every type replaces the minimum and maximum remembered for the thresholds that follow: those of a " +
      "number type (if any), none for any other type.",
  },
  Around: {
    input: AroundInput,
    does: "A threshold (around) of the number type just given. One below its minimum or above its maximum is reported as around-outside.",
  },
  BeginColumn: { does: "A column of a decision table is checked next: no value has been seen in it yet." },
  Cell: { input: CellInput, does: "One value of the column, by kind. A null value (the row does not use the column) is not counted." },
  EndColumn: {
    does: "The column is over. If the values seen since the last BeginColumn are of more than one kind, it is reported as mixed-column. What was seen is kept until the next BeginColumn.",
  },
  Promise: {
    input: PromiseInput,
    does:
      "A query that declares a promise. If the kind of its answer cannot keep it (a structured value, an enumeration or a boolean " +
      "never can; increasing cannot be kept by a string, nor fresh by a number; an integer can keep both), it is reported as promise-kind. Then, independently, " +
      "a query that takes an input is reported as promise-input.",
  },
  Failure: {
    input: FailureInput,
    does:
      "A condition that a query failed, with what is known of the query it names. If no such query is declared (neither asked by " +
      "that name nor declared), it is reported as failure-unknown; otherwise, if the query cannot fail (no mayFail), as " +
      "failure-not-may-fail; otherwise, if the query takes an input and was not asked by that name, as failure-not-asked. At most " +
      "one is reported.",
  },
  BeginClaims: { does: "The names of a specification are checked next. Only the reserved name `status` is claimed so far (by reserved)." },
  Claim: {
    input: ClaimInput,
    does:
      "A name is claimed, by data, a query without input, an asked answer, a part, or a command input. If it is already claimed, " +
      "it is reported as name-collision, with what had claimed it, and stays claimed by that, unless both claims are shared ones " +
      "by the same kind of owner (asked answers of different commands, inputs of different commands), which may share a name. " +
      "Otherwise it is now claimed by this owner.",
  },
});

export const TypeCheck = service({
  description: "Checks, one fact at a time, what a specification declares: types, decision-table columns, promises, failure conditions and names.",
  uses: [Data, Effect, Command],
});
