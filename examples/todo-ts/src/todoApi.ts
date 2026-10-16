/**
 * The HTTP API of the to-do list, independent of the transport: one method per route. Each method
 * passes the request to the list it owns and answers with the response to send.
 *
 * The component has no states of its own (specification state `READY`): every request can be
 * served at any time. {@link TodoHttpServer} serves these methods over HTTP.
 */

import {
  completeTodoResponse,
  deleteTodoResponse,
  getTodosResponse,
  postTodosResponse,
} from "./apiResponses.ts";
import type {
  CompleteTodoResponse,
  DeleteTodoResponse,
  GetTodosResponse,
  PostTodosResponse,
} from "./apiResponses.ts";
import type { IdSource } from "./idSource.ts";
import { TodoList } from "./todoList.ts";
import type { ListFilter } from "./types.ts";

/**
 * JSON body of `POST /todos` (specification: the `body` input field of `PostTodos`).
 *
 * - `title`: the title for the new item.
 */
export interface NewTodoBody {
  readonly title: string;
}

export class TodoApi {
  private readonly todos: TodoList;

  /**
   * Creates the API with a new, empty to-do list (specification part `todos`).
   *
   * @param ids where identifiers for new items come from (specification: the part's `newId`
   *   query); handed on to the list, which asks it once per item it creates.
   */
  constructor(ids: IdSource) {
    this.todos = new TodoList(ids);
  }

  /**
   * Serves `POST /todos` (specification: command `PostTodos`): asks the list to add an item with
   * the title from the body ({@link TodoList.add}).
   *
   * @param body the parsed JSON request body.
   * @returns the status and, when there is one, the created item as body.
   */
  postTodos(body: NewTodoBody): PostTodosResponse {
    return postTodosResponse(this.todos.add(body.title));
  }

  /**
   * Serves `GET /todos?only=<filter>` (specification: command `GetTodos`, input field `only`):
   * asks the list for its items ({@link TodoList.list}).
   *
   * @param only which items to list; see {@link ListFilter}.
   * @returns the status and the listed items as body.
   */
  getTodos(only: ListFilter): GetTodosResponse {
    return getTodosResponse(this.todos.list(only));
  }

  /**
   * Serves `POST /todos/:id/complete` (specification: command `CompleteTodo`, input field `id`):
   * asks the list to complete the item ({@link TodoList.complete}).
   *
   * @param id the identifier taken from the path.
   * @returns the status; the response has no body.
   */
  completeTodo(id: string): CompleteTodoResponse {
    return completeTodoResponse(this.todos.complete(id));
  }

  /**
   * Serves `DELETE /todos/:id` (specification: command `DeleteTodo`, input field `id`):
   * asks the list to remove the item ({@link TodoList.remove}).
   *
   * @param id the identifier taken from the path.
   * @returns the status; the response has no body.
   */
  deleteTodo(id: string): DeleteTodoResponse {
    return deleteTodoResponse(this.todos.remove(id));
  }
}
