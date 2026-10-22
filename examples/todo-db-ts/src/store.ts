/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import type { Json } from "./json.ts";
import { deleteEntry, putEntry } from "./store-entries.ts";
import type { DeleteOutcome, StoreEntry } from "./store-entries.ts";

export type { DeleteOutcome, StoreEntry } from "./store-entries.ts";

/**
 * The `store` component: keeps JSON values by key, durably.
 *
 * What it keeps lives in an SQLite database at the location it is opened on, so it survives a restart
 * of the process: closing a store (or the process dying) and opening a new one on the same location gives
 * back the same entries, in the same order. A store opened on a location that holds nothing yet starts
 * empty (the specification's `init`).
 *
 * Specification mapping:
 * - command `Put(data, key)` → {@link Store.put} `(key, data)`
 * - command `Delete(key)` → {@link Store.delete} `(key)`, answering `"deleted"` or `"not-found"`
 * - query `Entries()` → {@link Store.entries} `()`; it reads the state field `entries`
 *
 * Every method acts immediately and synchronously on storage: once it returns, its change is kept.
 */
export class Store {
  readonly #db: DatabaseSync;

  /**
   * Wraps an already opened database. Prefer {@link Store.open}, which also prepares the database.
   *
   * @param db the open SQLite database the store keeps its entries in; the store owns it from now on
   */
  constructor(db: DatabaseSync) {
    this.#db = db;
  }

  /**
   * Opens the store kept at a location, creating it there (empty) if it does not exist yet.
   *
   * @param location path of the SQLite database file holding the store; opening the same path again
   *   later, for example after a restart, sees what was kept there
   * @returns the store, ready for use
   */
  static open(location: string): Store {
    const db = new DatabaseSync(location);
    db.exec(
      "CREATE TABLE IF NOT EXISTS store_entries (" +
        "position INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL)",
    );
    return new Store(db);
  }

  #read(): StoreEntry[] {
    const rows = this.#db
      .prepare("SELECT key, value FROM store_entries ORDER BY position")
      .all() as { key: string; value: string }[];
    return rows.map((row) => ({ key: row.key, value: JSON.parse(row.value) as Json }));
  }

  #write(entries: readonly StoreEntry[]): void {
    this.#db.exec("BEGIN");
    try {
      this.#db.exec("DELETE FROM store_entries");
      const insert = this.#db.prepare(
        "INSERT INTO store_entries (position, key, value) VALUES (?, ?, ?)",
      );
      entries.forEach((entry, position) => {
        insert.run(position, entry.key, JSON.stringify(entry.value));
      });
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Performs the specification's `Put` command: keeps `value` under `key`.
   *
   * @param key the key (spec parameter `key`), compared as an exact string
   * @param value any JSON value, `null` included (spec parameter `data`)
   */
  put(key: string, value: Json): void {
    this.#write(putEntry(this.#read(), key, value));
  }

  /**
   * Performs the specification's `Delete` command for `key`.
   *
   * @param key the key to delete (spec parameter `key`)
   * @returns `"deleted"` if the key was kept and has now been removed, `"not-found"` if it was not kept
   */
  delete(key: string): DeleteOutcome {
    const result = deleteEntry(this.#read(), key);
    if (result.outcome === "deleted") {
      this.#write(result.entries);
    }
    return result.outcome;
  }

  /**
   * Answers the specification's `Entries` query: every kept key with its value, in the store's order
   * (the state field `entries`, as the calculation `kept` gives it).
   *
   * @returns a fresh array; changing it does not change the store
   */
  entries(): StoreEntry[] {
    return this.#read();
  }

  /**
   * Closes the underlying database. What was kept stays at the location; open it again with
   * {@link Store.open}. The store must not be used after closing.
   */
  close(): void {
    this.#db.close();
  }
}
