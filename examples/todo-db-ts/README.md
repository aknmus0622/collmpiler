# A persistent to-do API

The to-do API of `examples/todo-ts`, extended in two ways (1.0, N9):

- **It survives a restart.** The list is `durable: Store`: what it has (its items, in order, each open or done) is
  still there after the system is stopped and started again. Where it is kept is not in the spec.
- **Its source of identifiers can fail.** `newId` is `mayFail: true`. A valid title is then refused as
  `unavailable` (the API answers 503); an invalid title is refused as `invalid` (422) either way.

Everything is written by agents and verified, including the store on `node:sqlite`. A person wrote only the specs
and the composition root (`server/main.ts`: where the data lives, a real identifier source, and a port).

```text
examples/todo-db-ts/
├── specs/    store.*      a generic store: JSON values by key, in order (durable: true)
│             todo-item.*  one item: OPEN → DONE (as in todo-ts)
│             todos.*      the list (durable: Store; newId mayFail)
│             todo-api.*   the HTTP API, which contains the list (503 when no identifier can be had)
├── src/      the store, the list and the HTTP server, written by agents
├── clp/      the test side, generated (the adapters restart the system on the same database file)
└── server/   main.ts: gives the server a database file, identifiers and a port (written by a person)
```

```bash
pnpm install
cd examples/todo-db-ts
pnpm start                       # http://localhost:3000/todos  (PORT=..., TODO_DB=... to change)
pnpm exec clp verify --out .     # verify the four components
```

## How a restart is verified

A component that is `durable` (or contains one) is verified with restarts drawn between the commands of a trial.
The harness gives each trial a new database file (`ports.storage`); the adapter's `restartSystem()` stops the
production system and starts a new instance on the same file. The expected outcome keeps the durable component's
state (the list and every item in it) and resets the rest. An implementation that keeps the items in memory fails
at the first restart.

`durable: Store` hands the store's production code to the agents that write the list, the same way a contained
component's code is handed over: the store is reconciled first, its code may be used but not changed, and it is
not mutated while the list is graded. Its spec is not run when the list is verified; the list's own spec says
what must survive.

## How it was made

1. **Specs.** `todo-item` was copied (same Layer 1, same interpretation). `todos` and `todo-api` were copied and
   changed: `durable: Store`, `newId` with `mayFail: true`, the `unavailable` answer and the 503 status, in prose.
   `store` was written new.
2. **`clp interpret`.** For `todos` and `todo-api`, the interpretations of `todo-ts` were stale. The minimal
   update added one case each: `all(not(IfAdded.titleIsInvalid), Query.newId.failed)` in the list, and
   `unavailable → 503` in the API. The second session agreed on both. For `store`, the first derivation found a bug
   in the framework: a `value()` field of a record did not accept `null`. The agent put `Put` outside the spec for
   `null` with an `onlyIf`, and the two sessions then differed. After the fix and two more sentences in Layer 1
   (a deleted key is new when it is put again; keys are compared exactly), the second derivation agreed with its
   second session and asked nothing.
3. **`clp apply`, one run: passed.** 13 sessions in total. The store's design was rejected once (a type error).
   Every other phase passed on its first attempt. Mutation: store 2/2, item 2/2, list 8/8 and API 19/27 killed.
4. **By hand:** `server/main.ts`. Started, given an item, stopped and started again on the same file: the item was
   still there.
