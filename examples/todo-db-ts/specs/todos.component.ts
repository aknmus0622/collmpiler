import { answer, does, external, service, value } from "@clp/core";
import { Store } from "./store.component.ts";
import type { Id } from "@clp/core";

export type TodoId = Id<"the identifier of a to-do item">;
export type Todo = { id: TodoId; title: string; done: boolean };

export const Ids = external("The source of identifiers for new items. It can be unavailable.", {
  queries: { NewId: (): TodoId => answer({ fresh: true, mayFail: true }) },
});

// The list, written by a person: what each command takes and answers is fixed here; what it does is prose, derived by
// `clp interpret` into todos.interpretation.ts.
export const Todos = service(`A to-do list, kept in ${Store}: it survives a restart (after it, it has the same items, in the same order, each open or done as before). Items are added, completed, removed and listed. Each item has an identifier given by the list, a title, and whether it is done.`, {

  commands: {
    Add(title: string): { result: "created" | "invalid" | "unavailable"; todo: Todo | null } {
      return does.add(
        "A title that is empty or made only of whitespace, or that has more than 100 characters (a title of exactly 100 is fine), " +
          "is refused as invalid, with no item. Otherwise a new item with a fresh identifier and the given title, stored exactly as given " +
          "(not trimmed), goes after the others, and the answer is created, with the item (not done). When no identifier can be had " +
          "because the source of identifiers is unavailable, a title that is not invalid is refused as unavailable, with no item.",
      );
    },
    Complete(id: TodoId): "completed" | "not-found" | "already-done" {
      return does.complete("An open item becomes done, and the answer is completed. An item that is already done stays done, and the answer is already-done. An unknown identifier is not found, and nothing changes.");
    },
    Remove(id: TodoId): "removed" | "not-found" {
      return does.remove("The item is removed, and the answer is removed. An unknown identifier is not found, and nothing changes.");
    },
  },

  queries: {
    List(only: "all" | "open" | "done"): Todo[] {
      return value.listed("The items in the order they were added: all of them, only the open ones, or only the done ones, as asked.");
    },
  },
});
