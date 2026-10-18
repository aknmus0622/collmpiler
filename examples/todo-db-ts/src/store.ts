/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import type { JsonValue } from "./json.ts";
import { entriesAfterDelete, entriesAfterPut, hasEntry } from "./store-entries.ts";
import type { DeleteResult, StoreEntry } from "./store-entries.ts";

export type { JsonValue } from "./json.ts";
export type { DeleteResult, StoreEntry } from "./store-entries.ts";
export { entriesAfterDelete, entriesAfterPut, hasEntry } from "./store-entries.ts";

/**
 * Durable key/value store of JSON values (specification component `store`).
 *
 * The store has a single state (specification state `READY`): once opened, every method may be called at
 * any time. What it keeps (specification data `entries`) lives in an SQLite database file, so it survives a
 * restart: opening a new `Store` on the same path gives back everything that was kept when the previous
 * one was closed or the process stopped. A store opened on a path with no database yet starts empty.
 *
 * Usage:
 * ```ts
 * const store = Store.open("/var/lib/app/store.db");
 * store.put("a", { x: 1 });
 * store.entries();      // [{ key: "a", value: { x: 1 } }]
 * store.delete("a");    // "deleted"
 * store.close();
 * ```
 *
 * The store has no other dependencies (no clock, no external services) and performs no side effects
 * besides writing its own database file.
 */
export class Store {
  private readonly database: DatabaseSync;

  /**
   * Wraps an already opened SQLite database. Prefer {@link Store.open}, which opens the database file
   * and prepares it for use.
   *
   * @param database the open database the store reads and writes
   */
  constructor(database: DatabaseSync) {
    this.database = database;
  }

  /**
   * Opens (creating it if needed) the store kept in the database file at `path` and returns it,
   * with everything previously kept at that location.
   *
   * @param path filesystem path of the SQLite database file (the store's storage location)
   */
  static open(path: string): Store {
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE IF NOT EXISTS store (id INTEGER PRIMARY KEY CHECK (id = 1), entries TEXT NOT NULL)");
    database.prepare("INSERT OR IGNORE INTO store (id, entries) VALUES (1, ?)").run(JSON.stringify([]));
    return new Store(database);
  }

  /**
   * Performs the specification command `Put`: keeps `value` under `key`, and stores the result durably
   * before returning. Answers nothing.
   *
   * @param key the key (specification input `key`), any string
   * @param value the value (specification input `value`), any JSON value including `null`
   */
  put(key: string, value: JsonValue): void {
    this.save(entriesAfterPut(this.entries(), key, value));
  }

  /**
   * Performs the specification command `Delete`: stops keeping `key` and its value, durably, if it is kept.
   *
   * @param key the key (specification input `key`)
   * @returns `"deleted"` or `"not-found"` (the specification answers of the same names)
   */
  delete(key: string): DeleteResult {
    const entries = this.entries();
    if (!hasEntry(entries, key)) {
      return "not-found";
    }
    this.save(entriesAfterDelete(entries, key));
    return "deleted";
  }

  /**
   * Performs the specification command `Entries`: answers every kept key with its value, in the kept order
   * (specification data `entries`). Changes nothing.
   *
   * @returns a fresh list of `{ key, value }` entries; modifying it does not affect the store
   */
  entries(): StoreEntry[] {
    const row = this.database.prepare("SELECT entries FROM store WHERE id = 1").get();
    return JSON.parse(row?.entries as string) as StoreEntry[];
  }

  /**
   * Closes the underlying database. Everything kept stays in the file; open the same path again with
   * {@link Store.open} to continue. No other method may be called afterwards.
   */
  close(): void {
    this.database.close();
  }

  /**
   * Replaces what is kept with `entries`, durably. The entries are kept as one JSON text, which
   * represents every key (lone surrogates included) and every value exactly.
   */
  private save(entries: readonly StoreEntry[]): void {
    this.database.prepare("UPDATE store SET entries = ? WHERE id = 1").run(JSON.stringify(entries));
  }
}
