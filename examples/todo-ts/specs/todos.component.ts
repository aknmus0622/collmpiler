import { among, by, component, description, does, fresh, input, list, many, optional, output, parts, queries, record } from "@clp/core";
import { TodoItem } from "./todo-item.component.ts";
import { Limits } from "./todos.decisions.ts";

// The to-do list behind the HTTP API of this example. It contains many to-do items (todo-item.component.ts), one
// per identifier; each item decides its own life. The boundary (what each command takes and answers) is pinned
// down as structure; what happens is prose, and is derived by `clp interpret`.
export const Todo = record({ id: "string", title: "string", done: "boolean" });
export const Part = parts({ items: many(TodoItem, by("id")) });

export const Query = queries({ newId: component(description("A fresh identifier for a new item."), output("string"), fresh()) });

export const AddInput = input({ title: "string" });

export const CompleteInput = input({ id: among(Part.items) });

export const RemoveInput = input({ id: among(Part.items) });

export const ListInput = input({ only: ["all", "open", "done"] });

export const Todos = component({
  description:
    "A to-do list behind an HTTP API. Items are added, completed, removed and listed. " +
    "Each item is a to-do item of its own, with an identifier given by the list and a title; whether it is done is the item's state.",
  parts: Part,
  queries: Query,
  decisions: { limits: Limits },
  commands: {
    Add: component(
      AddInput,
      output(record({ result: ["created", "invalid"], todo: optional(Todo) })),
      does(
        "A title that is empty or made only of whitespace, or that has more characters than the limit (a title of exactly the limit is fine), " +
          "is refused as invalid, with no item. " +
          "Otherwise a new item with a fresh identifier and the given title, stored exactly as given (not trimmed), is created after the others, " +
          "and the answer is created, with the item (not done).",
      ),
    ),
    Complete: component(
      CompleteInput,
      output(["completed", "not-found", "already-done"]),
      does("The item with the identifier is asked to complete, and the answer is what the item answered. An unknown identifier is not found, and nothing changes."),
    ),
    Remove: component(
      RemoveInput,
      output(["removed", "not-found"]),
      does("The item is removed. An unknown identifier is refused as not found, and nothing changes."),
    ),
    List: component(
      ListInput,
      output(list(Todo)),
      does("The answer is the items in the order they were added, filtered as asked, each with its identifier, its title and whether it is done. Nothing changes."),
    ),
  },
});
