/**
 * Pure decisions of the HTTP API: how each answer of the to-do list becomes the response to a
 * request. None of these functions talk to dependencies or mutate their arguments.
 */

import type { AddResult, CompleteResult, RemoveResult, TodoItem } from "./types.ts";

/** HTTP status codes the API answers with. */
export const STATUS = {
  ok: 200,
  created: 201,
  noContent: 204,
  notFound: 404,
  conflict: 409,
  unprocessable: 422,
} as const;

/**
 * Response to `POST /todos` (specification: output of the `PostTodos` command).
 *
 * - `status`: the HTTP status code of the response.
 * - `body`: the item that was created, sent as the JSON body; `null` when the response has no body.
 */
export interface PostTodosResponse {
  readonly status: number;
  readonly body: TodoItem | null;
}

/**
 * Response to `GET /todos` (specification: output of the `GetTodos` command).
 *
 * - `status`: the HTTP status code of the response.
 * - `body`: the listed items, in order, sent as the JSON body.
 */
export interface GetTodosResponse {
  readonly status: number;
  readonly body: TodoItem[];
}

/**
 * Response to `POST /todos/:id/complete` (specification: output of the `CompleteTodo` command).
 *
 * - `status`: the HTTP status code of the response. The response has no body.
 */
export interface CompleteTodoResponse {
  readonly status: number;
}

/**
 * Response to `DELETE /todos/:id` (specification: output of the `DeleteTodo` command).
 *
 * - `status`: the HTTP status code of the response. The response has no body.
 */
export interface DeleteTodoResponse {
  readonly status: number;
}

/**
 * Turns the list's answer to an add (specification: output of the part command `todos.Add`)
 * into the response to `POST /todos`.
 *
 * @param result what {@link TodoList.add} answered.
 */
export function postTodosResponse(result: AddResult): PostTodosResponse {
  if (result.result === "invalid") {
    return { status: STATUS.unprocessable, body: null };
  }
  return { status: STATUS.created, body: { ...result.todo } };
}

/**
 * Turns the list's answer to a listing (specification: output of the part command `todos.List`)
 * into the response to `GET /todos`.
 *
 * @param items what {@link TodoList.list} answered.
 */
export function getTodosResponse(items: readonly TodoItem[]): GetTodosResponse {
  return { status: STATUS.ok, body: items.map((item) => ({ ...item })) };
}

/**
 * Turns the list's answer to a completion (specification: output of the part command
 * `todos.Complete`) into the response to `POST /todos/:id/complete`.
 *
 * @param result what {@link TodoList.complete} answered.
 */
export function completeTodoResponse(result: CompleteResult): CompleteTodoResponse {
  switch (result) {
    case "not-found":
      return { status: STATUS.notFound };
    case "already-done":
      return { status: STATUS.conflict };
    case "completed":
      return { status: STATUS.ok };
  }
}

/**
 * Turns the list's answer to a removal (specification: output of the part command `todos.Remove`)
 * into the response to `DELETE /todos/:id`.
 *
 * @param result what {@link TodoList.remove} answered.
 */
export function deleteTodoResponse(result: RemoveResult): DeleteTodoResponse {
  switch (result) {
    case "not-found":
      return { status: STATUS.notFound };
    case "removed":
      return { status: STATUS.noContent };
  }
}
