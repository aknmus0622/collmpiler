import { does, List, service, value } from "@clp/core";
import type { Json } from "@clp/core";

export type Entry = { key: string; value: Json };

// A generic store, written by a person. What it keeps survives a restart: the production code keeps it in storage.
export const Store = service("Keeps JSON values by key. What it keeps survives a restart.", {
  state: { entries: List<Entry>() },
  commands: {
    Put(key: string, data: Json) {
      does.put(
        "The value (any JSON value, null included) is kept under the key. A key that is already kept keeps its place and gets the new value; " +
          "a new key goes after the others. A key that was deleted is new when it is put again. Keys are compared exactly, as strings.",
      );
    },
    Delete(key: string): "deleted" | "not-found" {
      return does.delete("The key and its value are no longer kept, and the answer is deleted. A key that is not kept is not found, and nothing changes.");
    },
  },
  queries: {
    Entries(): Entry[] {
      return value.kept("Every key with its value, in the order the keys were first put.");
    },
  },
  durable: true,
});
