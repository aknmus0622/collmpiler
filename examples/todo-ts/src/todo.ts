/**
 * Shared value types of the to-do list.
 *
 * These are the plain data shapes that the list ({@link ../todo-list.ts}) takes and answers.
 * They are also intended for reuse by an HTTP layer in front of the list.
 */

/**
 * Identifier of a to-do item (specification sort `TodoId`).
 *
 * An opaque string handed out by an {@link IdSource}; compare it only for equality.
 */
export type TodoId = string;

/**
 * One to-do item, as stored by the list and as answered to callers
 * (specification record `{ done, id, title }`).
 */
export interface Todo {
  /** Identifier given to the item by the list when it was added. */
  readonly id: TodoId;
  /** The title exactly as it was supplied to `add`. */
  readonly title: string;
  /** `false` while the item is open, `true` once it has been completed. */
  readonly done: boolean;
}

/**
 * Which items `TodoList.list` answers (specification parameter `only` of query `List`).
 *
 * - `"all"`: every item.
 * - `"open"`: only items that are not done.
 * - `"done"`: only items that are done.
 */
export type TodoFilter = "all" | "open" | "done";

/** The values a {@link TodoFilter} may take, in a fixed order (useful for validating input). */
export const TODO_FILTERS: readonly TodoFilter[] = ["all", "open", "done"];

/**
 * Answer of `TodoList.add` (specification output of command `Add`).
 *
 * - `{ result: "created", todo }`: the item was added; `todo` is the new item.
 * - `{ result: "invalid", todo: null }`: the title was refused; nothing changed.
 */
export type AddResult =
  | { readonly result: "created"; readonly todo: Todo }
  | { readonly result: "invalid"; readonly todo: null };

/**
 * Answer of `TodoList.complete` (specification output of command `Complete`).
 *
 * - `"completed"`: the item was open and is now done.
 * - `"already-done"`: the item exists and was already done; nothing changed.
 * - `"not-found"`: no item has that identifier; nothing changed.
 */
export type CompleteResult = "completed" | "not-found" | "already-done";

/**
 * Answer of `TodoList.remove` (specification output of command `Remove`).
 *
 * - `"removed"`: the item was removed from the list.
 * - `"not-found"`: no item has that identifier; nothing changed.
 */
export type RemoveResult = "removed" | "not-found";
