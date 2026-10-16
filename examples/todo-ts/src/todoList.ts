/**
 * The to-do list component: holds the items in memory and performs the four commands.
 *
 * The component has no states of its own (specification state `READY`): every command can be
 * performed at any time. A new list starts with no items.
 */

import type { IdSource } from "./idSource.ts";
import {
  createItem,
  findItem,
  isAcceptableTitle,
  selectItems,
  withAdded,
  withCompleted,
  withoutItem,
} from "./rules.ts";
import type {
  AddResult,
  CompleteResult,
  ListFilter,
  RemoveResult,
  TodoItem,
} from "./types.ts";

export class TodoList {
  private readonly ids: IdSource;
  private items: TodoItem[];

  /**
   * Creates an empty list.
   *
   * @param ids where identifiers for new items come from; asked once per item actually created.
   */
  constructor(ids: IdSource) {
    this.ids = ids;
    this.items = [];
  }

  /**
   * Adds a new item (specification: command `Add`, input field `title`).
   *
   * On success, asks `ids` for an identifier, stores the new item and answers
   * `{ result: "created", todo: <the new item> }`. If the title is refused, nothing is stored,
   * `ids` is not asked, and the answer is `{ result: "invalid", todo: null }`.
   *
   * @param title the title for the new item, used exactly as given.
   */
  add(title: string): AddResult {
    if (!isAcceptableTitle(title)) {
      return { result: "invalid", todo: null };
    }
    const todo = createItem(this.ids.nextId(), title);
    this.items = withAdded(this.items, todo);
    return { result: "created", todo: { ...todo } };
  }

  /**
   * Marks an item done (specification: command `Complete`, input field `id`).
   *
   * @param id identifier of the item to complete.
   * @returns `"completed"` on success; `"not-found"` or `"already-done"` when refused, in which
   *   case nothing changes.
   */
  complete(id: string): CompleteResult {
    const item = findItem(this.items, id);
    if (item === undefined) {
      return "not-found";
    }
    if (item.done) {
      return "already-done";
    }
    this.items = withCompleted(this.items, id);
    return "completed";
  }

  /**
   * Lists items (specification: command `List`, input field `only`). Changes nothing.
   *
   * @param filter which items to include; see {@link ListFilter}.
   * @returns copies of the matching items in the order they were added.
   */
  list(filter: ListFilter): TodoItem[] {
    return selectItems(this.items, filter).map((item) => ({ ...item }));
  }

  /**
   * Removes an item (specification: command `Remove`, input field `id`).
   *
   * @param id identifier of the item to remove.
   * @returns `"removed"` on success; `"not-found"` when refused, in which case nothing changes.
   */
  remove(id: string): RemoveResult {
    if (findItem(this.items, id) === undefined) {
      return "not-found";
    }
    this.items = withoutItem(this.items, id);
    return "removed";
  }
}
