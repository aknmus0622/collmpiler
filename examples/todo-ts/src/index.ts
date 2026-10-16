/**
 * Public entry point of the to-do list.
 *
 * Construct a {@link TodoList} with an {@link IdSource}, then call `add`, `complete`, `list` and
 * `remove` on it. The pure decision functions in `rules.ts` are re-exported for reuse.
 */

export type { AddResult, CompleteResult, ListFilter, RemoveResult, TodoItem } from "./types.ts";
export type { IdSource } from "./idSource.ts";
export { TodoList } from "./todoList.ts";
export type { ItemCompleteResult, TodoItemState } from "./todoItem.ts";
export { Todo } from "./todoItem.ts";
export {
  createItem,
  findItem,
  isAcceptableTitle,
  selectItems,
  withAdded,
  withCompleted,
  withoutItem,
} from "./rules.ts";
