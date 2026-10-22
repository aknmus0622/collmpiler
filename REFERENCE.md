# Writing specs: the reference

Everything a spec author writes, on one page. The design behind it is in `DSL.md` (Japanese, §17 for the notation
described here, §17.18 for what the implementation decided); the layers and the pipeline are in `SPEC.md`
(Japanese). Every word below is imported from `@clp/core`.

A spec is TypeScript that is **read, never run**: `clp` parses it (a subset of TypeScript, see below), type-checks it
with `tsc`, and turns it into a formal model (the IR, version 8). Expressions in it are the specification itself:
the expected behaviour during verification is computed by evaluating them, and they are checked with Alloy before
any agent runs.

## Files

| File | Who writes it | What it holds |
| --- | --- | --- |
| `specs/<name>.component.ts` | you | Layer 1: components, the outside world, decision tables, types |
| `specs/<name>.interpretation.draft.ts` | `clp interpret` | the interpretation, until you accept it |
| `specs/<name>.interpretation.ts` | `clp interpret --accept` | the interpretation in use. Never edit it by hand; make Layer 1 more precise instead |

A component is an exported `service(...)`. Its name is the export name in kebab case (`TodoList` → `todo-list`).
One interpretation file goes with one Layer 1 file and holds the interpretation of every component in it that
has prose.

## A component

```ts
import { answer, decisions, does, example, expect, external, is, Map, otherwise, service } from "@clp/core";
import type { Id, Int } from "@clp/core";

export type MemberId = Id<"member number">;   // an identifier: an opaque value of its own sort
export type BookId = Id<"book number">;

// The outside world: no contents, only promises. Its stand-in during verification keeps them.
export const Clock = external("Today's date, as days since 1970-01-01", {
  queries: { Today: (): Int => answer({ increasing: true }) },
});

// A component given only as a sentence: every heading is left to the interpretation
export const Fines = service("Late fees: 10 yen per day late, per member. Paying sets it to 0.");

export const Policy = decisions("The loan policy", (member: MemberId) => [
  [is.extended("An extended member", Members.IsExtended(member)), { maxBooks: 3, loanDays: 28 }],
  [otherwise, { maxBooks: 2, loanDays: 14 }],
]);

export const Library = service("The library. It lends books, takes them back and charges late fees.", {
  state: {
    lentTo: Map<BookId, MemberId>(),
    dueOf: "When each lent book is due",            // prose: the interpretation decides its type
  },
  commands: {
    Borrow(member: MemberId, book: BookId) {
      if (is.unpaid("The member owes a late fee", Fines.Owed(member) > 0)) return "unpaid";
      if (is.onLoan("The book is on loan")) return "on-loan";   // a sentence only: the interpretation fills it
      this.lentTo.set(book, member);
      does.rememberDue("The due date is remembered");
      return "lent";
    },
    Return: "The book comes back. A late return is charged the late fee.",
  },
  queries: { LoansOf: "The books the member has" },
  rules: { dueForEveryLoan: "Every lent book has a due date" },
  examples: {
    unpaidRefused: example("A member who owes cannot borrow", () => {
      Fines.Charge("M001", 3);
      expect(Library.Borrow("M001", "B1")).toBe("unpaid");
    }),
  },
});
```

- **The description is the first argument**: `service("sentence")`, `service("sentence", { ... })`. A component
  embedded in a description as `` `${Policy}` `` must be used by the interpretation.
- **Headings separate kinds; the names under them share one namespace.** `state` (what it remembers),
  `commands` (what changes it; methods), `queries` (what reads it; methods, never writes), `rules` (properties),
  `examples`, and `conditions` / `calcs` / `does` (the content of fragments, see below). Under any heading an entry
  may be a sentence: `Return: "..."`.
- **Settings** (not headings): `durable: true` (what it remembers survives a restart), `routes` (how each command
  reaches it over HTTP: `{ Borrow: "POST /loans" }`), `assets` (`[file("docs/style.md"), dir("docs"), text("...")]`,
  each with an optional `{ phases }`; attached to the agent's requests, never part of the spec's meaning).
- **State** is declared with its type first: `Map<K, V>()` (each key at most one value), `Set<T>()`, `List<T>()`
  (only when order matters), `init<T>(value)` for a single value. Read and written with `this.`.
- **Commands and queries are methods with typed parameters**; the parameter names are the input names. What a
  command `return`s is its answer (`return "unpaid";`). Either every path returns or none does. The answer type is
  inferred, or declared: `Borrow(...): { result: "lent" | "refused"; dueInDays: Int | null }`.
- **Calling a component is using it.** `Fines.Owed(member)` (a query), `Fines.Charge(m, 3);` (a command). A
  component that is called and not placed anywhere else is part of the caller (its state is the caller's, and
  verification runs its spec together with the caller's). The outside world (`external`) is always outside.
- **The outside world**: `external("what it is", { queries: { ... }, commands: { Notify(member: MemberId) {} } })`.
  A query is an arrow with its return type and `answer({ ... })`: `fresh` (never the same value twice: an
  identifier), `increasing` (never less than before: a clock), `mayFail` (it can be unavailable; the spec says what
  happens with `failed(Ids.NewId())`). A command on the outside world is an effect: recorded, in order, and compared.

## Fragments: prose inside code

Inside a body, a sentence can stand where an expression or a statement goes. Give it a name:

| Fragment | Where | Filled by the interpretation under |
| --- | --- | --- |
| `is.onLoan("The book is on loan")` | a condition | `conditions: { onLoan(member, book) { return ...; } }` |
| `is.unpaid("...", Fines.Owed(member) > 0)` | a condition, with its expression | (nothing: it is already code) |
| `does.rememberDue("...")` | a statement | `does: { rememberDue(member, book) { ... } }` |
| `return does.lend("...")` | a statement that also answers | `does: { lend() { ...; return { ... }; } }` |
| `value.lateFee("...")` | a value | `calcs: { lateFee(...) { return ...; } }` |

The parameters of a fill are the names of the place the fragment is written in (same names). A fragment written
in a decision table, `condition(...)` or `calc(...)` is evaluated where it is called: there `this` is the caller's
state.

## Bodies: a subset of TypeScript

Bodies are read as expressions, so only this subset is allowed (anything else is an error with its position):

- `if` / `else` / `return` (cases are taken from the top: the first `if` that holds decides), `const` (once),
  comparisons (`===`, `!==`, `<` ...), `+ - * %`, `Math.floor(a / b)` (integer division), `Math.min/max/abs`,
  `&& || !`, `??`, `c ? a : b`, template strings, `[...list, item]`, `{ ...record, field: value }`.
- On values: Map `has get set delete keys values size some every count filter sum`; Set `has add delete size some
  every count filter map sum`; list `length includes some every filter map find join` and `[...a, ...b]`; string
  `length trim toLowerCase toUpperCase startsWith endsWith includes`. A string's `length` counts characters
  (Unicode code points).
- `requires(condition)` as the first statement puts inputs outside the specification: they are never tested and
  production code need not handle them. A rule the system must enforce is an answer (`return "limit";`), not a
  `requires`: written as `requires`, the check in production code is dead as far as the tests can tell, and the
  mutation gate pushes it out.
- `null` is narrowed as TypeScript does (`if (x !== null) ...`) or asserted with `x!` (null there is a spec error).
  `as` reads a JSON value as a type (`entry.value as Todo`) or a string as an identifier (`key as TodoId`).
- Not allowed: loops (use `some` / `every` / `count` / `filter`), `let`, exceptions, `switch`, functions of your own,
  regular expressions, `/` without `Math.floor`, `undefined`, and reading a state field after writing it in the same
  body (every expression reads the state **before** the step).

## Types

TypeScript types: `Int` (every number is an integer — money in whole yen, rounding spelled out), `string`,
`boolean`, unions of string or number literals (`"lent" | "refused"`, `201 | 422`), identifiers
(`type MemberId = Id<"member number">`), object types (records), `T[]`, `T | null`, `Json` (any JSON value),
and in state `SpecMap<K, V>` / `SpecSet<T>`.

## Decision tables

```ts
export const Campaign = decisions("The campaign that applies", () => [
  [is.goldAtMonthEnd("A Gold member at month-end"), { discountPercent: 20, coupon: "Premium" }],
  [is.silver("A Silver member"), { discountPercent: 5, coupon: null }],
  [otherwise, { discountPercent: 0, coupon: null }],
]);
// used like a function: Campaign().discountPercent
```

Rows are a condition and constants; the first row whose condition holds is chosen; the last is `otherwise`.
`null` means the row gives no value for that column (reading it there is a spec error) — never a filler: a value
that changes nothing is rejected before any agent runs. The constants reach the IR without passing through the
interpretation, so changing one needs no new interpretation.

## Rules and examples

`rules` are properties of the spec, checked on the spec (by Alloy and by running it), never on an implementation:
`always(() => condition)` (an invariant), and `eventually`, `after`, `once`, `historically`, `until`,
`always.on.Return((book) => after(() => !this.lentTo.has(book)))` ("whenever Return happens").
`examples` are the author's expectations: a sequence of calls with `expect(...).toBe(...)`; they are run before any
agent and replayed first during verification.

## The interpretation

Written in the same notation, by `clp interpret`, for one component:

```ts
export const LibraryInterpretation = interpretation(Library, {
  state: { dueOf: Map<BookId, Int>() },
  conditions: { onLoan(member: MemberId, book: BookId) { return this.lentTo.has(book); } },
  does: { rememberDue(member: MemberId, book: BookId) { this.dueOf.set(book, Clock.Today() + Policy(member).loanDays); } },
  commands: { Return(book: BookId) { /* ... */ return "returned"; } },
});
```

It **fills, never overrides**: under the same heading as Layer 1 it gives the content of each name Layer 1 left as
prose. Writing again what Layer 1 wrote as code is an error, and so is a name under another heading. It may
declare an `external` the prose implies (someone who is told or charged). Its first lines record the hash of the
Layer 1 it was derived from; when Layer 1 changes, it is stale and nothing runs until it is derived again (or, if
only the wording changed, accepted again). Decision-table cells are not part of the hash.

Questions the interpreting LLM could not settle are `// REVIEW:` lines; places where a second, independent
interpretation behaves differently are `// REVIEW(clp):` lines. Both block `--accept` until you make Layer 1 more
precise and interpret again, or confirm the reading by changing `REVIEW` to `REVIEWED` (kept as the record).

## After a change

Run `clp interpret` (the interpretation of every changed component is updated from the current one), accept, then
`clp apply`. Which steps run is decided from what changed: a changed boundary (commands, queries, their inputs and
answers, the outside world, routes, restarts) runs design, wiring and implementation; anything else is graded as it
is and, if it fails, implemented again.

## Restarts and failing dependencies

- `durable: true`: verification restarts the system between steps (one in six). The adapter gets `ports.storage`
  (a fresh file path per trial) and must implement `restartSystem()` on the same storage. A component that contains
  a durable one is restarted too.
- `mayFail: true` on a query of the outside world: its stand-in throws on one ask in four. The spec says what
  happens with `failed(answer)`; reading a failed answer is a spec error. `failed` on a query that cannot fail is an
  error.

## What `clp compile` reports

Every diagnostic is `severity[code] where: message`. The common ones:

| Code | Meaning |
| --- | --- |
| `syntax` | outside the subset, with its position |
| `type-mismatch`, `unknown-name` | a value of the wrong type, a name the spec does not have |
| `prose-left` | a sentence without content: interpret, or write it as code |
| `prose-in-expression` | a bare sentence where an expression is required: make it `is.name("...")` |
| `overwrite`, `wrong-heading` | the interpretation rewrites Layer 1, or fills a name under another heading |
| `read-after-write` | a state field read after it is written in the same body |
| `unbound-specification`, `stale-interpretation`, `unreviewed-interpretation` | no interpretation, one derived from another Layer 1, one with open review marks |
| `spec-check` | running the spec alone failed (a property broken, a missing map key, no case applies); with the steps |
| `unobservable-value` | a constant whose change shows nowhere: an unused column, a filler, an unreachable threshold |
| `bad-failure`, `bad-promise` | `failed` on a query that cannot fail; a promise that cannot hold |
| warning `out-of-range` | Alloy cannot check this component (numbers too large, lists, JSON ...); PBT still does |
| warning `unused` | an outside-world port nobody uses |
