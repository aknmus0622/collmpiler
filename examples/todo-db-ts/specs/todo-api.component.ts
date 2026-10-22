import { does, service, value } from "@clp/core";
import type { Int } from "@clp/core";
import { Todos } from "./todos.component.ts";
import type { Todo, TodoId } from "./todos.component.ts";

// The HTTP API of the list. Each command reaches the system as the HTTP request in `routes`; the status codes are
// part of the spec, so they are verified. The API itself is production code written by an agent.
export const TodoApi = service(`The HTTP API of the to-do list. Each request is passed to the list (${Todos}), and the list's answer becomes the response.`, {
  commands: {
    PostTodos(body: { title: string }): { status: Int; body: Todo | null } {
      return does.post("The title in the body is added to the list. Created: 201, with the new item. Invalid: 422, with no body. The source of identifiers is unavailable: 503, with no body.");
    },
    CompleteTodo(id: TodoId): { status: Int } {
      return does.complete("The item is completed in the list. Completed: 200. Not found: 404. Already done: 409.");
    },
    DeleteTodo(id: TodoId): { status: Int } {
      return does.delete("The item is removed from the list. Removed: 204. Not found: 404.");
    },
  },
  queries: {
    GetTodos(only: "all" | "open" | "done"): { status: Int; body: Todo[] } {
      return value.get("The list's items, filtered as asked, are the body, with 200.");
    },
  },
  routes: { PostTodos: "POST /todos", CompleteTodo: "POST /todos/:id/complete", DeleteTodo: "DELETE /todos/:id", GetTodos: "GET /todos" },
});
