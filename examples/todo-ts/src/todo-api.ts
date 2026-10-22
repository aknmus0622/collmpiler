/**
 * The to-do HTTP API's operations, independent of HTTP transport (specification component
 * `todo-api`). Each operation passes the request to the list and turns the list's answer into
 * a response. It remembers nothing of its own (specification state of `todo-api` is empty); all
 * state lives in the {@link TodoList} it is given.
 */
import type { TodoList } from "./todo-list.ts";
import type { TodoFilter, TodoId } from "./todo.ts";
import type { GetTodosResponse, PostTodosResponse, StatusResponse } from "./todo-api-responses.ts";
import {
  completeTodoResponse,
  deleteTodoResponse,
  getTodosResponse,
  postTodosResponse,
} from "./todo-api-responses.ts";

/** The JSON body of `POST /todos` (specification parameter `body` of `PostTodos`). */
export interface NewTodoBody {
  /** The title of the item to create, passed to the list exactly as received. */
  readonly title: string;
}

export class TodoApi {
  /** The list every request is passed to (specification contained component `todos`). */
  private readonly todos: TodoList;

  /**
   * @param todos the list this API serves; each command below calls exactly one of its
   *   methods, once.
   */
  constructor(todos: TodoList) {
    this.todos = todos;
  }

  /**
   * Creates an item (specification command `PostTodos`, route `POST /todos`).
   * Calls `todos.add(body.title)` once and answers the corresponding response.
   *
   * @param body the parsed JSON request body.
   */
  postTodos(body: NewTodoBody): PostTodosResponse {
    return postTodosResponse(this.todos.add(body.title));
  }

  /**
   * Completes an item (specification command `CompleteTodo`, route `POST /todos/:id/complete`).
   * Calls `todos.complete(id)` once and answers the corresponding response.
   *
   * @param id the `:id` path segment.
   */
  completeTodo(id: TodoId): StatusResponse {
    return completeTodoResponse(this.todos.complete(id));
  }

  /**
   * Removes an item (specification command `DeleteTodo`, route `DELETE /todos/:id`).
   * Calls `todos.remove(id)` once and answers the corresponding response.
   *
   * @param id the `:id` path segment.
   */
  deleteTodo(id: TodoId): StatusResponse {
    return deleteTodoResponse(this.todos.remove(id));
  }

  /**
   * Lists items (specification query `GetTodos`, route `GET /todos`). Changes nothing.
   * Calls `todos.list(only)` once and answers the corresponding response.
   *
   * @param only the `only` query-string parameter; see {@link TodoFilter}.
   */
  getTodos(only: TodoFilter): GetTodosResponse {
    return getTodosResponse(this.todos.list(only));
  }
}
