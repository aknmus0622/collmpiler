import type { Json } from "./json.ts";

/**
 * One value kept by the store under its key.
 * Corresponds to an element of the specification's `store.entries` state.
 */
export interface StoreEntry {
  /** The key the value is kept under, compared as an exact string. */
  key: string;
  /** The JSON value kept under the key (may be `null`). */
  value: Json;
}

/**
 * The answer of deleting a key: the specification's `Delete` output.
 * - `"deleted"`: the key was kept and now is not.
 * - `"not-found"`: the key was not kept; nothing changed.
 */
export type DeleteOutcome = "deleted" | "not-found";

/** The entries after a delete, together with the answer the delete gives. */
export interface DeleteResult {
  /** The entries as they are after the delete. */
  entries: StoreEntry[];
  /** What the delete answers. */
  outcome: DeleteOutcome;
}

/**
 * Pure form of the specification's `store.Put` command.
 *
 * @param entries the entries kept before the put, in the store's order (not modified)
 * @param key the key to keep the value under (spec parameter `key`)
 * @param value the value to keep (spec parameter `data`)
 * @returns the entries kept after the put, in the store's order
 */
export function putEntry(entries: readonly StoreEntry[], key: string, value: Json): StoreEntry[] {
  if (entries.some((e) => e.key === key)) {
    return entries.map((e) => (e.key === key ? { ...e, value } : e));
  }
  return [...entries, { key, value }];
}

/**
 * Pure form of the specification's `store.Delete` command.
 *
 * @param entries the entries kept before the delete, in the store's order (not modified)
 * @param key the key to delete (spec parameter `key`)
 * @returns the entries kept after the delete and the answer of the delete
 */
export function deleteEntry(entries: readonly StoreEntry[], key: string): DeleteResult {
  if (entries.some((e) => e.key === key)) {
    return { entries: entries.filter((e) => e.key !== key), outcome: "deleted" };
  }
  return { entries: [...entries], outcome: "not-found" };
}
