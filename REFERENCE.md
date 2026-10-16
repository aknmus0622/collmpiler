# Writing specs: the reference

Everything a spec author writes, on one page. The design behind it is in `DSL.md` (Japanese, §16 for the shape
described here); the layers and the pipeline are in `SPEC.md` (Japanese). All words below are imported from
`@clp/core`.

## Files

| File | Who writes it | What it holds |
| --- | --- | --- |
| `specs/<name>.decisions.ts` | you | decision tables |
| `specs/<name>.component.ts` | you | the component (Layer 1) |
| `specs/<name>.interpretation.draft.ts` | `clp interpret` | the interpretation, until you accept it |
| `specs/<name>.interpretation.ts` | `clp interpret --accept` | the interpretation in use. Never edit it by hand; make Layer 1 more precise instead |

A component is an exported `service({...})`. Its name is the export name in kebab case (`TodoList` → `todo-list`).

## Three rules

1. **Everything is a node with named children.** A node's kind decides what its children are: either **fields**
   with fixed names (a command has `input`, `from`, `goTo`, `cases`, ...), or **entries** with names you choose.
2. **A name is born only as a key of a group declaration** (`states({...})`, `data({...})`, `commands({...})`, ...).
   Every other `{ ... }` holds fields. `[ ... ]` is a list of things that carry their own name
   (`[State.A, State.B]`, `[If.paid.then({...}), otherwise]`).
3. **A plain value is shorthand for what its place expects.** `"..."` is a sentence in `description` and a type in
   `data({ price: "integer" })`; `State.DRAFT` alone in `from` is `[State.DRAFT]`; `otherwise` alone is a case where
   nothing happens. A `{ ... }` in a type's place is never a type: write `record({...})` or `integer({...})`.

## Handles: nothing is referred to by a string

Declare the vocabulary first, as groups, and refer to it through the **handles** a group gives. A typo is then a
type error, and the interpretation imports the same handles, so **export every group**.

```ts
export const State = states({ DRAFT: "Before the order is placed.", PAID: "Paid." });   // or states(["DRAFT", "PAID"])
export const If = conditions({ paid: "The payment succeeded" });   // condition sentences
export const Data = data({ price: Yen });
export const Query = queries({ isMonthEnd: "boolean" });
export const Effect = effects({ SendReceipt: input({ amount: "integer" }), Refund: "What the customer paid is returned." });
export const Calc = calculations({ charged: { description: "...", output: "integer" } });
export const Inv = invariants({ priced: "Every order past the draft state has a price" });
export const Type = types({ Todo: record({ id: "string", title: "string" }) });   // types shared by several places
export const PlaceInput = input({ listPrice: Yen });               // a command's input
export const Decision = decisions({ campaign: [If.gold.then({ discountPercent: 20 }), otherwise({ discountPercent: 0 })] });
export const Command = commands({ ... });                           // the commands (below)
```

| Handle | Used as |
| --- | --- |
| `State.PAID` | a state: `from`, `goTo`, `was(...)`, `init` |
| `If.paid` | a condition: `If.paid.then({...})` is the case where it holds (in `cases`, and as a decision-table row); also `onlyIf`, `.onlyWhen(...)` |
| `Data.price` | remembered data, as a value; `Data.price.set(value)` stores one (in `set: [...]`) |
| `Query.isMonthEnd` | the answer of a query without input |
| `Query.declared({ name: "PAID" }).as("found")` | asks a query that takes an input (in `asks: [...]`); its `.answer` is the value |
| `Effect.SendReceipt({ amount: ... })` | performs an effect, in `emits: [...]` (`Effect.Refund()` when it carries nothing); `.onlyWhen(handle)` performs it only sometimes |
| `Calc.charged` | a calculation's result |
| `Decision.campaign.discountPercent` | a decision table's column, in the row that holds |
| `PlaceInput.listPrice` | a field of the command's input; a field of a `record` field continues: `PostInput.body.title` |
| `Type.Todo` | a shared type |
| `Command.Checkout` | a command; the interpretation adds to it with `Command.Checkout.with({...})` |
| `Part.todos.Add({ title: ... })` | executes a command of a contained component (in `calls: [...]`, see Parts); its `.answer` is what it answered |

## The component

```ts
export const Order = service({
  description: "...",                     // the component as a whole
  init: State.DRAFT,                      // leave out states and init for a stateless component
  uses: [State, Data, Query, Effect, Decision, If, Calc, Inv, Command],   // its vocabulary, in any order
  assets: [file("docs/style.md")],        // advice for the implementing agent; not part of the meaning
});
```

Every group may be left out of `uses`, and every group except `decisions`, `invariants` and `types` may be given as
a whole sentence (`queries("How many books the member holds, and whether the book is reserved.")`).

| Group | An entry is | Example |
| --- | --- | --- |
| `data` | its type, or `{ type, initially, description }` | `price: Yen`, `items: { type: list(Type.Todo), initially: [] }` |
| `queries` | its answer's type, or `{ output, input, description, fresh, increasing }` | `isMonthEnd: "boolean"`, `newId: { output: "string", fresh: true }` |
| `effects` | `input({...})` for what it carries, a sentence, or `{ input, description }` | `SendReceipt: input({ amount: "integer" })` |
| `calculations` | `{ description: "<how it is computed>", output: type }` | `fee: { description: "days late × 100, at most 1000", output: "integer" }` |
| `commands` | a sentence, or the fields below | |

## Commands

```ts
export const Command = commands({
  Cancel: "A pending or paid order can be cancelled.",                      // prose
  Ship: { from: State.PAID, goTo: State.SHIPPED },                          // structure
  Pay: { from: State.PENDING, does: "The payment is taken." },              // both
  Checkout: {
    input: CheckoutInput,
    from: State.PENDING,
    onlyIf: If.moduleActive,
    output: ["paid", "failed"],
    cases: [If.paid.then({ goTo: State.PAID, responds: "paid" }), otherwise({ responds: "failed" })],
  },
});
```

Write as structure only what you want to pin down; the interpretation fills in the rest and can never override
what you wrote. A list of cases is a value, so a shared fragment is a variable:
`const refused = [If.refused.then({ responds: "refused" }), otherwise({ responds: "done" })]`, then `cases: refused`.

| Field | Meaning |
| --- | --- |
| `description` | the command, in prose |
| `input` | an input handle: what the command takes |
| `output` | what the command answers with. Every case must then `responds` |
| `from` | the states it can be executed in (all, if absent) |
| `onlyIf` | a precondition. **Outside it, nothing is tested.** Use it only for what cannot happen; a refusal is a case |
| `asks` | queries that take an input: `[Query.q({ field: value }).as("answer")]`; the answer is read as `answer` |
| `calls` | commands of contained components (see Parts) |
| `cases` | `[If.x.then({...}), ..., otherwise]`. At most one case holds at a time; `otherwise` is required |
| `route` | how the command reaches the system over HTTP (see Parts) |

What happens: fields of a command, or of a case (`If.x.then({...})`, `otherwise({...})`):

| Field | Meaning |
| --- | --- |
| `goTo` | the resulting state. **Absent: the state stays** |
| `set` | the data to remember: `[Data.field.set(value), ...]` |
| `emits` | the effects, in order: `[Effect.Name({ field: value }), Effect.Other().onlyWhen(handle)]`. `.onlyWhen` (a condition or a boolean handle) is not exclusive like a case |
| `responds` | the answer: a value, or `{ field: value }` |
| `does` | what happens, in prose |

## Types

| Type | Meaning |
| --- | --- |
| `"boolean"`, `"integer"`, `"number"`, `"string"` | plain values. Money is an `"integer"`; say the rounding in the sentence |
| `["a", "b"]` | one of these strings. Pulled out into a variable, write `as const` |
| `integer({ min, max, around })`, `number({ ... })` | a number in a range. `around` adds thresholds to try |
| `string({ examples: [...] })` | a string, with examples to try (an e-mail address, ...) |
| `among(Data.items, "id")` | a string usually picked from the `id`s of the remembered list `items` (`among(Data.items, "id", "integer")` for numbers) |
| `record({ field: type })` | a value with fields |
| `list(type)` | a sequence, compared in order |
| `optional(type)` | a value or `null`. In a `record`, a field that is sometimes absent |

How a list or record *changes* is not structure: describe the new value as a calculation and store it
(`set: [Data.items.set(Calc.itemsWithNew)]`).

## Decision tables

```ts
export const CampaignIf = conditions({ gold: "The customer is a Gold member" });
export const Decision = decisions({
  campaign: [
    CampaignIf.gold.then({ discountPercent: 20, coupon: "Premium" }),
    otherwise({ discountPercent: 0, coupon: null }),     // null: this row has no value for the column
  ],
});
```

`otherwise` is required, every row has the same columns, a column holds one kind of value, and a cell a row does
not use is `null` — never a filler. Numbers that are rules (limits, days, fees) belong here: changing a value does
not require interpreting again. A table is named by its key (`campaign`) and listed in `uses` through its group.

## Parts: components inside a component

A component can contain other components and execute their commands. Declare them with `parts`, list them in
`uses`, and call their commands from a command, before its cases:

```ts
export const Part = parts({ todos: Todos });          // Todos is an exported service with its own interpretation
export const Command = commands({
  PostTodos: {
    route: "POST /todos",                              // how the command reaches the system (part of the contract)
    input: PostTodosInput,
    calls: [Part.todos.Add({ title: PostTodosInput.body.title })],
    output: record({ status: integer({ min: 200, max: 599 }), body: optional(Type.Todo) }),
    does: "Created: 201, with the new item. Invalid: 422, with no body.",
  },
});
export const TodoApi = service({ uses: [Part, Command] });
```

The expected outcome comes from running both specifications together. What is observed is the outer
component's answer and every effect on the outside world, the contained component's included (named
`todos.<Effect>`); the contained component's state is not. Its dependencies appear in the outer contract as
`todos.<name>`. Meaning functions read an answer as `state.todos.Add`. Use `.as("name")` to call the same command
twice. `among(Data.items, "id")` may name data the contained component remembers.

`parts({ items: many(TodoItem, by("id")) })` contains one component per key: `Part.items.at(key).Complete()`
executes a command on the one with that key (none: nothing happens, and the answer is `null`);
`Part.items.add(key, { title })` and `Part.items.remove(key)` (in `adds: [...]` / `removes: [...]`) create and remove
one. Functions read `state.items`, the existing ones in the order they were created; `among(Part.items)` picks a key.

A component with parts is reconciled after them; its agent sees its own IR and the contained components'
production code (not their IR), may not change that code, and its mutations stay in its own code. It is
verified with fewer runs by default (500).

With `route: "METHOD /path"` on its commands, the component is reached over HTTP: a path segment `:name` is the
input field `name`, the input field `body` is the JSON body, every other field is a query parameter, and the
answer's `status` and `body` are the response. A path field is never given `"."` or `".."`: HTTP cannot carry
them in a path (URL normalization turns `/todos/./complete` into `/todos/complete`, encoded or not), so such a
request is outside the specification, like a situation excluded by `onlyIf`.

## The interpretation

`interpretation(Order, [ ... ])` lists what is added, each element named by itself and matched by that name with
Layer 1: groups it declares (`Data`, `Calc`, ...), `Command.Checkout.with({ ... })` (fields added to a command, or
to its cases by condition), `Order.with({ init: State.DRAFT })`, and meanings. A command or case it does not
mention gains nothing. It is derived by `clp interpret`, never written by hand.

### Values

A value is a constant or a handle: an input field, data, a query answer, a decision-table column, a calculation, or
`was(State.A, ...)` (whether the state before the command was one of these). A query is asked only with
constants, input fields and data.

### Meanings

A meaning is a function attached to a handle: `If.paid.means((state) => ...)`, `Calc.charged.means(...)`,
`Inv.priced.means(...)`. Inside one, `Decision.campaign.of(state)` is the row that holds and
`Calc.charged.of(state)` another calculation's result.

Conditions and calculations see, under one name each: `status`, the remembered data, the answers of queries without
input, the command's input, and the names given to asked answers. These names must not collide.

## Your own words

`kind(name, { fields, expand })` defines a word of your own: its fields, and how it expands into the words above.
The expansion runs when the spec is loaded; the IR and the tests see only its result, and it must give the same
result every time.

```ts
const toggle = kind("toggle", { fields: { to: "state" }, expand: ({ to }) => ({ goTo: to, does: "It toggles." }) });
export const Command = commands({ Flip: toggle({ to: State.ON }) });
```

## After a change

| You changed | Then |
| --- | --- |
| a value in a decision table | nothing; run `clp apply` |
| the wording of a sentence, meaning the same | `clp interpret --accept` (checks, then re-stamps) |
| anything else in Layer 1 | `clp interpret` (only what changed is redone), read the report, `--accept`, then `clp apply` |

`--accept` refuses a draft that still has a question (`// REVIEW:`, left by the interpreting agent) or a
disagreement between two readings (`// REVIEW(clp):`, written by `clp`). Resolve each by making Layer 1 more
precise and running `clp interpret` again, or, if the draft's reading is what you meant, by changing that
line's `REVIEW` to `REVIEWED` (it stays as the record of what you confirmed).

To look at the design before anything else is written, run `clp apply --stop-after design`: it stops once
the skeleton passes. Read it (and edit it if you like), then run `clp apply` again; it continues with the
wiring.

## What `clp compile` reports

Every message is `severity[code] where: message`. Errors stop `clp apply` before any agent runs.

| Code | Severity | Means |
| --- | --- | --- |
| `unknown-field` | error | a field the node's kind does not have; with the file and line |
| `misplaced`, `too-many`, `duplicate`, `unknown` | error | something placed where it does not belong, twice, or under the same name |
| `not-yet` | error | a word that is designed but not implemented yet |
| `unbound-specification`, `stale-interpretation`, `unreviewed-interpretation` | error | no interpretation, Layer 1 changed after it was derived, or an accepted interpretation with an open `// REVIEW:` |
| `bad-interpretation` | error | the interpretation overrides Layer 1, or a command's cases lack `otherwise` |
| `name-collision`, `unknown-state`, `bad-decision`, `bad-type` | error | names that collide, an initial state that is not a state, a table without `otherwise` or with mixed kinds in a column, an impossible range or an empty enumeration |
| `unknown-effect`, `missing-field`, `bad-value`, `bad-response`, `missing-response`, `bad-promise` | error | references and values that do not fit what is declared |
| `unbound-condition`, `unbound-calculation`, `unbound-invariant` | error | a sentence without a meaning in the interpretation |
| `unreachable-state`, `unreachable-command` | error | no command leads there |
| `unused-effect`, `unset-data`, `unasked-query` | warning | declared, never used |
| `spec-check` | error | running the spec alone: two conditions held at once, an invariant broke, a value did not fit, a meaning function read a name the spec does not have |
| `unobservable-value` | error / warning | a decision-table value that changes nothing the tests can see (an unused column, a filler, a limit written as `onlyIf`, a threshold out of reach) |
| `unreached-case` | warning | a case that never held when the spec was run |
| `type-error` | error | the spec files do not type-check |
