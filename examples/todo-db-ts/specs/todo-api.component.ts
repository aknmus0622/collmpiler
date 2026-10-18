import { among, commands, input, integer, list, optional, parts, record, service } from "@clp/core";
import { Part as ListPart, Todos, Type } from "./todos.component.ts";

// The HTTP API of the to-do list, as a component that contains the list. The status codes are part of the spec,
// so they are verified. The entry point that serves these routes is written by an agent, from the list's
// production code (which it uses as it is) and this spec.
export const Part = parts({ todos: Todos });

const Status = integer({ min: 200, max: 599 });

export const PostTodosInput = input({ body: record({ title: "string" }) });
export const CompleteTodoInput = input({ id: among(ListPart.items) });
export const DeleteTodoInput = input({ id: among(ListPart.items) });
export const GetTodosInput = input({ only: ["all", "open", "done"] });

export const Command = commands({
  PostTodos: {
    route: "POST /todos",
    input: PostTodosInput,
    output: record({ status: Status, body: optional(Type.Todo) }),
    does: "The title in the body is added to the list. Created: 201, with the new item. Invalid: 422, with no body. Unavailable: 503, with no body.",
  },
  CompleteTodo: {
    route: "POST /todos/:id/complete",
    input: CompleteTodoInput,
    output: record({ status: Status }),
    does: "The item is completed in the list. Completed: 200. Not found: 404. Already done: 409.",
  },
  DeleteTodo: {
    route: "DELETE /todos/:id",
    input: DeleteTodoInput,
    output: record({ status: Status }),
    does: "The item is removed from the list. Removed: 204. Not found: 404.",
  },
  GetTodos: {
    route: "GET /todos",
    input: GetTodosInput,
    output: record({ status: Status, body: list(Type.Todo) }),
    does: "The list's items, filtered as asked, are the body, with 200.",
  },
});

export const TodoApi = service({
  description: "The HTTP API of the to-do list. Each request is passed to the list, and the list's answer becomes the response.",
  uses: [Part, Command],
});
