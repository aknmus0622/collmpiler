import { commands, input, integer, list, record, service } from "@clp/core";

// What the texts given to agents are made of (packages/cli/src/generate.ts and request.ts): how a type is written in the
// adapter contract, which notes a query carries, which sections the contract and a request include. The fixed prose of
// those texts is not this component's: it decides which pieces appear, in which order, with which values. It is asked
// one question at a time and answers it.
const Count = integer({ min: 0, max: 100 });

export const Entry = record({ name: "string", text: "string", optional: "boolean" });
export const TypeInput = input({
  kind: ["value", "one-of", "optional", "list", "record", "enum", "string", "number", "primitive"],
  name: "string",
  inner: "string",
  entries: list(Entry),
  members: list("string"),
});
export const NotesInput = input({ promise: ["none", "fresh", "increasing"], mayFail: "boolean" });
export const ContractInput = input({ outputs: Count, routes: Count, parts: Count, restarts: "boolean" });
export const RequestInput = input({ phase: ["design", "wiring", "implementation"], attempt: integer({ min: 1, max: 10 }), hasFeedback: "boolean", others: Count, partFiles: Count });

export const Command = commands({
  TypeText: {
    input: TypeInput,
    output: "string",
    does:
      "How a type is written in TypeScript in the contract. The texts of the types inside it are given already written (`inner` " +
      "for an optional value or a list, `entries` for the fields of a record or the variants of a oneOf, `members` for the members " +
      "of an enumeration, each already written as a literal). " +
      "Any value: `null | boolean | number | string | unknown[] | { [field: string]: unknown }`. " +
      "A oneOf: each variant as `{ name: text }`, the variants in the order of their names, joined by ` | `; `never` when there is none. " +
      "An optional value: the inner text followed by ` | null`. " +
      "A list: the inner text followed by `[]`, in parentheses first when the inner text contains a space or a `|` and does not start " +
      "with `{`. " +
      "A record: `{ ` and the fields in the order of their names, each as `name: text` (followed by ` | null` when it is optional), " +
      "joined by `; `, and ` }`; `{}` when there is no field. " +
      "An enumeration: the members joined by ` | `; `never` when there is none. " +
      "A string: `string`. A number (integer or not): `number`. Any other primitive: its name.",
  },
  QueryNotes: {
    input: NotesInput,
    output: list(["fresh", "increasing", "may-fail"]),
    does: "The notes a query carries in the contract, in this order: its promise (fresh or increasing), if any, then may-fail if it can fail.",
  },
  ContractSections: {
    input: ContractInput,
    output: record({ commandOutput: "boolean", routes: "boolean", partsNote: "boolean", restarts: "boolean" }),
    does:
      "Which sections the contract includes: what commands answer with when some command does (outputs above zero), the routes " +
      "when some command has one, the note about the dependencies of contained components when there are parts, and the storage " +
      "and restart when the system keeps something across a restart.",
  },
  RequestSections: {
    input: RequestInput,
    output: record({ feedback: ["none", "current-code", "previous-attempt"], others: "boolean", contained: "boolean" }),
    does:
      "Which sections a request to an agent includes. Feedback: none without any; on attempt 1 it is about the current code (graded " +
      "before any session); on a later attempt, about the previous attempt. The other components of the same system, and the " +
      "components this one contains, are listed only outside the wiring phase, and only when there are some.",
  },
});

export const TextPlan = service({
  description: "Decides what the texts given to agents are made of: how types are written in the contract, which notes and sections appear.",
  uses: [Command],
});
