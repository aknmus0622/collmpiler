import type { TodoId } from "./todo.ts";

/**
 * Where new item identifiers come from (specification external component `ids`).
 *
 * Supplied from outside to the {@link ../todo-list.ts TodoList} constructor.
 */
export interface IdSource {
  /**
   * Answers a new identifier (specification query `ids.NewId`).
   *
   * The source guarantees it never answers the same identifier twice; callers rely on that and
   * do not check for collisions.
   *
   * `TodoList.add` calls this exactly once for each item it creates, and not at all when a title
   * is refused.
   */
  newId(): TodoId;
}
