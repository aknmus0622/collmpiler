/**
 * Pure decisions of the HTTP API: how each answer of the list becomes a response.
 * No state, no dependencies: every function answers only from its arguments and never
 * modifies them.
 */
import type { AddResult, CompleteResult, RemoveResult, Todo } from "./todo.ts";

/** A response that has a status code and no body. */
export interface StatusResponse {
  /** HTTP status code. */
  readonly status: number;
}

/**
 * Response to creating an item (specification output of command `PostTodos`).
 * `body` is the created item, or `null` when there is nothing to send back (then the HTTP
 * response has no body).
 */
export interface PostTodosResponse {
  /** HTTP status code. */
  readonly status: number;
  /** The item to send as the JSON body, or `null` for no body. */
  readonly body: Todo | null;
}

/**
 * Response to listing items (specification output of query `GetTodos`, calculation `get`).
 */
export interface GetTodosResponse {
  /** HTTP status code. */
  readonly status: number;
  /** The items to send as the JSON body, in the order the list answered them. */
  readonly body: Todo[];
}

/**
 * The response to `POST /todos`, from the answer of `TodoList.add` (selects the
 * specification's `PostTodos` event).
 *
 * @param added what `TodoList.add` answered for the request's title.
 */
export function postTodosResponse(added: AddResult): PostTodosResponse {
  if (added.result === "created") return { status: 201, body: added.todo };
  return { status: 422, body: added.todo };
}

/**
 * The response to `POST /todos/:id/complete`, from the answer of `TodoList.complete`
 * (selects the specification's `CompleteTodo` event).
 *
 * @param outcome what `TodoList.complete` answered for the request's id.
 */
export function completeTodoResponse(outcome: CompleteResult): StatusResponse {
  if (outcome === "completed") return { status: 200 };
  if (outcome === "not-found") return { status: 404 };
  return { status: 409 };
}

/**
 * The response to `DELETE /todos/:id`, from the answer of `TodoList.remove`
 * (selects the specification's `DeleteTodo` event).
 *
 * @param outcome what `TodoList.remove` answered for the request's id.
 */
export function deleteTodoResponse(outcome: RemoveResult): StatusResponse {
  if (outcome === "removed") return { status: 204 };
  return { status: 404 };
}

/**
 * The response to `GET /todos`, from the items `TodoList.list` answered
 * (specification calculation `get`).
 *
 * @param items what `TodoList.list` answered for the request's filter.
 */
export function getTodosResponse(items: readonly Todo[]): GetTodosResponse {
  return { status: 200, body: [...items] };
}
