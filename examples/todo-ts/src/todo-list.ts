/**
 * The to-do list (specification component `todos`).
 *
 * Holds its items in memory only; a new instance starts with no items (specification state
 * `items`, initially empty). It is not durable.
 */
import type { IdSource } from "./id-source.ts";
import type { AddResult, CompleteResult, RemoveResult, Todo, TodoFilter, TodoId } from "./todo.ts";
import {
  completionOutcome,
  isAcceptableTitle,
  markDone,
  removalOutcome,
  selectItems,
  withoutItem,
} from "./todo-rules.ts";

export class TodoList {
  /** Source of identifiers for newly created items (specification `ids`). */
  private readonly ids: IdSource;

  /**
   * The items, in the order they were added (specification state `items`).
   * Starts empty.
   */
  private items: Todo[] = [];

  /**
   * @param ids where identifiers for new items come from; asked only by {@link add}.
   */
  constructor(ids: IdSource) {
    this.ids = ids;
  }

  /**
   * Adds an item (specification command `Add`).
   *
   * @param title the item's title; stored and answered exactly as given.
   * @returns `{ result: "created", todo }` with the new, not-done item placed after all existing
   *   ones, or `{ result: "invalid", todo: null }` when the title is refused (nothing changes).
   *   On `"created"`, `ids.newId()` is called exactly once and its answer is the item's `id`;
   *   on `"invalid"`, `ids` is not asked.
   */
  add(title: string): AddResult {
    if (!isAcceptableTitle(title)) return { result: "invalid", todo: null };
    const todo: Todo = { id: this.ids.newId(), title, done: false };
    this.items = [...this.items, todo];
    return { result: "created", todo: { ...todo } };
  }

  /**
   * Marks an item done (specification command `Complete`).
   *
   * @param id identifier of the item to complete.
   * @returns `"completed"`, `"already-done"` or `"not-found"`; see {@link CompleteResult}.
   *   Does not use `ids`.
   */
  complete(id: TodoId): CompleteResult {
    const outcome = completionOutcome(this.items, id);
    if (outcome === "completed") this.items = markDone(this.items, id);
    return outcome;
  }

  /**
   * Removes an item (specification command `Remove`).
   *
   * @param id identifier of the item to remove.
   * @returns `"removed"` or `"not-found"`; see {@link RemoveResult}. Does not use `ids`.
   */
  remove(id: TodoId): RemoveResult {
    const outcome = removalOutcome(this.items, id);
    if (outcome === "removed") this.items = withoutItem(this.items, id);
    return outcome;
  }

  /**
   * Answers the items (specification query `List`). Changes nothing.
   *
   * @param only which items to answer; see {@link TodoFilter}.
   * @returns copies of the selected items, in the order they were added.
   */
  list(only: TodoFilter): Todo[] {
    return selectItems(this.items, only).map((t) => ({ ...t }));
  }
}
