import { among, component, description, does, fresh, initially, input, list, optional, output, record } from "@clp/core";
import { Limits } from "./todos.decisions.ts";

// The to-do list behind the HTTP API of this example. The boundary (what each command takes and answers) is
// pinned down as structure; what happens is prose, and is derived by `clp interpret`.
// The HTTP server in server/ is written by a person: it maps requests to these commands and answers to responses.
export const Todo = record({ id: "string", title: "string", done: "boolean" });

export const Todos = component({
  description:
    "A to-do list behind an HTTP API. Items are added, completed, removed and listed. " +
    "Each item has an identifier given by the list, a title, and whether it is done.",
  data: { items: component(list(Todo), initially([])) },
  queries: { newId: component(description("A fresh identifier for a new item."), output("string"), fresh()) },
  decisions: { limits: Limits },
  commands: {
    Add: component(
      input({ title: "string" }),
      output(record({ result: ["created", "invalid"], todo: optional(Todo) })),
      does(
        "A title that is empty or made only of whitespace, or that has more characters than the limit (a title of exactly the limit is fine), " +
          "is refused as invalid, with no item. " +
          "Otherwise a new open item with a fresh identifier and the given title, stored exactly as given (not trimmed), is added at the end, " +
          "and the answer is created, with the item.",
      ),
    ),
    Complete: component(
      input({ id: among("items", "id") }),
      output(["completed", "not-found", "already-done"]),
      does("The item becomes done. An unknown identifier, or an item that is already done, is refused, and nothing changes."),
    ),
    Remove: component(
      input({ id: among("items", "id") }),
      output(["removed", "not-found"]),
      does("The item is removed. An unknown identifier is refused, and nothing changes."),
    ),
    List: component(
      input({ only: ["all", "open", "done"] }),
      output(list(Todo)),
      does("The answer is the items in the order they were added, filtered as asked. Nothing changes."),
    ),
  },
});
