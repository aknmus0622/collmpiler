import { commands, data, input, list, record, service, types, value } from "@clp/core";

// A store that keeps values by key, and keeps them across a restart. It knows nothing of what it keeps: the to-do
// list (todos.component.ts) keeps its items here. It is generic on purpose (any JSON value), so that the shape of
// an item is written once, in the list's spec. Where it keeps them (a database file) is not part of the spec.
export const Type = types({ Entry: record({ key: "string", value: value() }) });
export const Data = data({ entries: { type: list(Type.Entry), initially: [], description: "What is kept, in the order the keys were first put." } });

export const PutInput = input({ key: "string", value: value() });
export const DeleteInput = input({ key: "string" });

export const Command = commands({
  Put: {
    input: PutInput,
    does:
      "The value (any JSON value, null included) is kept under the key. A key that is already kept keeps its place and gets the new value; " +
      "a new key goes after the others. A key that was deleted is new when it is put again. Keys are compared exactly, as strings.",
  },
  Delete: {
    input: DeleteInput,
    output: ["deleted", "not-found"],
    does: "The key and its value are no longer kept, and the answer is deleted. A key that is not kept is not found, and nothing changes.",
  },
  Entries: { output: list(Type.Entry), does: "The answer is every key with its value, in the order the keys were first put. Nothing changes." },
});

export const Store = service({
  description: "Keeps JSON values by key. What it keeps survives a restart.",
  durable: true,
  uses: [Data, Command],
});
