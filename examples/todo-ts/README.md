# A to-do API (the web example of version 0.1)

A to-do list behind an HTTP API, taken all the way through with `clp`: the spec is written by a person, the
interpretation is derived by an LLM, the API part (`src/`) is written by an agent and verified, and the entry
point (`server/`) is written by a person.

```text
examples/todo-ts/
├── specs/    todos.component.ts and todos.decisions.ts (written by a person), todos.interpretation.ts (derived)
├── src/      the to-do list, written by an agent
├── clp/      the test side, generated
└── server/   the HTTP server, written by a person: requests → commands, answers → responses. The list is in memory
```

```bash
pnpm install
cd examples/todo-ts
pnpm start                       # http://localhost:3000/todos  (PORT=... to change)
pnpm exec clp verify --out .     # verify src/ against the spec
```

| HTTP | Command | Response |
| --- | --- | --- |
| `POST /todos` `{"title": "..."}` | `Add` | `created` → 201 with the item, `invalid` → 422 |
| `POST /todos/:id/complete` | `Complete` | `completed` → 200, `already-done` → 409, `not-found` → 404 |
| `DELETE /todos/:id` | `Remove` | `removed` → 204, `not-found` → 404 |
| `GET /todos?only=all\|open\|done` | `List` | 200 with the items, in the order they were added |

## How it was made

The spec pins down the boundary as structure — what each command takes (`input`) and answers (`output`), the
list the component remembers (`list(Todo)`, initially empty), and a dependency that hands out identifiers and
promises never to repeat one (`fresh()`). What each command does is prose.

1. **`clp interpret`, first run: rejected three times, by the framework.** Spec mutation reported that the
   decision-table value `maxTitleLength: 100` never shows in verification: random strings are short, so no title
   ever came close to 100 characters. The spec was right and the framework's input generation was not; it now
   also tries strings whose length is near the numbers found in the spec. After that the same draft passed.
2. **`clp interpret`, two sessions.** The two interpretations behaved the same on every sequence tried. The LLM
   left three questions: is a title of spaces "blank", how are characters counted, is the title trimmed. Layer 1
   was made precise about the first and the last ("empty or made only of whitespace", "stored exactly as given").
3. **`clp interpret`, after the change: 77 seconds**, only `Add` changed. One question remained (characters are
   counted as UTF-16 units); it was accepted, since that is how a TypeScript implementation counts.
4. **`clp apply`: design, wiring and implementation each passed on its first attempt, in 130 seconds**, with 4 of
   4 mutants killed. The design was a plain class with a single dependency (`IdSource`), so stopping after the
   design for a person to review the skeleton was not needed this time.
5. **The entry point** (`server/main.ts`, about 70 lines) was written by hand against the class the agent wrote,
   and every command was exercised with curl.

In all: four interpretation sessions that produced a draft (plus three rejected by the generator problem), three
implementation sessions, no feedback rounds.

## What was hard to write, or missing

- **String length thresholds** were not reachable by input generation (fixed in the framework, see above).
- **The status codes are not in the spec.** `created` → 201 and so on live in the entry point, unverified. In
  version 0.1 the entry point is written by a person; checking it is the second verification planned for 1.0.
- **The record type was written twice.** `Todo` was declared in the component file without `export`, so the
  derived interpretation declared it again. It is exported now; a later derivation can import it.
- **Items are a list remembered by one component**, and how they change is calculations (`itemsWithNew`,
  `itemsWithCompleted`, ...), which live in the oracle only. An item's own life (open → done) is not structure,
  so it is not in the IR the implementing agent reads; the agent read it from the prose and got it right here.
  Nested components (`DSL.md` §6) would make it structure; this example did not need them to pass.
- **Persistence is in memory.** Saving to a file or a database would be glue in the entry point, unverified.
