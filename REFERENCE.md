# Writing specs: the reference

Everything a spec author writes, on one page. A spec is TypeScript that is **read, never run**: `clp` parses it (a
subset of TypeScript), type-checks it with `tsc`, and turns it into a formal model (the IR, version 8). Its expressions
are the specification itself: they are run and checked with Alloy before any agent runs, and evaluated to compute the
expected behaviour during verification. Every word below is imported from `@clp/core`.

The design behind it is in `DSL.md` (Japanese, §17 for the notation described here, §17.18 for what the
implementation decided); the layers and the pipeline are in `SPEC.md` (Japanese).

- **Part 1. Getting started** — [The workflow](#the-workflow), [Files](#files), [From rough to precise](#from-rough-to-precise)
- **Part 2. Writing a component** — [Components](#components), [State](#state), [Commands and queries](#commands-and-queries),
  [Types](#types), [Bodies](#bodies-a-subset-of-typescript), [Fragments](#fragments-prose-inside-code),
  [Decision tables, conditions and calcs](#decision-tables-conditions-and-calcs), [Rules and examples](#rules-and-examples)
- **Part 3. Components together, and the outside world** — [Calling a component](#calling-a-component),
  [Components that run separately](#components-that-run-separately), [The outside world](#the-outside-world),
  [Restarts](#restarts), [HTTP and assets](#http-and-assets)
- **Part 4. Interpretation and checks** — [The interpretation](#the-interpretation),
  [Questions and differences](#questions-and-differences), [Answering in `clp run`](#answering-in-clp-run),
  [Checks before any agent](#checks-before-any-agent), [What `clp compile` reports](#what-clp-compile-reports)
- **Appendices** — [A. Numbers in the formal check](#a-numbers-in-the-formal-check-analysis),
  [B. `clp run --json`](#b-clp-run---json), [C. The words of `@clp/core`](#c-the-words-of-clpcore)

# Part 1. Getting started

## The workflow

You write Layer 1; everything else is derived from it.

1. **Write** `specs/<name>.component.ts`, as rough or as precise as you like.
2. **Run** `clp run --out . --agent "<command>"`. It checks the specs, derives the interpretation of what you left as
   prose (`clp interpret`), asks you what it could not settle, accepts the interpretation (`clp interpret --accept`),
   and has agents write and verify production code (`clp apply`). The three steps can also be run one by one.
3. **Change** Layer 1 and run again. Where it starts is read from the state of the specs and the output: a missing or
   stale interpretation is derived again; a changed boundary (commands, queries, their inputs and answers, the
   outside world, routes, restarts) runs design, wiring and implementation; anything else is graded as it is and, if
   it fails, implemented again. Stopped, a run continues from where it stopped.

`clp compile <specs>` reads and checks the specs alone and prints what it finds
([What `clp compile` reports](#what-clp-compile-reports)).

## Files

| File | Who writes it | What it holds |
| --- | --- | --- |
| `specs/<name>.component.ts` | you | Layer 1: components, the outside world, decision tables, types |
| `specs/<name>.interpretation.draft.ts` | `clp interpret` | the interpretation, until you accept it |
| `specs/<name>.interpretation.ts` | `clp interpret --accept` | the interpretation in use. Never edit it by hand; make Layer 1 more precise instead |

A component is an exported `service(...)`. Its name is the export name in kebab case (`TodoList` → `todo-list`).
One interpretation file goes with one Layer 1 file and holds the interpretation of every component in it that
has prose.

## From rough to precise

The same component, three times. Each is a complete spec; what you leave as prose, the interpretation fills, and what
you write as code, it cannot change.

**1. A sentence.** Every heading is left to the interpretation.

```ts
import { service } from "@clp/core";

export const Fines = service("Late fees, per member: 10 yen per day late. Paying sets a member's fee to 0.");
```

**2. Headings with sentences.** You decide what it remembers, does and answers; the content is still prose.

```ts
export const Fines = service("Late fees, per member.", {
  state: { owed: "What each member owes" },
  commands: {
    Charge: "The member is charged 10 yen per day late",
    Pay: "What the member owes becomes 0",
  },
  queries: { Owed: "What the member owes" },
});
```

**3. Code where it matters.** Typed inputs and answers, the state as code, a fragment (`is.x`) for what is still prose.

```ts
import { is, Map, requires, service } from "@clp/core";
import type { Id, Int } from "@clp/core";

export type MemberId = Id<"member number">;

export const Fines = service("Late fees, per member.", {
  state: { owed: Map<MemberId, Int>() },
  commands: {
    Charge(member: MemberId, daysLate: Int) {
      requires(daysLate >= 1 && daysLate <= 365);
      this.owed.set(member, (this.owed.has(member) ? this.owed.get(member) : 0) + daysLate * 10);
    },
    Pay(member: MemberId): "paid" | "nothing-owed" {
      if (is.nothingOwed("The member owes nothing")) return "nothing-owed";
      this.owed.delete(member);
      return "paid";
    },
  },
  queries: {
    Owed(member: MemberId): Int { return this.owed.has(member) ? this.owed.get(member) : 0; },
  },
});
```

`examples/library-ts/README.md` shows a real spec going this way, driven by what `clp interpret` asked.

# Part 2. Writing a component

## Components

```ts
export const Library = service("The library. It lends books, takes them back and charges late fees.", {
  state: { ... },
  commands: { ... },
  queries: { ... },
  rules: { ... },
  examples: { ... },
});
```

- **The description is the first argument**: `service("sentence")`, `service("sentence", { ... })`. A component
  embedded in a description as `` `${Policy}` `` must be used by the interpretation.
- **Headings separate kinds; the names under them share one namespace.** `state` (what it remembers),
  `commands` (what changes it), `queries` (what reads it, never writes), `rules` (properties), `examples`, and
  `conditions` / `calcs` / `does` (the content of [fragments](#fragments-prose-inside-code)). Under any heading an
  entry may be a sentence: `Return: "The book comes back."`.
- **Settings** sit beside the headings: `durable` ([Restarts](#restarts)), `routes` and `assets`
  ([HTTP and assets](#http-and-assets)), `components` ([Components that run separately](#components-that-run-separately)),
  and `analysis` ([Appendix A](#a-numbers-in-the-formal-check-analysis)).

## State

What a component remembers, each field declared with its type first and read and written with `this.`:

```ts
state: {
  lentTo: Map<BookId, MemberId>(),                        // each key at most one value
  members: Set<MemberId>(),
  waiting: List<MemberId>(),                              // only when order matters
  status: init<"OPEN" | "CLOSED">("OPEN"),                // a single value, with its initial value
  dueOf: "When each lent book is due",                    // prose: the interpretation decides its type
},
```

## Commands and queries

Methods with typed parameters; the parameter names are the input names.

```ts
commands: {
  Borrow(member: MemberId, book: BookId): "lent" | "on-loan" {
    if (this.lentTo.has(book)) return "on-loan";
    this.lentTo.set(book, member);
    return "lent";
  },
},
queries: {
  LoansOf(member: MemberId) { return this.lentTo.filter((_, m) => m === member).keys(); },
},
```

- What a command `return`s is its answer. Either every path returns or none does. The answer type is inferred, or
  declared: `Borrow(...): { result: "lent" | "refused"; dueInDays: Int | null }`.
- A query reads; it never writes the state.
- `requires(condition)` as the first statement puts inputs outside the specification: they are never tested and
  production code need not handle them. **A rule the system must enforce is an answer** (`return "limit";`), not a
  `requires`: written as `requires`, the check in production code is dead as far as the tests can tell, and the
  mutation gate pushes it out.

## Types

TypeScript types: `Int` (every number is an integer — money in whole yen, rounding spelled out), `string`,
`boolean`, unions of string or number literals (`"lent" | "refused"`, `201 | 422`), identifiers
(`export type MemberId = Id<"member number">`: an opaque value of its own sort), object types (records), `T[]`,
`T | null`, `Json` (any JSON value), and in state `SpecMap<K, V>` / `SpecSet<T>`. Export the types other files use.

## Bodies: a subset of TypeScript

Bodies are read as expressions, so only this subset is allowed (anything else is an error with its position):

- `if` / `else` / `return` (cases are taken from the top: the first `if` that holds decides), `const` (once),
  comparisons (`===`, `!==`, `<` ...), `+ - * %`, `Math.floor(a / b)` (integer division), `Math.min/max/abs`,
  `&& || !`, `??`, `c ? a : b`, template strings, `[...list, item]`, `{ ...record, field: value }`.
- On values: Map `has get set delete keys values size some every count filter sum` (predicates take
  `(key, value)`; `keys()` and `values()` are Sets; `get` of a missing key is a spec error, so write
  `m.has(k) ? m.get(k) : 0`, or `m.get(k)!` where the key is known to be there); Set `has add delete size some
  every count filter map sum`; list `length includes some every filter map find join` and `[...a, ...b]`; string
  `length trim toLowerCase toUpperCase startsWith endsWith includes`. A string's `length` counts characters
  (Unicode code points).
- `null` is narrowed as TypeScript does (`if (x !== null) ...`) or asserted with `x!` (null there is a spec error).
  `as` reads a JSON value as a type (`entry.value as Todo`) or a string as an identifier (`key as TodoId`).
- Not allowed: loops (use `some` / `every` / `count` / `filter`), `let`, exceptions, `switch`, functions of your own,
  regular expressions, `/` without `Math.floor`, `undefined`, and reading a state field after writing it in the same
  body (every expression reads the state **before** the step).

## Fragments: prose inside code

Inside a body, a sentence can stand where an expression or a statement goes. Give it a name:

| Fragment | Where | Filled by the interpretation under |
| --- | --- | --- |
| `is.onLoan("The book is on loan")` | a condition | `conditions: { onLoan(member, book) { return ...; } }` |
| `is.unpaid("...", Fines.Owed(member) > 0)` | a condition, with its expression | (nothing: it is already code) |
| `does.rememberDue("...")` | a statement | `does: { rememberDue(member, book) { ... } }` |
| `return does.lend("...")` | a statement that also answers | `does: { lend() { ...; return { ... }; } }` |
| `value.lateFee("...")` | a value | `calcs: { lateFee(...) { return ...; } }` |

The parameters of a fill are the names of the place the fragment is written in (same names). A fragment with its
expression (`is.unpaid("...", expr)`) is code: the sentence names it for people and in the read-out.

## Decision tables, conditions and calcs

Three kinds of unit stand outside components and are called like functions. A fragment written in one of them is
evaluated where it is called: there `this` is the caller's state.

```ts
export const Campaign = decisions("The campaign that applies", () => [
  [is.goldAtMonthEnd("A Gold member at month-end"), { discountPercent: 20, coupon: "Premium" }],
  [is.silver("A Silver member"), { discountPercent: 5, coupon: null }],
  [otherwise, { discountPercent: 0, coupon: null }],
]);
// used as Campaign().discountPercent

export const Full = condition("At the most books allowed", (held: Int) => held >= 3);
// used as if (Full(this.lentTo.count((_, m) => m === member))) return "limit";

export const LateFee = calc("10 yen per day late, at most 1000", (daysLate: Int) => Math.min(daysLate * 10, 1000));
// used as Fines.Charge(member, LateFee(days));
```

- **A decision table**: rows are a condition and constants; the first row whose condition holds is chosen; the last
  is `otherwise`. `null` means the row gives no value for that column (reading it there is a spec error) — never a
  filler: a value that changes nothing is rejected before any agent runs. The constants reach the IR without passing
  through the interpretation, so changing one needs no new interpretation.
- **A condition / a calc** names a test or a value used in several places. Written with only its sentence
  (`condition("…")`, `calc("…")`), the interpretation gives its expression.
- Fragments may stand in all three (`is.silver("…")` above); they are filled where the unit is called.

## Rules and examples

```ts
rules: {
  dueForEveryLoan() { return always(() => this.lentTo.keys().every((book) => this.dueOf.has(book))); },
  returnedNotLent() { return always.on.Return((book) => after(() => !this.lentTo.has(book))); },
  paidMeansZero: "After Pay, the member owes nothing",
},
examples: {
  unpaidRefused: example("A member who owes cannot borrow", () => {
    Fines.Charge("M001", 3);
    expect(Library.Borrow("M001", "B1")).toBe("unpaid");
  }),
},
```

- **`rules`** are properties of the spec, each a method that returns one (so that `this` has its type) or a sentence, checked on the spec (by Alloy and by running it), never on an
  implementation.

  | Word | Meaning |
  | --- | --- |
  | `always(() => c)` | `c` holds in every state (an invariant) |
  | `always.on.Cmd((inputs) => t)` | whenever `Cmd` happens, `t` holds |
  | `after(() => c)` | `c` holds right after the step |
  | `eventually(() => c)` | `c` holds at some later state |
  | `once(() => c)` | `c` held at some earlier state |
  | `historically(() => c)` | `c` held in every earlier state |
  | `until(() => a, () => b)` | `a` holds until `b` does |

- **`examples`** are the author's expectations: a sequence of calls with `expect(x).toBe(y)` (or `toEqual` for
  records and lists). They are run before any agent and replayed first during verification.

# Part 3. Components together, and the outside world

## Calling a component

**Calling a component is using it.** `Fines.Owed(member)` (a query), `Fines.Charge(m, 3);` (a command). A component
that is called and not placed anywhere else is part of the caller: its state is the caller's, and verification runs
its spec together with the caller's.

## Components that run separately

```ts
export const System = service("The library and its members", { components: { library: Library, members: Members } });
```

- Listed components are outside to each other: when `Library` calls `Members`, the contract gives it
  `ports.members`; in verification the spec of `Members` answers its queries, and the commands `Library` calls are
  recorded and compared. Anyone may call those commands, so verification also moves `Members` on its own.
- A listing component without commands or queries is never built; each listed one is verified on its own. One that
  has them contains everything it lists.
- Calls between components go one way (`calls-back`, `cycle`): what concerns two of them is written in a command of
  the parent, which calls each in turn.

## The outside world

```ts
export const Clock = external("Today's date, as days since 1970-01-01", {
  queries: { Today: (): Int => answer({ increasing: true }) },
});
export const Mail = external("Mail to members", {
  commands: { Notify(member: MemberId) {} },
});
```

The outside world has no contents, only promises; its stand-in during verification keeps them. It is always outside,
wherever it is called.

- **A query** is an arrow with its return type and `answer({ ... })`: `fresh` (never the same value twice: an
  identifier), `increasing` (never less than before: a clock), `mayFail` (it can be unavailable).
- **With `mayFail`**, the stand-in throws on one ask in four. The spec says what happens with `failed(answer)`:

  ```ts
  const id = Ids.NewId();
  if (failed(id)) return "unavailable";
  ```

  Reading a failed answer is a spec error; `failed` on a query that cannot fail is an error.
- **A command** on the outside world is an effect: recorded, in order, and compared.

## Restarts

`durable: true` says that what a component remembers survives a restart. Verification restarts the system between
steps (one in six); the adapter gets `ports.storage` (a fresh file path per trial) and must implement
`restartSystem()` on the same storage. A component that contains a durable one is restarted too.

## HTTP and assets

- `routes: { Borrow: "POST /loans", LoansOf: "GET /members/:member/loans" }` says how each command and query is
  reached over HTTP.
- `assets: [file("docs/style.md"), dir("docs"), text("...")]`, each with an optional `{ phases: ["design", ...] }`,
  are attached to the agents' requests. They are advice, never part of the spec's meaning.

# Part 4. Interpretation and checks

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

- It **fills, never overrides**: under the same heading as Layer 1 it gives the content of each name Layer 1 left as
  prose. Writing again what Layer 1 wrote as code is an error (`overwrite`), and so is a name under another heading
  (`wrong-heading`). It leaves no prose (`prose-left`).
- It may declare an `external` the prose implies (someone who is told or charged).
- Its first lines record the hash of the Layer 1 it was derived from. When Layer 1 changes, it is stale and nothing
  runs until it is derived again (or, if only the wording changed, accepted again). Decision-table cells are not part
  of the hash.

## Questions and differences

- `// REVIEW:` — a question the interpreting LLM could not settle.
- `// REVIEW(clp):` — a place where a second, independent interpretation behaves differently.

Both block `--accept` until you make Layer 1 more precise and interpret again, or confirm the reading by changing
`REVIEW` to `REVIEWED` (kept as the record).

## Answering in `clp run`

`clp run` asks you each question and difference. You answer:

- **accept** the reading: the mark becomes `REVIEWED`; Layer 1 does not change;
- **supplement**: your words are appended, as you wrote them, to the sentence of Layer 1 the question is about (the
  entry the mark is in or above: `Return: "…"`, `is.onLoan("…")`, `does.x("…")`, a state field; the command a
  difference names; the component's description when the entry is code or the mark is outside every entry). You see
  the change as a diff before it is written (`--yes` skips this); then the interpretation is derived again;
- **stop**: change Layer 1 yourself, then run again.

**A proposed split.** A component given only as several sentences, never interpreted and connected to no other
component, may really be several. Before interpreting it, `clp run` shows you a proposed split as a diff of Layer 1:
new `service("…")` declarations with the original embedding them as `${Part}`, or listing them under `components`
when they run separately. **Accepting writes that diff, including the words an agent wrote**, so read it; you are
asked even with `--yes`. Declining leaves the component as it is; it is not proposed again.

Those are the only two places `clp` writes Layer 1.

## Checks before any agent

Before any agent runs:

- reading and typing, with positions;
- laying the interpretation over Layer 1, stamps and review marks;
- running the spec alone: properties, missing map keys, a step where no case applies;
- your examples;
- Alloy: properties, that every value read is defined, the `requires` of called parts, and a trace to every event.
  A component Alloy cannot write falls back to running the spec, with a warning (`out-of-range`). Alloy needs Java;
  see [Appendix A](#a-numbers-in-the-formal-check-analysis);
- spec mutation: a constant whose change shows nowhere is an error (`unobservable-value`).

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
| warning `out-of-range` | Alloy cannot check (part of) this component (operations it cannot write), or a trace of an over-approximating module that the spec does not show; PBT still does |
| warning `alloy-int` | numbers computed with that could not be split into classes (`fun` asked for, or never decided): checked as Alloy's integers |
| warning `unused` | an outside-world port nobody uses |

# Appendices

## A. Numbers in the formal check (`analysis`)

Alloy never sees the spec's integers. A number only compared becomes an atom of a chain in the order of the numbers;
one that is computed with is split into **classes** (intervals of numbers, each an atom), and each operation becomes a
table from the classes of its operands to the class of its result (`x + 1` is a step along the chain). The ranges
come from `requires`, the initial values and the operations, for traces as long as Alloy looks at. A clock that
promises `increasing` is read as distances from now: a due date is "how many days from today", and every remembered
time moves back by the same amount when the clock moves.

- `analysis: { operations: "pred" }` (the default): exact when the classes can be made exact, otherwise a table may
  give several classes (an over-approximation). "Holds" is then still proven; a counterexample or a trace is run on
  the spec first, and one that the spec does not show is a warning (`out-of-range`, "確かめられていません"), not an
  error.
- `analysis: { operations: "fun" }`: exact or nothing: numbers that cannot be split exactly (within 64 classes) are
  checked as Alloy's integers instead, and `clp compile` says so (warning `alloy-int`).
- `classes: [classes<Days>([0, -30], { operations: "fun" })]`: for the places declared with the type `Days`
  (`type Days = Int`), the numbers that must be classes of their own, and that type's own `operations`.

`analysis` belongs to Layer 1; the interpretation may write it only when Layer 1 does not. It does not change what the
spec means, so it is not part of the stamp.

Alloy needs Java. Its questions run in parallel processes: `--alloy-jobs <n>` on `compile`, `interpret`, `apply`,
`run` and `verify`, or `CLP_ALLOY_JOBS`; by default half the processors. The number changes only how fast the check
is, never its answers.

## B. `clp run --json`

`--json` makes `clp run` speak JSON lines.

- **Events on stdout**: `step`, `question`, `confirm`, `diagnostic`, and `end` with `result` `passed` / `stopped` /
  `failed`.
- **Answers on stdin**: `{ "id": "q1", "answer": "supplement", "text": "…" }`, `{ "id": "c2", "answer": "yes" }`. A
  `question` of `kind` `split` carries `arrangement`, `parts` and `diff`, and is answered `accept`, `decline` or
  `stop`.
- **Exit codes**: 0 passed, 1 failed, 3 stopped for you.
- A `diagnostic` of `code` `framework` means `clp` contradicted itself (Stage 0 and Stage 1 disagreed): the run ends
  `failed`, and changing the specs will not help. `internal` means something else went wrong that is not known to be
  the spec's fault.

## C. The words of `@clp/core`

| Word | What it is | Section |
| --- | --- | --- |
| `service` | a component | [Components](#components) |
| `external`, `answer` | the outside world and the promises of its queries | [The outside world](#the-outside-world) |
| `failed` | whether a `mayFail` query failed | [The outside world](#the-outside-world) |
| `decisions`, `otherwise` | a decision table and its last row | [Decision tables](#decision-tables-conditions-and-calcs) |
| `condition`, `calc` | a named test, a named value | [Decision tables](#decision-tables-conditions-and-calcs) |
| `init`, `Map`, `Set`, `List` | state fields | [State](#state) |
| `is`, `does`, `value` | fragments | [Fragments](#fragments-prose-inside-code) |
| `requires` | inputs outside the specification | [Commands and queries](#commands-and-queries) |
| `always`, `after`, `eventually`, `once`, `historically`, `until` | properties over time | [Rules and examples](#rules-and-examples) |
| `example`, `expect` | the author's examples | [Rules and examples](#rules-and-examples) |
| `interpretation` | Layer 2 (written by `clp interpret`) | [The interpretation](#the-interpretation) |
| `file`, `dir`, `text` | assets | [HTTP and assets](#http-and-assets) |
| `classes` | number classes for the formal check | [Appendix A](#a-numbers-in-the-formal-check-analysis) |
| `Int`, `Id`, `Json`, `SpecMap`, `SpecSet` | types | [Types](#types) |
