/**
 * One item of a to-do list (specification component `todo-item`): it remembers its title and
 * whether it has been completed. It has no dependencies.
 *
 * A to-do list keeps one of these per item, keyed by the item's identifier; the identifier itself
 * is held by the list, not by the item.
 */

/**
 * Where an item is in its life (specification: the component's states).
 *
 * - `"OPEN"`: the item has not been completed yet. A new item starts here.
 * - `"DONE"`: the item has been completed.
 */
export type TodoItemState = "OPEN" | "DONE";

/**
 * Answer of {@link Todo.complete} (specification: output of the `Complete` command).
 *
 * - `"completed"`: this call completed the item.
 * - `"already-done"`: the item had been completed before this call.
 */
export type ItemCompleteResult = "completed" | "already-done";

export class Todo {
  private readonly itemTitle: string;
  private currentState: TodoItemState = initialState();

  /**
   * Creates a new item, in its starting state (specification: the item `adds`-ed by the list,
   * with starting data `title`).
   *
   * @param title the item's title (specification data field `title`), kept exactly as given.
   */
  constructor(title: string) {
    this.itemTitle = title;
  }

  /** The item's title, exactly as given when it was created (specification data field `title`). */
  get title(): string {
    return this.itemTitle;
  }

  /**
   * The item's current state; see {@link TodoItemState}. Reading it changes nothing.
   */
  get state(): TodoItemState {
    return this.currentState;
  }

  /** Whether the item has been completed, i.e. is no longer open. Reading it changes nothing. */
  get done(): boolean {
    return isDone(this.currentState);
  }

  /**
   * Completes the item (specification: command `Complete`, which has no input). Can be called in
   * either state.
   *
   * @returns what happened; see {@link ItemCompleteResult}. The new state can be read from
   *   {@link state}.
   */
  complete(): ItemCompleteResult {
    const outcome = decideComplete(this.currentState);
    this.currentState = outcome.next;
    return outcome.result;
  }
}

/** What completing an item does: the state it ends in and the answer. */
interface CompleteOutcome {
  readonly next: TodoItemState;
  readonly result: ItemCompleteResult;
}

/** The state a new item starts in (specification: `model.init`). */
function initialState(): TodoItemState {
  return "OPEN";
}

/** Whether an item in `state` is still open (specification condition "The item is open."). */
function isOpen(state: TodoItemState): boolean {
  return state === "OPEN";
}

/** Whether an item in `state` has been completed. */
function isDone(state: TodoItemState): boolean {
  return state === "DONE";
}

/**
 * Decides what completing an item in `state` does (specification: the `when` of the `Complete`
 * command): an open item becomes done and the answer is completed; otherwise the item stays as
 * it is and the answer is already-done.
 */
function decideComplete(state: TodoItemState): CompleteOutcome {
  if (isOpen(state)) {
    return { next: "DONE", result: "completed" };
  }
  return { next: state, result: "already-done" };
}
