import type { Json } from "./json.ts";
import type { Store, StoreEntry } from "./store.ts";

/** The longest title, in characters, that `Add` accepts. */
const MAX_TITLE_LENGTH = 100;

/**
 * Identifier of a to-do item: the specification's atom `TodoId`. An opaque string, compared only for
 * equality. It is also the key the item is kept under in the {@link Store} (the specification's
 * `String(id)`).
 */
export type TodoId = string;

/**
 * One to-do item, as the list answers it and as it is kept (as JSON) in the store.
 * Corresponds to the specification's record `{ done, id, title }`.
 */
export interface Todo {
  /** The item's identifier, given by the list when the item was added. */
  id: TodoId;
  /** The title exactly as it was given when the item was added. */
  title: string;
  /** `false` while the item is open, `true` once it is done. */
  done: boolean;
}

/**
 * The source of identifiers for new items: the specification's external component `ids`.
 */
export interface IdSource {
  /**
   * Asked once by {@link Todos.add} for each title that is not refused as invalid (the specification's
   * query `ids.NewId`). Never answers the same identifier twice.
   *
   * @returns a fresh identifier for the new item
   * @throws when the source is unavailable (the specification's `["failed", NewId]`); `add` then answers
   *   `"unavailable"` instead of throwing
   */
  newId(): TodoId;
}

/**
 * How {@link Todos.add} ended: the `result` field of the specification's `Add` output.
 * - `"created"`: a new item was added; it is in {@link AddResult.todo}.
 * - `"invalid"`: the title was refused; nothing changed.
 * - `"unavailable"`: no identifier could be had from the {@link IdSource}; nothing changed.
 */
export type AddOutcome = "created" | "invalid" | "unavailable";

/** The answer of {@link Todos.add}: the specification's `Add` output. */
export interface AddResult {
  /** How the add ended. */
  result: AddOutcome;
  /** The new item when `result` is `"created"`, otherwise `null`. */
  todo: Todo | null;
}

/**
 * The answer of {@link Todos.complete}: the specification's `Complete` output.
 * - `"completed"`: the item was open and is now done.
 * - `"already-done"`: the item was already done; nothing changed.
 * - `"not-found"`: no item has that identifier; nothing changed.
 */
export type CompleteOutcome = "completed" | "already-done" | "not-found";

/**
 * The answer of {@link Todos.remove}: the specification's `Remove` output.
 * - `"removed"`: the item was there and is now gone.
 * - `"not-found"`: no item has that identifier; nothing changed.
 */
export type RemoveOutcome = "removed" | "not-found";

/**
 * Which items {@link Todos.list} answers: the specification's `only` parameter of `List`.
 * - `"all"`: every item.
 * - `"open"`: only the items that are not done.
 * - `"done"`: only the items that are done.
 */
export type ListFilter = "all" | "open" | "done";

/**
 * Pure decision: whether a title is refused as invalid by `Add` (the specification's `Add.case1` guard).
 *
 * @param title the title as given to {@link Todos.add}
 * @returns `true` if the title must be refused as `"invalid"`
 */
export function isInvalidTitle(title: string): boolean {
  return [...title.trim()].length === 0 || [...title].length > MAX_TITLE_LENGTH;
}

/**
 * Pure calculation: the items to list, from what the store keeps (the specification's calculation
 * `listed`).
 *
 * @param entries the store's entries in its order (the answer of `store.Entries`); each value is a kept
 *   {@link Todo}
 * @param only which items to answer
 * @returns the matching items, in the store's order (the order they were added)
 */
export function listedTodos(entries: readonly StoreEntry[], only: ListFilter): Todo[] {
  const keep = LIST_FILTERS[only];
  return entries.map((e) => e.value as unknown as Todo).filter(keep);
}

/** Which items each {@link ListFilter} keeps. */
const LIST_FILTERS: Readonly<Record<ListFilter, (todo: Todo) => boolean>> = {
  all: () => true,
  open: (todo) => !todo.done,
  done: (todo) => todo.done,
};

/**
 * The `todos` component: a to-do list kept in a {@link Store}, so it survives a restart (opening a new
 * `Todos` on a store reopened at the same location sees the same items, in the same order, open or done
 * as before).
 *
 * Specification mapping:
 * - command `Add(title)` → {@link Todos.add}
 * - command `Complete(id)` → {@link Todos.complete}
 * - command `Remove(id)` → {@link Todos.remove}
 * - query `List(only)` → {@link Todos.list}
 *
 * Its state is the contained `store` component's state (`store.entries`): each item is kept under its
 * identifier as key, with the item itself ({@link Todo}) as JSON value. Read it with
 * {@link Store.entries}.
 */
export class Todos {
  readonly #store: Store;
  readonly #ids: IdSource;

  /**
   * @param store where the items are kept; it is read and changed by every command, and must stay open
   *   while the list is used
   * @param ids the source of identifiers, asked by {@link Todos.add} for a new item's identifier
   */
  constructor(store: Store, ids: IdSource) {
    this.#store = store;
    this.#ids = ids;
  }

  /**
   * Performs the specification's `Add` command: adds a new open item with the given title, after the
   * others. Asks the {@link IdSource} for the new identifier (only if the title is not invalid) and, if
   * created, puts the item into the store under that identifier.
   *
   * @param title the item's title, kept exactly as given (spec parameter `title`)
   * @returns the outcome, with the new item when created; never throws because the id source failed
   */
  add(title: string): AddResult {
    if (isInvalidTitle(title)) return { result: "invalid", todo: null };
    let id: TodoId;
    try {
      id = this.#ids.newId();
    } catch {
      return { result: "unavailable", todo: null };
    }
    const todo: Todo = { done: false, id, title };
    this.#store.put(id, { ...todo });
    return { result: "created", todo };
  }

  /**
   * Performs the specification's `Complete` command: marks the item with this identifier as done. Reads
   * the store's entries and, if the item changes, puts it back under the same key.
   *
   * @param id the item's identifier (spec parameter `id`)
   * @returns what happened
   */
  complete(id: TodoId): CompleteOutcome {
    const entry = this.#store.entries().find((e) => e.key === id);
    if (entry === undefined) return "not-found";
    if ((entry.value as unknown as Todo).done) return "already-done";
    this.#store.put(id, { ...(entry.value as { [field: string]: Json }), done: true });
    return "completed";
  }

  /**
   * Performs the specification's `Remove` command: deletes the item with this identifier from the store.
   *
   * @param id the item's identifier (spec parameter `id`)
   * @returns what happened
   */
  remove(id: TodoId): RemoveOutcome {
    return this.#store.delete(id) === "deleted" ? "removed" : "not-found";
  }

  /**
   * Answers the specification's `List` query: the items, in the order they were added, as filtered.
   * Only reads the store.
   *
   * @param only which items to answer (spec parameter `only`)
   * @returns a fresh array of items
   */
  list(only: ListFilter): Todo[] {
    return listedTodos(this.#store.entries(), only);
  }
}
