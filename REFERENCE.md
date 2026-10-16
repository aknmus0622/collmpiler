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

## Handles: nothing is referred to by a string

Declare the vocabulary first, as groups, and refer to it through the **handles** a group gives. A typo is then a
type error, and the interpretation imports the same handles, so **export every group**.

```ts
export const State = states("DRAFT", "PENDING", "PAID");          // or states({ DRAFT: description("..."), ... })
export const If = conditions({ paid: "The payment succeeded" });   // condition sentences
export const Data = data({ price: Yen });
export const Query = queries({ isMonthEnd: output("boolean") });
export const Effect = effects({ SendReceipt: input({ amount: "integer" }) });
export const Calc = calculations({ charged: component(description("..."), output("integer")) });
export const Inv = invariants({ priced: "Every order past the draft state has a price" });
export const PlaceInput = input({ listPrice: Yen });               // a command's input
```

| Handle | Used as |
| --- | --- |
| `State.PAID` | a state: `from(...)`, `goTo(...)`, `was(...)`, `init` |
| `If.paid` | a condition: `when(...)`, `onlyIf(...)`, `onlyWhen(...)`, a decision-table row |
| `Data.price` | remembered data, as a value; `Data.price.set(value)` stores one |
| `Query.isMonthEnd` | the answer of a query without input |
| `Query.declared({ name: "PAID" }).as("found")` | asks a query that takes an input; its `.answer` is the value |
| `Effect.SendReceipt({ amount: ... })` | performs an effect (`Effect.Refund()` when it carries nothing) |
| `Calc.charged` | a calculation's result |
| `Campaign.discountPercent` | a decision table's column, in the row that holds |
| `PlaceInput.listPrice` | a field of the command's input; a field of a `record` field continues: `PostInput.body.title` |
| `Part.todos.Add({ title: ... })` | executes a command of a contained component (see Parts); its `.answer` is what it answered |

A group is placed in the component under its key (`states: State`, `data: Data`, ...). Condition groups are only
declared. Writing a group inline (`data: { price: Yen }`) means the same, but then nothing can refer to it.

## Parts: components inside a component

A component can contain other components and execute their commands. Declare them with `parts`, place them
under `parts`, and call their commands from a command, before its cases:

```ts
export const Part = parts({ todos: Todos });          // Todos is an exported component with its own interpretation
export const TodoApi = component({
  parts: Part,
  commands: {
    PostTodos: component(
      route("POST /todos"),                            // how the command reaches the system (part of the contract)
      PostTodosInput,
      Part.todos.Add({ title: PostTodosInput.body.title }),
      output(record({ status: integer({ min: 200, max: 599 }), body: optional(Todo) })),
      does("Created: 201, with the new item. Invalid: 422, with no body."),
    ),
  },
});
```

The expected outcome comes from running both specifications together. What is observed is the outer
component's answer and every effect on the outside world, the contained component's included (named
`todos.<Effect>`); the contained component's state is not. Its dependencies appear in the outer contract as
`todos.<name>`. Meaning functions read an answer as `state.todos.Add`. Use `.as("name")` to call the same command
twice. `among(Data.items, "id")` may name data the contained component remembers.

A component with parts is reconciled after them; its agent sees its own IR and the contained components'
production code (not their IR), may not change that code, and its mutations stay in its own code. It is
verified with fewer runs by default (500).

With `route("METHOD /path")` on its commands, the component is reached over HTTP: a path segment `:name` is the
input field `name`, the input field `body` is the JSON body, every other field is a query parameter, and the
answer's `status` and `body` are the response.

## The one rule

Every entry is **prose**, **parts**, or **both bundled with `component(...)`**. Write as structure only what you want
to pin down; the interpretation fills in the rest and can never override what you wrote.

```ts
Cancel: description("A pending or paid order can be cancelled."),       // prose
Ship: component(from(State.PAID), goTo(State.SHIPPED)),                  // parts
Pay: component(from(State.PENDING), does("The payment is taken.")),      // both
```

A `component(...)` with no name dissolves into wherever it is placed, so a fragment is shared by putting it in a
variable: `const refused = component(when(If.refused, responds("refused")), otherwise())`.

`{ ... }` is always shorthand for a list of named things, and the word that receives it says what they are:
`commands: {...}` names commands, `input({...})` names fields and their types, `integer({...})` holds settings.
A bare `{ ... }` is never a type.

## The component

```ts
export const Order = component({
  description: "...",                     // the component as a whole
  states: State,                          // leave out states and init for a stateless component
  init: State.DRAFT,
  data: Data,                             // what it remembers between commands
  queries: Query,                         // what it asks its dependencies
  effects: Effect,                        // what it does to its dependencies
  decisions: { campaign: Campaign },      // the decision tables it uses; the key names the table
  calculations: Calc,                     // values defined by a sentence
  invariants: Inv,                        // sentences that always hold
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
| an input handle (`PlaceInput`) | what the command takes |
| `output(type)` | what the command answers with. Every case must then `responds(...)` |
| `from(State.A, State.B)` | the states it can be executed in (all, if absent) |
| `onlyIf(If.x)` | a precondition. **Outside it, nothing is tested.** Use it only for what cannot happen; a refusal is a `when` case |
| `Query.q({ field: value }).as("answer")` | asks a query that takes an input; the answer is read as `answer` |
| `when(If.x, ...)` | one case. At most one case holds at a time |
| `otherwise(...)` | the case when none holds. Required once there is a `when` |

What happens, directly in the command or inside a case:

| Part | Meaning |
| --- | --- |
| `goTo(State.X)` | the resulting state. **Absent: the state stays** |
| `Data.field.set(value)` | the data to remember |
| `Effect.Name({ field: value }, onlyWhen(...))` | an effect, in order. `onlyWhen` (a condition or a boolean handle) performs it only sometimes; it is not exclusive like `when` |
| `responds(value)` / `responds({ field: value })` | the answer |
| `does("...")` | what happens, in prose |

Storing data and performing effects are written by the interpretation; in Layer 1, say them with `does("...")`.

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

Export a type you write in the component file (`export const Todo = record({...})`), so that the interpretation
can import it instead of writing it again.

How a list or record *changes* is not structure: describe the new value as a calculation and store it
(`Data.items.set(Calc.itemsWithNew)`).

## Decision tables

```ts
export const CampaignIf = conditions({ gold: "The customer is a Gold member" });
export const Campaign = decisionTable(
  when(CampaignIf.gold, { discountPercent: 20, coupon: "Premium" }),
  otherwise({ discountPercent: 0, coupon: null }),     // null: this row has no value for the column
);
```

`otherwise` is required, every row has the same columns, a column holds one kind of value, and a cell a row does
not use is `null` — never a filler. Numbers that are rules (limits, days, fees) belong here: changing a value
does not require interpreting again. The table is named by the key it is placed under (`decisions: { campaign: Campaign }`).

## Values (in the interpretation, and in asked queries)

A value is a constant or a handle: an input field, data, a query answer, a decision-table column, a calculation, or
`was(State.A, ...)` (whether the state before the command was one of these). A query is asked only with
constants, input fields and data.

## Meanings (in the interpretation)

`meanings` is a list of functions attached to handles: `If.paid.means((state) => ...)`, `Calc.charged.means(...)`,
`Inv.priced.means(...)`. Inside one, `Campaign.of(state)` is the row that holds and `Calc.charged.of(state)` another
calculation's result.

Conditions and calculations see, under one name each: `status`, the remembered data, the answers of queries without
input, the command's input, and the names given to asked answers. These names must not collide.

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
