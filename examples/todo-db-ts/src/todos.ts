import { Store } from "./store.ts";
import { TodoItem } from "./todo-item.ts";
import type { CompleteResult, TodoItemSnapshot } from "./todo-item.ts";

/** The longest title `Add` accepts, in characters (specification decision table `limits`, `maxTitleLength`). */
const MAX_TITLE_LENGTH = 100;

/**
 * Which items {@link Todos.list} answers (specification input `only` of the command `List`):
 * - `"all"`: every item;
 * - `"open"`: only the items that are not done;
 * - `"done"`: only the items that are done.
 */
export type ListFilter = "all" | "open" | "done";

/**
 * One item as the list shows it to the outside (the record `{ id, title, done }` of the specification
 * calculations `createdTodo` and `listedTodos`).
 */
export interface Todo {
  /** The item's identifier, given by the list when the item was added (specification `id`, the item key). */
  id: string;
  /** The item's title, exactly as it was given when the item was added. */
  title: string;
  /** Whether the item is done (`true` when the contained `todo-item` is in its `DONE` state). */
  done: boolean;
}

/**
 * How {@link Todos.add} ended (specification output `result` of the command `Add`):
 * - `"created"`: a new item was added;
 * - `"invalid"`: the title was refused, nothing was added;
 * - `"unavailable"`: no identifier could be had, nothing was added.
 */
export type AddResultKind = "created" | "invalid" | "unavailable";

/** The answer of {@link Todos.add} (specification output of the command `Add`). */
export interface AddResult {
  /** How the command ended. */
  result: AddResultKind;
  /** The new item when `result` is `"created"`; `null` otherwise (specification output `todo`). */
  todo: Todo | null;
}

/**
 * The answer of {@link Todos.complete} (specification output of the command `Complete`):
 * - `"completed"` / `"already-done"`: the answer of the item itself (see {@link CompleteResult});
 * - `"not-found"`: no item has the given identifier, nothing changed.
 */
export type TodoCompleteResult = CompleteResult | "not-found";

/**
 * The answer of {@link Todos.remove} (specification output of the command `Remove`):
 * - `"removed"`: the item was removed;
 * - `"not-found"`: no item has the given identifier, nothing changed.
 */
export type RemoveResult = "removed" | "not-found";

/**
 * The source of identifiers for new items (specification query `newId`).
 *
 * Asked by {@link Todos.add} once per item it is about to create, and only when an identifier is actually
 * needed. Every answer is an identifier never answered before; the list relies on that and does not check it.
 */
export interface IdSource {
  /**
   * Answers a fresh identifier.
   *
   * @throws when the source is unavailable (specification condition `query "newId" failed`)
   */
  newId(): string;
}

/**
 * Pure function: whether `title` is refused as invalid by the command `Add` (the specification condition
 * about the title being empty, whitespace-only or too long, with the limit of the decision table `limits`).
 *
 * @param title the title given to `Add`, as given
 */
export function isTitleInvalid(title: string): boolean {
  return title.trim() === "" || [...title].length > MAX_TITLE_LENGTH;
}

/**
 * Pure function: the item answered by a successful `Add` (specification calculation `createdTodo`).
 *
 * @param id the fresh identifier the new item got
 * @param title the title given to `Add`
 */
export function createdTodo(id: string, title: string): Todo {
  return { id, title, done: false };
}

/**
 * Pure function: the answer of `List` (specification calculation `listedTodos`).
 * Does not modify `todos`; returns a new list.
 *
 * @param todos every item, in the order they were added
 * @param only which items to keep
 */
export function listedTodos(todos: readonly Todo[], only: ListFilter): Todo[] {
  const kept = only === "all" ? todos : todos.filter((todo) => todo.done === (only === "done"));
  return kept.map((todo) => ({ id: todo.id, title: todo.title, done: todo.done }));
}

/**
 * A durable to-do list (specification component `todos`).
 *
 * The list has a single state (specification state `READY`): every method may be called at any time. It
 * contains one {@link TodoItem} per item (specification part `items`, keyed by `id`), each with its own
 * title and open/done state. Everything it has (the items, their order, and each item's state) is kept in
 * a {@link Store} (specification `durable: { store: "store" }`), so a new `Todos` on a store opened on the
 * same path comes back with the same items, in the same order, each open or done as before.
 *
 * Dependencies:
 * - a {@link Store}, read and written by every command that needs the items;
 * - an {@link IdSource}, asked for an identifier by {@link Todos.add} only.
 *
 * Usage:
 * ```ts
 * const todos = Todos.open("/var/lib/todos.db", ids);
 * const added = todos.add("Buy milk");        // { result: "created", todo: { id, title, done: false } }
 * todos.complete(added.todo!.id);             // "completed"
 * todos.list("open");                         // []
 * todos.remove(added.todo!.id);               // "removed"
 * todos.close();
 * ```
 */
export class Todos {
  private readonly store: Store;
  private readonly ids: IdSource;

  /**
   * Creates the list on an already opened store; the list has whatever items the store already keeps.
   *
   * @param store where the list keeps its items (its storage location)
   * @param ids the source of identifiers for new items
   */
  constructor(store: Store, ids: IdSource) {
    this.store = store;
    this.ids = ids;
  }

  /**
   * Opens the store kept in the database file at `path` (creating it if needed) and returns the list on it,
   * with everything previously kept at that location.
   *
   * @param path filesystem path of the SQLite database file (the list's storage location)
   * @param ids the source of identifiers for new items
   */
  static open(path: string, ids: IdSource): Todos {
    return new Todos(Store.open(path), ids);
  }

  /**
   * Performs the specification command `Add`: refuses the title, or creates a new item after the others
   * with an identifier from the {@link IdSource} and the title stored exactly as given.
   *
   * @param title the title of the new item (specification input `title`), any string
   * @returns how the command ended and, when created, the new item
   */
  add(title: string): AddResult {
    if (isTitleInvalid(title)) {
      return { result: "invalid", todo: null };
    }
    let id: string;
    try {
      id = this.ids.newId();
    } catch {
      return { result: "unavailable", todo: null };
    }
    this.save(id, new TodoItem(title));
    return { result: "created", todo: createdTodo(id, title) };
  }

  /**
   * Performs the specification command `Complete`: asks the item with identifier `id` to complete
   * (its {@link TodoItem.complete}) and answers what it answered.
   *
   * @param id the identifier of the item (specification input `id`)
   */
  complete(id: string): TodoCompleteResult {
    const item = this.find(id);
    if (item === null) {
      return "not-found";
    }
    const result = item.complete();
    this.save(id, item);
    return result;
  }

  /**
   * Performs the specification command `List`: answers the items in the order they were added, filtered
   * by `only`. Changes nothing.
   *
   * @param only which items to answer (specification input `only`)
   * @returns a fresh list; modifying it does not affect the list
   */
  list(only: ListFilter): Todo[] {
    const todos = this.store.entries().map((entry) => {
      const item = TodoItem.fromSnapshot(entry.value as unknown as TodoItemSnapshot);
      return { id: entry.key, title: item.title, done: item.status === "done" };
    });
    return listedTodos(todos, only);
  }

  /**
   * Performs the specification command `Remove`: removes the item with identifier `id`.
   *
   * @param id the identifier of the item (specification input `id`)
   */
  remove(id: string): RemoveResult {
    return this.store.delete(id) === "deleted" ? "removed" : "not-found";
  }

  /**
   * Closes the underlying store. Everything kept stays in the file; open the same path again with
   * {@link Todos.open} to continue. No other method may be called afterwards.
   */
  close(): void {
    this.store.close();
  }

  /** The item kept under `id`, brought back from the store, or `null` when there is none. */
  private find(id: string): TodoItem | null {
    const entry = this.store.entries().find((candidate) => candidate.key === id);
    return entry === undefined ? null : TodoItem.fromSnapshot(entry.value as unknown as TodoItemSnapshot);
  }

  /** Keeps `item` under `id` in the store, durably; a new identifier goes after the others. */
  private save(id: string, item: TodoItem): void {
    this.store.put(id, { ...item.snapshot() });
  }
}
