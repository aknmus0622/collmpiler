/**
 * Shared value types of the to-do list.
 */

/**
 * One to-do item as stored by the list and as returned to callers.
 *
 * - `id`: the identifier the list gave the item when it was added (obtained from an {@link IdSource}).
 * - `title`: the title exactly as the caller supplied it.
 * - `done`: `false` while the item is open, `true` once it has been completed.
 */
export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly done: boolean;
}

/**
 * Which items a listing should contain (specification: the `only` field of the `List` command).
 *
 * - `"all"`: every item.
 * - `"open"`: only items that are not done.
 * - `"done"`: only items that are done.
 */
export type ListFilter = "all" | "open" | "done";

/**
 * Answer of {@link TodoList.add} (specification: output of the `Add` command).
 *
 * - `result: "created"` with `todo` set to the newly added item, or
 * - `result: "invalid"` with `todo` set to `null` when the title was refused.
 */
export type AddResult =
  | { readonly result: "created"; readonly todo: TodoItem }
  | { readonly result: "invalid"; readonly todo: null };

/**
 * Answer of {@link TodoList.complete} (specification: output of the `Complete` command).
 *
 * - `"completed"`: the item was marked done.
 * - `"not-found"`: no item has that identifier; nothing changed.
 * - `"already-done"`: the item was already done; nothing changed.
 */
export type CompleteResult = "completed" | "not-found" | "already-done";

/**
 * Answer of {@link TodoList.remove} (specification: output of the `Remove` command).
 *
 * - `"removed"`: the item was removed.
 * - `"not-found"`: no item has that identifier; nothing changed.
 */
export type RemoveResult = "removed" | "not-found";
