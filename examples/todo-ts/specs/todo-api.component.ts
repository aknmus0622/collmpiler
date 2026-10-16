import { among, component, does, input, integer, list, optional, output, parts, record, route } from "@clp/core";
import { Part as ListPart, Todo, Todos } from "./todos.component.ts";

// The HTTP API of the to-do list, as a component that contains the list. The status codes are part of the spec,
// so they are verified. The entry point that serves these routes is written by an agent, from the list's
// production code (which it uses as it is) and this spec.
export const Part = parts({ todos: Todos });

const Status = integer({ min: 200, max: 599 });

export const PostTodosInput = input({ body: record({ title: "string" }) });
export const CompleteTodoInput = input({ id: among(ListPart.items) });
export const DeleteTodoInput = input({ id: among(ListPart.items) });
export const GetTodosInput = input({ only: ["all", "open", "done"] });

export const TodoApi = component({
  description: "The HTTP API of the to-do list. Each request is passed to the list, and the list's answer becomes the response.",
  parts: Part,
  commands: {
    PostTodos: component(
      route("POST /todos"),
      PostTodosInput,
      output(record({ status: Status, body: optional(Todo) })),
      does("The title in the body is added to the list. Created: 201, with the new item. Invalid: 422, with no body."),
    ),
    CompleteTodo: component(
      route("POST /todos/:id/complete"),
      CompleteTodoInput,
      output(record({ status: Status })),
      does("The item is completed in the list. Completed: 200. Not found: 404. Already done: 409."),
    ),
    DeleteTodo: component(
      route("DELETE /todos/:id"),
      DeleteTodoInput,
      output(record({ status: Status })),
      does("The item is removed from the list. Removed: 204. Not found: 404."),
    ),
    GetTodos: component(
      route("GET /todos"),
      GetTodosInput,
      output(record({ status: Status, body: list(Todo) })),
      does("The list's items, filtered as asked, are the body, with 200."),
    ),
  },
});
