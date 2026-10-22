/**
 * Pure business decisions of the to-do list. No state, no dependencies: every function answers
 * only from its arguments and never modifies them.
 */
import type { CompleteResult, RemoveResult, Todo, TodoFilter, TodoId } from "./todo.ts";

/** The most characters (Unicode code points) a title may have. */
const MAX_TITLE_LENGTH = 100;

/** The number of characters of `s`, counted as Unicode code points. */
function codePointLength(s: string): number {
  return [...s].length;
}

/**
 * Whether `title` may be used for a new item (decides between the specification's
 * `Add` events that refuse a title and `Add.otherwise`).
 *
 * @param title the title exactly as supplied to `add`.
 * @returns `true` if an item may be created with it, `false` if `add` answers `"invalid"`.
 */
export function isAcceptableTitle(title: string): boolean {
  return codePointLength(title.trim()) > 0 && codePointLength(title) <= MAX_TITLE_LENGTH;
}

/**
 * Decides the answer of completing the item `id` among `items` (selects the specification's
 * `Complete` event).
 *
 * @param items the current items, in the order they were added.
 * @param id the identifier to complete.
 * @returns the answer `complete` gives; only `"completed"` means the items change.
 */
export function completionOutcome(items: readonly Todo[], id: TodoId): CompleteResult {
  const item = items.find((t) => t.id === id);
  if (item === undefined) return "not-found";
  return item.done ? "already-done" : "completed";
}

/**
 * The items after the item `id` has been marked done, in the same order. Only meaningful when
 * {@link completionOutcome} answered `"completed"`.
 *
 * @returns a new array; `items` is left untouched.
 */
export function markDone(items: readonly Todo[], id: TodoId): Todo[] {
  return items.map((t) => (t.id === id ? { ...t, done: true } : t));
}

/**
 * Decides the answer of removing the item `id` from `items` (selects the specification's
 * `Remove` event).
 *
 * @returns the answer `remove` gives; only `"removed"` means the items change.
 */
export function removalOutcome(items: readonly Todo[], id: TodoId): RemoveResult {
  return items.some((t) => t.id === id) ? "removed" : "not-found";
}

/**
 * The items without the item `id`, in the same order. Only meaningful when
 * {@link removalOutcome} answered `"removed"`.
 *
 * @returns a new array; `items` is left untouched.
 */
export function withoutItem(items: readonly Todo[], id: TodoId): Todo[] {
  return items.filter((t) => t.id !== id);
}

/**
 * The items selected by `only`, keeping the order they were added in
 * (specification calculation `listed`).
 *
 * @param items the current items, in the order they were added.
 * @param only which items to answer; see {@link TodoFilter}.
 * @returns a new array; `items` is left untouched.
 */
export function selectItems(items: readonly Todo[], only: TodoFilter): Todo[] {
  if (only === "open") return items.filter((t) => !t.done);
  if (only === "done") return items.filter((t) => t.done);
  return [...items];
}
