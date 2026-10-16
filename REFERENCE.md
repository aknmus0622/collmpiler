# Writing specs: the reference

Everything a spec author writes, on one page. The design behind it is in `DSL.md` (Japanese); the layers and the
pipeline are in `SPEC.md` (Japanese). All words below are imported from `@clp/core`.

## Files

| File | Who writes it | What it holds |
| --- | --- | --- |
| `specs/<name>.decisions.ts` | you | decision tables |
| `specs/<name>.component.ts` | you | the component (Layer 1) |
| `specs/<name>.interpretation.draft.ts` | `clp interpret` | the interpretation, until you accept it |
| `specs/<name>.interpretation.ts` | `clp interpret --accept` | the interpretation in use. Never edit it by hand; make Layer 1 more precise instead |

A component is an exported `component(...)`. Its name is the export name in kebab case (`TodoList` → `todo-list`).

## The one rule

Every entry is **prose**, **parts**, or **both bundled with `component(...)`**. Write as structure only what you want
to pin down; the interpretation fills in the rest and can never override what you wrote.

```ts
Cancel: description("A pending or paid order can be cancelled."),       // prose
Ship: component(from("PAID"), goTo("SHIPPED")),                          // parts
Pay: component(from("PENDING"), does("The payment is taken.")),          // both
```

A `component(...)` with no name dissolves into wherever it is placed, so a fragment is shared by putting it in a
variable: `const refused = component(when("...", responds("refused")), otherwise())`.

`{ ... }` is always shorthand for a list of named things, and the word that receives it says what they are:
`commands: {...}` names commands, `input({...})` names fields and their types, `integer({...})` holds settings.
A bare `{ ... }` is never a type.

## The component

```ts
export const Order = component({
  description: "...",                     // the component as a whole
  states: ["DRAFT", "PAID"],              // or { DRAFT: description("..."), ... }. Leave out states and init for a stateless component
  init: "DRAFT",
  data: { ... },                          // what it remembers between commands
  queries: { ... },                       // what it asks its dependencies
  effects: { ... },                       // what it does to its dependencies
  decisions: { campaign: Campaign },      // the decision tables it uses
  calculations: { ... },                  // values defined by a sentence
  invariants: ["..."],                    // sentences that always hold
  commands: { ... },                      // what drives it from outside
  assets: [file("docs/style.md")],        // advice for the implementing agent; not part of the meaning
});
```

Every group may be left out, and every group except `decisions`, `invariants` and `assets` may be a whole
`description("...")`.

| Group | An entry is | Example |
| --- | --- | --- |
| `data` | its type; add `initially(value)` for a starting value | `price: Yen`, `items: component(list(Todo), initially([]))` |
| `queries` | its answer's type (or `output(type)`), plus `input({...})` if it is asked about something; `fresh()` / `increasing()` for a promise | `isMonthEnd: "boolean"`, `newId: component(output("string"), fresh())` |
| `effects` | `input({...})` for what it carries | `SendReceipt: input({ amount: "integer" })` |
| `calculations` | `description("<how it is computed>")` and `output(type)` | `fee: component(description("days late × 100, at most 1000"), output("integer"))` |
| `commands` | the parts below | |

### Command parts

| Part | Meaning |
| --- | --- |
| `input({ field: type })` | what the command takes |
| `output(type)` | what the command answers with. Every case must then `responds(...)` |
| `from("A", "B")` | the states it can be executed in (all, if absent) |
| `onlyIf("<condition>")` | a precondition. **Outside it, nothing is tested.** Use it only for what cannot happen; a refusal is a `when` case |
| `asks("answer", "query", { field: value })` | asks a query that takes an input; the answer is read as `answer` |
| `when("<condition>", ...)` | one case. At most one case holds at a time |
| `otherwise(...)` | the case when none holds. Required once there is a `when` |

What happens, directly in the command or inside a case:

| Part | Meaning |
| --- | --- |
| `goTo("STATE")` | the resulting state. **Absent: the state stays** |
| `set({ field: value })` | the data to remember |
| `emits("Effect", { field: value }, onlyWhen(...))` | an effect, in order. `onlyWhen` (a condition or a boolean reference) performs it only sometimes; it is not exclusive like `when` |
| `responds(value)` / `responds({ field: value })` | the answer |
| `does("...")` | what happens, in prose |

`set` and `emits` are written by the interpretation; in Layer 1, say them with `does("...")`.

## Types

| Type | Meaning |
| --- | --- |
| `"boolean"`, `"integer"`, `"number"`, `"string"` | plain values. Money is an `"integer"`; say the rounding in the sentence |
| `["a", "b"]` | one of these strings. Pulled out into a variable, write `as const` |
| `integer({ min, max, around })`, `number({ ... })` | a number in a range. `around` adds thresholds to try |
| `string({ examples: [...] })` | a string, with examples to try (an e-mail address, ...) |
| `among("items", "id")` | a string usually picked from the `id`s of the remembered list `items` (`among("items", "id", "integer")` for numbers) |
| `record({ field: type })` | a value with fields |
| `list(type)` | a sequence, compared in order |
| `optional(type)` | a value or `null`. In a `record`, a field that is sometimes absent |

Export a type you write in the component file (`export const Todo = record({...})`), so that the interpretation
can import it instead of writing it again.

How a list or record *changes* is not structure: describe the new value as a calculation and store it
(`set({ items: ref.calculation("itemsWithNew") })`).

## Decision tables

```ts
export const Campaign = decisionTable({
  "The customer is a Gold member": { discountPercent: 20, coupon: "Premium" },
  otherwise: { discountPercent: 0, coupon: null },     // null: this row has no value for the column
});
```

`otherwise` is required, every row has the same columns, a column holds one kind of value, and a cell a row does
not use is `null` — never a filler. Numbers that are rules (limits, days, fees) belong here: changing a value
does not require interpreting again.

## Values and references (in the interpretation, and in `asks`)

| Write | Means |
| --- | --- |
| a constant | that value |
| `ref.input("field")` | the command's input |
| `ref.data("field")` | remembered data |
| `ref.query("name")` | the answer of a query without input, or a name given in `asks` |
| `ref.decision("table", "column")` | the column's value in the row that holds |
| `ref.calculation("name")` | a calculation's result |
| `ref.was("STATE", ...)` | whether the state before the command was one of these |

In `asks`, only constants, `ref.input(...)` and `ref.data(...)` are allowed.

Conditions and calculations see, under one name each: `status`, the remembered data, the answers of queries without
input, the command's input, and the names given in `asks`. These names must not collide.

## After a change

| You changed | Then |
| --- | --- |
| a value in a decision table | nothing; run `clp apply` |
| the wording of a sentence, meaning the same | `clp interpret --accept` (checks, then re-stamps) |
| anything else in Layer 1 | `clp interpret` (only what changed is redone), read the report, `--accept`, then `clp apply` |

## What `clp compile` reports

Every message is `severity[code] where: message`. Errors stop `clp apply` before any agent runs.

| Code | Severity | Means |
| --- | --- | --- |
| `misplaced`, `too-many`, `duplicate`, `unknown` | error | a part written where it does not belong, twice, under the same name, or a bare `{}`; with the file and line |
| `not-yet` | error | a word that is designed but not implemented yet |
| `unbound-specification`, `stale-interpretation` | error | no interpretation, or Layer 1 changed after it was derived |
| `bad-interpretation` | error | the interpretation overrides Layer 1, or misses a command or case |
| `name-collision`, `unknown-state`, `bad-decision`, `bad-type` | error | names that collide, an initial state that is not a state, a table without `otherwise` or with mixed kinds in a column, an impossible range or an empty enumeration |
| `unknown-effect`, `missing-field`, `bad-value`, `bad-response`, `missing-response`, `bad-promise` | error | references and values that do not fit what is declared |
| `unbound-condition`, `unbound-calculation`, `unbound-invariant` | error | a sentence without a meaning in the interpretation |
| `unreachable-state`, `unreachable-command` | error | no command leads there |
| `unused-effect`, `unset-data`, `unasked-query` | warning | declared, never used |
| `spec-check` | error | running the spec alone: two conditions held at once, an invariant broke, a value did not fit, a meaning function read a name the spec does not have |
| `unobservable-value` | error / warning | a decision-table value that changes nothing the tests can see (an unused column, a filler, a limit written as `onlyIf`, a threshold out of reach) |
| `unreached-case` | warning | a case that never held when the spec was run |
| `type-error` | error | the spec files do not type-check |
