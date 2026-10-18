import type { JsonValue } from "./json.ts";

/**
 * One key with the JSON value kept under it.
 *
 * Corresponds to one element of the specification's `entries` data (`{ key, value }`).
 */
export interface StoreEntry {
  /** The key the value is kept under. */
  key: string;
  /** The value kept under the key; may be `null`. */
  value: JsonValue;
}

/**
 * The answer of {@link Store.delete}:
 * - `"deleted"`: the key was kept and is now removed (specification answer `deleted`);
 * - `"not-found"`: the key was not kept, nothing changed (specification answer `not-found`).
 */
export type DeleteResult = "deleted" | "not-found";

/**
 * Pure function: the entries that result from putting `value` under `key` into `entries`.
 * Does not modify `entries`; returns a new list.
 *
 * Corresponds to the specification calculation `entriesAfterPut`.
 *
 * @param entries the entries currently kept, in their kept order
 * @param key the key given to the Put command
 * @param value the value given to the Put command
 */
export function entriesAfterPut(entries: readonly StoreEntry[], key: string, value: JsonValue): StoreEntry[] {
  if (!hasEntry(entries, key)) {
    return [...entries, { key, value }];
  }
  return entries.map((entry) => (entry.key === key ? { key: entry.key, value } : entry));
}

/**
 * Pure function: the entries that result from deleting `key` from `entries`.
 * Does not modify `entries`; returns a new list.
 *
 * Corresponds to the specification calculation `entriesAfterDelete`.
 *
 * @param entries the entries currently kept, in their kept order
 * @param key the key given to the Delete command
 */
export function entriesAfterDelete(entries: readonly StoreEntry[], key: string): StoreEntry[] {
  return entries.filter((entry) => entry.key !== key);
}

/**
 * Pure function: whether `entries` holds an entry under `key`.
 * Used by {@link Store.delete} to choose between the `"deleted"` and `"not-found"` answers.
 *
 * @param entries the entries currently kept
 * @param key the key to look for
 */
export function hasEntry(entries: readonly StoreEntry[], key: string): boolean {
  return entries.some((entry) => entry.key === key);
}
