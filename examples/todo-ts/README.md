# A to-do API

A to-do list behind an HTTP API, taken all the way through with `clp`. The spec is written by a person. The
interpretations are derived by an LLM. The list (`src/todo-list.ts`, `src/todo-rules.ts` and friends) **and the HTTP
server** (`src/todo-server.ts`, `src/todo-api.ts`) are written by agents and verified, the server over real HTTP. Only
the composition root (`server/main.ts`: a real identifier source and a port) is written by a person.

```text
examples/todo-ts/
├── specs/    todos.* (the list) and todo-api.* (the API, which contains the list): Layer 1 written by a person,
│             interpretations derived
├── src/      the list and the HTTP server, written by agents
├── clp/      the test side, generated (todo-api.adapter.ts starts the server and sends requests with fetch)
└── server/   main.ts: gives the server its dependency and a port (written by a person, 8 lines)
```

```bash
pnpm install
cd examples/todo-ts
pnpm start                       # http://localhost:3000/todos  (PORT=... to change)
pnpm exec clp verify --out .     # verify both components (the API over HTTP, 500 runs)
```

| HTTP | Command of `todo-api` | Calls on `todos` | Response |
| --- | --- | --- | --- |
| `POST /todos` `{"title": "..."}` | `PostTodos` | `Add` | 201 with the item, 422 |
| `POST /todos/:id/complete` | `CompleteTodo` | `Complete` | 200, 404, 409 |
| `DELETE /todos/:id` | `DeleteTodo` | `Remove` | 204, 404 |
| `GET /todos?only=all\|open\|done` | `GetTodos` | `List` | 200 with the items, in the order they were added |

## In the 1.0 notation

The list is `service("A to-do list. ...", { state: { items: List<Todo>() }, commands: { Add(title: string): { result:
"created" | "invalid"; todo: Todo | null } { return does.add("...") }, ... } })`: what each command takes and answers
is code, what it does is a sentence. Identifiers come from the outside world, `external(..., { queries: { NewId:
(): TodoId => answer({ fresh: true }) } })`. The API calls the list's commands (so it contains the list) and gives
each command a route; the status codes are in its sentences, so they are verified.

The 0.3 version made one item a component of its own (`many(TodoItem, by("id"))`). In 1.0 that is not a component:
many items are state (`List<Todo>`), and an item's life is in the expressions of the list's interpretation, which
are the IR the implementing agent reads.

Both interpretations were derived with two sessions each and accepted; `clp apply` wrote the list and then the API
(design, wiring, implementation) from nothing, and both passed. `server/main.ts` was rewritten against the new
production code (`startTodoServer`).

The sections below are the history of this example in the 0.3 notation (removed since).

## One item as a component (1.0, N5)

`specs/todo-item.component.ts` is one item, with states `OPEN` and `DONE` and its own `Complete` command. The list
declares `parts({ items: many(TodoItem, by("id")) })`: it creates items (`Part.items.add(newId, { title })`),
removes them, and asks the one with a given identifier to complete (`Part.items.at(id).Complete()`; with no such
item, nothing happens and the answer is `null`, which the list answers as `not-found`). The item's life is now
structure in its own IR, rather than a calculation in the list's oracle. `among(Part.items)` draws identifiers
from the items that exist.

1. **`clp interpret`**: the item, then the list. Each time, two sessions agreed. The list's agent asked two
   questions (Unicode whitespace; characters counted as code points). Both were accepted as written.
2. **`clp apply`, first run: failed.** All six implementation attempts for the item were rejected as
   `mutation-ineffective`, with 0 of 23 mutants killed. The item has no decision table, and the built-in mutation
   changes strings only when they are decision values, so its answers (`"completed"`, `"already-done"`) were never
   broken. The 23 mutants were in older code that no component used yet. The framework now also mutates the
   constants a spec fixes directly in `responds` and in effect payloads.
3. **`clp apply`, second run: passed** (about 5 minutes):
   - The item's code from the first run passed at once.
   - The list was redesigned to keep one `Todo` (from `src/todoItem.ts`) per identifier. After wiring, the code
     already passed.
   - The API was designed and wired again for the list's new shape, and passed the same way.

## The API as a component (1.0, N4)

`specs/todo-api.component.ts` declares `parts({ todos: Todos })`, a `route(...)` per command, and the status
codes in prose, so they are verified. The expected responses come from running both specs together.

1. **`clp interpret`, todo-api**: the first session wrote `PostTodosInput.body.title`, which the vocabulary
   could not express yet, so the attempt was rejected. The second attempt worked around it with a calculation.
   Fields of a record input became handles, and a fresh derivation then wrote the direct form. Two sessions
   agreed on every sequence, and there were no questions.
2. **`clp apply`, three runs**: `todos` was graded and skipped each time (nothing to implement).
   - The first `todo-api` run passed with a framework-free router, but the adapter called it without HTTP:
     nothing said the routes had to be served over real HTTP. The request now says so.
   - The second run also passed, but the agent put the listener behind an interface. The request text still
     said "no `node:` built-ins", while the check allowed the ones a server needs.
   - The third run passed with `node:http` in production code and `fetch` in the adapter. It took design 1,
     wiring 1 and implementation 3 attempts, about 8 minutes, with 18 of 19 mutants killed.
3. The agent declared the part of `node:http` it uses in `src/nodeHttp.d.ts`, because the sandbox has no Node
   type definitions. That is a gap in the framework (open).

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
