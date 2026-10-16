/**
 * Pure business decisions of the to-do list. None of these functions talk to dependencies or
 * mutate their arguments; every function returning a list returns a new array.
 */

import type { ListFilter, TodoItem } from "./types.ts";

/** The longest acceptable title, in characters (specification: `limits.maxTitleLength`). */
const MAX_TITLE_LENGTH = 100;

/**
 * Decides whether `title` may be used for a new item
 * (specification: the refusal condition of the `Add` command, together with the `limits` decision table).
 *
 * @returns `true` if an item may be created with this title, `false` if the add must be refused as invalid.
 */
export function isAcceptableTitle(title: string): boolean {
  return title.trim().length > 0 && Array.from(title).length <= MAX_TITLE_LENGTH;
}

/**
 * Builds the item to add for a successful add
 * (specification: the `newItem` calculation).
 *
 * @param id the fresh identifier obtained from the {@link IdSource}.
 * @param title the title as given by the caller.
 * @returns the new item, in its initial (open) state.
 */
export function createItem(id: string, title: string): TodoItem {
  return { id, title, done: false };
}

/**
 * Returns the items with `item` added
 * (specification: the `itemsWithNew` calculation).
 */
export function withAdded(items: readonly TodoItem[], item: TodoItem): TodoItem[] {
  return [...items, item];
}

/**
 * Looks up an item by identifier.
 *
 * @returns the item whose `id` equals `id`, or `undefined` if there is none.
 */
export function findItem(items: readonly TodoItem[], id: string): TodoItem | undefined {
  return items.find((item) => item.id === id);
}

/**
 * Returns the items with the item identified by `id` marked done
 * (specification: the `itemsWithCompleted` calculation).
 * Call only after checking that such an item exists.
 */
export function withCompleted(items: readonly TodoItem[], id: string): TodoItem[] {
  return items.map((item) => (item.id === id ? { ...item, done: true } : item));
}

/**
 * Returns the items without the item identified by `id`
 * (specification: the `itemsWithoutRemoved` calculation).
 * Call only after checking that such an item exists.
 */
export function withoutItem(items: readonly TodoItem[], id: string): TodoItem[] {
  return items.filter((item) => item.id !== id);
}

/**
 * Selects the items to return for a listing
 * (specification: the `listedItems` calculation).
 *
 * @param filter which items to include; see {@link ListFilter}.
 */
export function selectItems(items: readonly TodoItem[], filter: ListFilter): TodoItem[] {
  switch (filter) {
    case "all":
      return [...items];
    case "open":
      return items.filter((item) => !item.done);
    case "done":
      return items.filter((item) => item.done);
  }
}
