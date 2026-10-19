import { commands, data, effects, input, integer, queries, service } from "@clp/core";

// The leaf check (packages/core/index.ts `leafCheck`, DSL.md §16.7): after Layer 1 and the interpretation are merged, every
// path of the specification must end in a leaf (a type, a meaning, an outcome, or `nothing: true`). This component is given
// the facts of the merged specification one at a time, asks the kinds (`KINDS`) what is required, and reports what is left
// unwritten. The walk, and the wording of the reports, belong to the framework.
export const Data = data({
  branched: { type: "boolean", description: "Whether the command being judged has cases other than otherwise." },
  outcomeKind: { type: ["case", "command"], description: "Whose outcomes count in the command being judged: a case's when it has branched, a command's otherwise." },
  caseDescribed: { type: "boolean", description: "Whether prose says something happens in the case being judged." },
  outcomeWritten: { type: "boolean", description: "Whether an outcome field has been written in the case being judged." },
  nothingWritten: { type: "boolean", description: "Whether `nothing` has been written in the case being judged." },
  otherWritten: { type: "boolean", description: "Whether a field other than `nothing` has been written in the case being judged." },
});

export const Query = queries({
  required: {
    description: "Whether a field is required on a node of this kind (`service`, `datum`, `query`, `calculation`, ...).",
    input: input({ kind: "string", field: "string" }),
    output: "boolean",
  },
  nonEmpty: { description: "Whether a group of this kind, given only as prose in Layer 1, must end up with entries.", input: input({ group: "string" }), output: "boolean" },
  requiredCase: { description: "Whether a command that has cases must have the case with this name.", input: input({ name: "string" }), output: "boolean" },
  outcome: {
    description: "Whether a field is one of the outcomes of a node of this kind (`command` or `case`): one of them must be written where prose says something happens.",
    input: input({ kind: "string", field: "string" }),
    output: "boolean",
  },
});

export const Effect = effects({
  Report: {
    description: "What was just given is left unwritten, for this reason.",
    input: input({
      code: ["states-missing", "init-missing", "commands-missing", "prose-empty", "field-missing", "otherwise-missing", "no-outcome", "nothing-and-others", "no-meaning"],
    }),
  },
});

export const BeginInput = input({ states: ["given", "missing", "stateless"], init: "boolean", commands: integer({ min: 0, max: 1000 }) });
export const ProseInput = input({ group: ["states", "data", "queries", "effects", "calculations", "commands"], entries: integer({ min: 0, max: 1000 }) });
export const FieldInput = input({ kind: "string", field: "string", present: "boolean" });
export const CommandInput = input({ cases: integer({ min: 0, max: 1000 }), hasOtherwise: "boolean" });
export const CaseInput = input({ described: "boolean" });
export const WrittenInput = input({ field: "string" });
export const SentenceInput = input({ composite: "boolean", hasMeaning: "boolean" });
export const MeaningInput = input({ hasMeaning: "boolean" });

export const Command = commands({
  Begin: {
    input: BeginInput,
    does:
      "The merged specification as a whole. Each of the three is judged on its own (more than one can be reported). If it has no states although Layer 1 speaks of them (states missing), that is " +
      "reported as states-missing. If the service requires an initial state, the specification is not stateless, and there is " +
      "none, init-missing. If the service requires commands and there are none, commands-missing.",
  },
  ProseGroup: {
    input: ProseInput,
    does:
      "A group Layer 1 gave only as prose, with the number of entries it ended up with. States and commands are judged " +
      "elsewhere and never reported here. Any other group that must end up with entries and has none is reported as prose-empty.",
  },
  EntryField: {
    input: FieldInput,
    does: "A field of an entry of the vocabulary (an entry of the given kind), and whether it is written. A required field that is not written is reported as field-missing.",
  },
  BeginCommand: {
    input: CommandInput,
    does:
      "A command, with how many cases it has and whether otherwise is one of them. It has branched when it has a case other than " +
      "otherwise. A branched command without otherwise, when otherwise is a required case, is reported as otherwise-missing.",
  },
  BeginCase: {
    input: CaseInput,
    does:
      "One case of the command (the whole command when it has not branched) is judged next: whether prose says something happens " +
      "in it. No field has been written in it yet. A case always follows the BeginCommand of its command.",
  },
  Written: {
    input: WrittenInput,
    does:
      "One field written in the case. Whether it is an outcome is asked, of the kind whose outcomes count (outcomeKind). Whether it is `nothing` or another field (any other name, the empty one included) is taken into account.",
  },
  EndCase: {
    does:
      "All the fields of the case have been given. If prose says something happens and no written field is an outcome, it is " +
      "reported as no-outcome. Then, independently, if `nothing` is written together with any other field, it is reported as " +
      "nothing-and-others.",
  },
  Sentence: {
    input: SentenceInput,
    does: "A condition sentence the specification uses. A sentence that is not a combination of others and has no meaning is reported as no-meaning.",
  },
  Calculation: { input: MeaningInput, does: "A calculation. Without a meaning, it is reported as no-meaning." },
  Invariant: { input: MeaningInput, does: "An invariant. Without a meaning, it is reported as no-meaning." },
});

export const LeafCheck = service({
  description: "Checks that every path of a merged specification ends in a leaf, and reports what is left unwritten.",
  uses: [Data, Query, Effect, Command],
});
