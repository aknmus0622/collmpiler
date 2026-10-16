/**
 * The to-do list component: holds the items in memory and performs the four commands.
 *
 * The component has no states of its own (specification state `READY`): every command can be
 * performed at any time. A new list starts with no items.
 */

import type { IdSource } from "./idSource.ts";
import { createItem, isAcceptableTitle, selectItems } from "./rules.ts";
import { Todo } from "./todoItem.ts";
import type {
  AddResult,
  CompleteResult,
  ListFilter,
  RemoveResult,
  TodoItem,
} from "./types.ts";

export class TodoList {
  private readonly ids: IdSource;
  /** The items, keyed by identifier, in the order they were added (specification part `items`). */
  private readonly items: Map<string, Todo>;

  /**
   * Creates an empty list.
   *
   * @param ids where identifiers for new items come from (specification: the `newId` query);
   *   asked once per item actually created.
   */
  constructor(ids: IdSource) {
    this.ids = ids;
    this.items = new Map();
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
    this.items.set(todo.id, new Todo(title));
    return { result: "created", todo: { ...todo } };
  }

  /**
   * Marks an item done (specification: command `Complete`, input field `id`). The item itself
   * decides the answer ({@link Todo.complete}).
   *
   * @param id identifier of the item to complete.
   * @returns `"completed"` on success; `"not-found"` or `"already-done"` when refused, in which
   *   case nothing changes.
   */
  complete(id: string): CompleteResult {
    const item = this.items.get(id);
    if (item === undefined) {
      return "not-found";
    }
    return item.complete();
  }

  /**
   * Lists items (specification: command `List`, input field `only`). Changes nothing.
   *
   * @param filter which items to include; see {@link ListFilter}.
   * @returns copies of the matching items in the order they were added.
   */
  list(filter: ListFilter): TodoItem[] {
    return selectItems(this.snapshot(), filter);
  }

  /**
   * Removes an item (specification: command `Remove`, input field `id`).
   *
   * @param id identifier of the item to remove.
   * @returns `"removed"` on success; `"not-found"` when refused, in which case nothing changes.
   */
  remove(id: string): RemoveResult {
    if (!this.items.delete(id)) {
      return "not-found";
    }
    return "removed";
  }

  /** The items as plain values, in the order they were added. */
  private snapshot(): TodoItem[] {
    return Array.from(this.items, ([id, item]) => ({ id, title: item.title, done: item.done }));
  }
}
