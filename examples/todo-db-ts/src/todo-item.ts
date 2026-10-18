/**
 * The state of a to-do item:
 * - `"open"`: the item is not done yet (specification state `OPEN`, the state every new item starts in);
 * - `"done"`: the item has been completed (specification state `DONE`).
 */
export type TodoItemStatus = "open" | "done";

/**
 * The answer of {@link TodoItem.complete} (specification output of the command `Complete`):
 * - `"completed"`: the specification answer `completed`;
 * - `"already-done"`: the specification answer `already-done`.
 */
export type CompleteResult = "completed" | "already-done";

/**
 * Everything a to-do item remembers, as a plain JSON-compatible value. Used to keep an item in storage
 * and to bring it back after a restart with {@link TodoItem.fromSnapshot}.
 */
export interface TodoItemSnapshot {
  /** The item's title (specification data `title`), exactly as it was given. */
  title: string;
  /** The item's state (specification states `OPEN` / `DONE`, see {@link TodoItemStatus}). */
  status: TodoItemStatus;
}

/**
 * The outcome of the `Complete` command, as decided by {@link decideCompletion}.
 */
export interface CompletionDecision {
  /** The state the item is in after the command. */
  status: TodoItemStatus;
  /** What the command answers. */
  result: CompleteResult;
}

/**
 * Pure function: decides the outcome of the specification command `Complete` for an item that is
 * currently in `status`. Changes nothing; {@link TodoItem.complete} applies the decision.
 *
 * @param status the item's state before the command
 * @returns the item's state after the command and the command's answer
 */
export function decideCompletion(status: TodoItemStatus): CompletionDecision {
  if (status === "open") {
    return { status: "done", result: "completed" };
  }
  return { status, result: "already-done" };
}

/**
 * One item of a to-do list (specification component `todo-item`).
 *
 * The item has no dependencies (no queries, no effects) and keeps nothing in storage itself: whoever
 * contains it (the to-do list) keeps its {@link TodoItem.snapshot} and restores it with
 * {@link TodoItem.fromSnapshot}.
 *
 * Usage:
 * ```ts
 * const item = new TodoItem("Buy milk"); // a new item, in its initial state
 * item.complete();                        // performs the `Complete` command, answers a CompleteResult
 * item.status;                            // the current state: "open" or "done"
 * ```
 */
export class TodoItem {
  private currentTitle: string;
  private currentStatus: TodoItemStatus;

  /**
   * Creates a new item with the given title, in the initial state (specification `init`: `OPEN`).
   *
   * @param title the item's title (specification data `title`), stored exactly as given
   */
  constructor(title: string) {
    this.currentTitle = title;
    this.currentStatus = "open";
  }

  /**
   * Brings back an item from what {@link TodoItem.snapshot} returned, in the state it had then.
   *
   * @param snapshot a value previously returned by {@link TodoItem.snapshot}
   */
  static fromSnapshot(snapshot: TodoItemSnapshot): TodoItem {
    const item = new TodoItem(snapshot.title);
    item.currentStatus = snapshot.status;
    return item;
  }

  /** The item's title (specification data `title`). */
  get title(): string {
    return this.currentTitle;
  }

  /** The item's current state: `"open"` (specification `OPEN`) or `"done"` (specification `DONE`). */
  get status(): TodoItemStatus {
    return this.currentStatus;
  }

  /**
   * Performs the specification command `Complete` (no input) on this item, possibly changing its state.
   *
   * @returns `"completed"` or `"already-done"` (the specification answers of the same names)
   */
  complete(): CompleteResult {
    const decision = decideCompletion(this.currentStatus);
    this.currentStatus = decision.status;
    return decision.result;
  }

  /**
   * Everything the item remembers (its title and its state), as a fresh plain value that can be stored
   * as JSON. Modifying it does not affect the item.
   */
  snapshot(): TodoItemSnapshot {
    return { title: this.currentTitle, status: this.currentStatus };
  }
}
