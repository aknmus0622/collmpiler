/**
 * Dependency that hands out identifiers for new items
 * (specification: the `newId` query).
 *
 * The list asks it once each time it actually creates a new item, and uses the answer as that
 * item's `id`. It is not asked when an add is refused. Implementations guarantee every answer is
 * different from all previous answers; the list relies on that and does not check it.
 */
export interface IdSource {
  /** Returns a fresh identifier for a new item. */
  nextId(): string;
}
