# co-llm-piler : Use LLM as a Compiler / Compiler Agent

## Current Scope

Phase 1 spike. TypeScript targets only.

- **Write a spec as TypeScript data. (Spec Driven Development)** Decision tables, plus a component described as
  roughly or as precisely as you like: prose alone, or prose with structure wherever you want to pin something
  down (states, inputs, transitions). No functions. An LLM derives the rest — the missing structure, and the
  meaning of every sentence — into an *interpretation* that you review; it can never override the structure you wrote.
- **Have an LLM agent write the production code from the spec (Harness/Loop Engineering)**, test-first, in three isolated sessions:
  design a skeleton, wire it to the test harness, then implement it. The framework generates test-side code
  only and places nothing in production code.
- **Run it again when the spec changes.** The same command brings the code back into agreement with the spec:
  only the steps the change calls for are run, existing code is kept, and the agent is first shown where the
  current code falls short. If nothing changed, it only verifies.

## Requirements and Setup

- Node.js 22.18 or later (`.node-version` pins 24)
- pnpm

```bash
pnpm install
```

There is no build step. Node runs the `.ts` files directly.
## Example

The repository contains one example, end to end: the spec of an order that is placed, paid, shipped, or
cancelled (`specs/`), and the implementation an LLM agent wrote from it (`examples/checkout-ts/`).
`examples/co-llm-piler/` describes parts of the framework itself in the same way.

### 1. Write the spec

You write **decision tables** and a **component**. A scenario, a domain part, and a UI part are all written
as components of the same shape. Neither contains a function.

**Decision tables** (`specs/order.decisions.ts`). Each row is a condition in natural language; cells are
values, or `null` where a row gives no value for a column. `otherwise` is mandatory.

```ts
export const Campaign = decisionTable({
  "The customer is a Gold member and it is month-end": { discountPercent: 20, grantsCoupon: true, coupon: "Premium" },
  "The customer is a Silver member": { discountPercent: 5, grantsCoupon: false, coupon: null },
  otherwise: { discountPercent: 0, grantsCoupon: false, coupon: null },
});
```

**The component** (`specs/order.component.ts`). The roughest form is prose alone:

```ts
export const Order = component(description("An order: placed by a customer, paid, then shipped or cancelled. ..."));
```

From there, write as structure only what you want to pin down. Every part is either prose (`description`) or
structure, and a command is composed from parts:

```ts
const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

export const Order = component({
  description: "An order: placed by a customer, paid through an external payment module, then shipped or cancelled.",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  init: "DRAFT",
  data: { rank: Rank, price: Yen },                       // what the order remembers
  queries: {                                              // what it asks its dependencies
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },
  effects: {                                              // what it does to its dependencies
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    // ...
  },
  decisions: { campaign: Campaign, shipping: Shipping },
  calculations: {
    amountCharged: { is: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen", type: "integer" },
  },
  invariants: ["Every order past the draft state has a member rank and a price"],

  commands: {                                             // what drives it from outside
    // fully structured: input, where it applies, where it leads
    PlaceOrder: compose(
      input({ customerRank: Rank, listPrice: Yen }),
      from("DRAFT"),
      goTo("PENDING"),
      does("The order remembers the customer's rank and the list price. An order confirmation is sent."),
    ),
    Checkout: compose(
      from("PENDING"),
      onlyIf("The external payment module is active"),
      when(
        "The payment succeeded",
        goTo("PAID"),
        does("A receipt is sent with the campaign's discount percent and the amount charged. Then a coupon is issued if the campaign grants one."),
      ),
      otherwise(does("The customer is notified of the payment failure.")),   // no goTo: the state stays
    ),
    // partly structured: the resulting state is left to the prose
    Ship: compose(from("PAID"), does("The order becomes shipped. A shipping notice is sent, with priority as the shipping decision says.")),
    // prose only
    Cancel: description("A pending or paid order can be cancelled. If the order had been paid, a refund is issued."),
  },
});
```

Parts are values, so a fragment shared by several commands is written once (`const rejected = compose(when(...), otherwise(...))`).

### 2. Have an LLM interpret it

```bash
pnpm -s run interpret \
  --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

The agent writes the **interpretation**: the structure Layer 1 left as prose, and the meaning of every
sentence as a function. You do not write this file.

```ts
// specs/order.interpretation.ts — generated
export const Interpretation = interpretation(Order, {
  // structure: declarations and references, no functions. It goes into the IR.
  structure: {
    commands: {
      PlaceOrder: {
        set: { rank: ref.input("customerRank"), price: ref.input("listPrice") },
        effects: [{ SendOrderConfirmation: {} }],
      },
      Checkout: {
        when: {
          "The payment succeeded": {
            effects: [
              { SendReceipt: { discountPercent: ref.decision("campaign", "discountPercent"), amount: ref.calculation("amountCharged") } },
              { IssueCoupon: { type: ref.decision("campaign", "coupon") }, when: ref.decision("campaign", "grantsCoupon") },
            ],
          },
          otherwise: { effects: [{ NotifyPaymentFailure: {} }] },
        },
      },
      Ship: { goTo: "SHIPPED", effects: [{ SendShippingNotice: { priority: ref.decision("shipping", "priority") } }] },
      Cancel: { from: ["PENDING", "PAID"], goTo: "CANCELLED", effects: [{ Refund: {}, when: ref.was("PAID") }] },
    },
  },

  // meanings: functions. The oracle for the tests; never shown to the implementing agent.
  meanings: {
    conditions: {
      "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
      "The payment succeeded": (state) => state.paymentResult === "succeeded",
      // ...
    },
    calculations: {
      amountCharged: (state) =>
        Math.floor(((state.price ?? 0) * (100 - decide(Order, "campaign", state).discountPercent)) / 100),
    },
    // ...
  },
});
```

The interpretation **cannot override structure written in Layer 1**: where you gave states, an input, `from`,
a `goTo`, or the cases of a `when`, it may only add what is missing. It is type-checked against Layer 1, and
run on its own over random command sequences, before it is written out.

Because the interpretation is what the implementation is judged against, it is not used until you accept it.
It goes to `specs/order.interpretation.draft.ts`, and you are told where the prose was ambiguous, in two ways:

- **Questions the agent left** (`// REVIEW:`). From a deliberately rough version of this component (vocabulary
  and most commands as prose):

  ```text
  the member ranks are not listed anywhere, so the rank is kept as free text
  Layer 1 mentions a "discounted amount" but states no discount rule
  "a coupon may be issued" gives no condition. Month-end is assumed, only because that query is declared
  "good customers" is not defined
  ```

- **Where another reading behaves differently.** A second session interprets the same prose without seeing
  the first (only the vocabulary is shared), and is asked to take, wherever the prose leaves room, a reading
  that is defensible but not the most obvious one. Both are run on the same command sequences, and each
  disagreement is reported as the shortest sequence that shows it:

  ```text
  Ship: PlaceOrder {"memberRank":"SILVER", ...} → Checkout {...} → Ship {...}
    first:  state SHIPPED, effects [ShippingNotice {priority: false}]
    second: state SHIPPED, effects [ShippingNotice {priority: true}]
  ```

  `--sessions <n>` sets the number of sessions (default 2; `1` skips the comparison). In our trials the
  second session found every command with a disagreement, and a third and fourth added none.

To resolve them, **make Layer 1 more precise** (add a decision table, a state, a `goTo`) and run `interpret`
again; only what the change affects is redone. When nothing is left to resolve, read the draft and accept it:

```bash
pnpm -s run interpret --accept
```

The interpretation records the Layer 1 it was derived from. If Layer 1 changes afterwards, the interpretation
is stale and nothing runs until it is derived again (or accepted again, when you only reworded a sentence).
Changing a value in a decision table does not make it stale. For unattended runs, `implement --drafts` uses
the draft as it is; the result then records that the oracle was not reviewed.

### 3. Check the spec

```bash
pnpm -s run ir
```

This type-checks the spec, checks it on its own, and prints the IR: the spec as language-independent JSON. The
prose and the structure are both there, under the same keys as in the spec, wherever they were written; the
functions of the interpretation are left out, so the IR says *what* must hold but not *how* to decide it.

```json
"The payment succeeded": {
  "goTo": "PAID",
  "does": "A receipt is sent with the campaign's discount percent and the amount charged. Then a coupon is issued if the campaign grants one.",
  "effects": [
    { "name": "SendReceipt",
      "payload": {
        "discountPercent": { "$ref": "decision:campaign.discountPercent" },
        "amount": { "$ref": "calculation:amountCharged" } } },
    { "name": "IssueCoupon",
      "payload": { "type": { "$ref": "decision:campaign.coupon" } },
      "when": { "$ref": "decision:campaign.grantsCoupon" } }
  ]
}
```

### 4. Have an agent implement it

```bash
pnpm -s run implement --out examples/checkout-ts --fresh \
  --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

Any command can be the agent. The work follows a test-driven flow in three steps, each a separate session
that sees different things:

| Step | The agent sees | The agent writes | Then the framework checks |
| --- | --- | --- | --- |
| 1. Design | the IR | a skeleton of the production code: signatures, no behaviour | that it type-checks and loads |
| 2. Wiring | the test harness contract and the skeleton, **not the IR** | the adapter | that it type-checks, and that the tests **fail** because nothing is implemented yet |
| 3. Implementation | the IR and the skeleton, **not the adapter** | the bodies | that it still type-checks against the adapter, that the tests pass, and the mutation gate |

Because the wiring step never sees the spec, the adapter cannot make business decisions; because the other two
steps never see the test harness, production code is not shaped by it. Each session runs in a temporary
directory outside the repository, and a failed check is sent back to the same step for another attempt.

To pass project conventions to the agent (architecture rules, naming, a glossary), declare them in the
component. They are attached to the design and implementation requests:

```ts
export const Order = component({
  assets: [
    file("docs/architecture.md"),                     // a file
    dir("docs/conventions"),                          // every file in a directory
    text("Money is always handled as whole yen."),    // a short note, put straight into the request
  ],
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // ...
});
```

A second argument chooses the steps an asset goes to, for example `text("...", { phases: ["wiring"] })`.

```text
[1] design #1: ok
[1] wiring #1: ok (tests fail as expected: not implemented)
[1] implementation #1: pass (mutation: builtin, 9/12 killed)
```

Here every step passed on its first attempt. A run fails when changing a value from a decision table leaves
the tests passing; other surviving mutations are reported but do not fail the run (here, constants in the
agent's own month-end calendar logic, which the spec's month-end flag cannot exercise).

The specs directory may hold several components. They share the production code, and each gets its own
test-side files, named after it (`clp/order.adapter.ts`). All of them are brought into agreement in turn
(`--component <name>` picks one); after a change for one component the others are verified again, and a change
that breaks one of them is sent back.

By default the production code goes to `<out>/src` and the test side to `<out>/clp`. To follow another
layout, name the two places directly:

```bash
# src/ and test/ kept apart
pnpm -s run implement --src app/src --tests test/clp --agent '...'

# side by side: src/order/order.ts next to src/order/clp.order.adapter.ts, clp.order.ir.json, ...
pnpm -s run implement --src src/order --tests src/order/clp. --agent '...'
```

`--tests` is the path put in front of the test-side file names: when it ends with a `.`, its last part is a
file-name prefix; otherwise it is a directory. The directory given as `--src` is rewritten by the agent, so it
must not be a project root.

### 5. What you get

```text
examples/checkout-ts/
├── src/                      written by the agent; no framework imports, no framework types
│   ├── types.ts
│   ├── ports.ts              the dependencies, in the production code's own terms
│   ├── policy.ts             the business decisions, as pure functions
│   ├── order.ts
│   └── index.ts
└── clp/                      the test side
    ├── order.ir.json               generated
    ├── order.adapter.contract.ts   generated
    ├── order.verify.ts             generated
    └── order.adapter.ts            skeleton generated, filled in by the agent
```

**Production code** (`src/policy.ts`). The agent turned the natural-language conditions into code: the
decision table, the calculation with its rounding, and the 10,000-yen threshold.

```ts
export function decideCampaign(rank: MemberRank, today: CalendarDate): CampaignTerms {
  if (rank === "Gold" && isMonthEnd(today)) {
    return { discountPercent: 20, coupon: "Premium" };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupon: null };
  }
  return { discountPercent: 0, coupon: null };
}

export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

export function isPriorityShipping(rank: MemberRank, price: number): boolean {
  return rank === "Gold" || price >= PRIORITY_SHIPPING_MIN_PRICE;
}
```

**The adapter** (`clp/order.adapter.ts`). Production code defines its dependencies in its own terms; the adapter
connects them to the stand-ins the test harness provides, translating where the two differ. Here the
production calendar returns a date, while the spec speaks of a month-end flag.

```ts
const MONTH_END_DATE = { year: 2025, month: 1, day: 31 };
const MID_MONTH_DATE = { year: 2025, month: 1, day: 15 };

function connect(ports: Ports): OrderDependencies {
  return {
    calendar: {
      today: () => (ports.queries.isMonthEnd() ? MONTH_END_DATE : MID_MONTH_DATE),
    },
    payments: {
      isActive: () => ports.queries.paymentModuleActive(),
      charge: () => ports.queries.paymentResult(),
      refund: () => ports.effects.Refund({}),
    },
    // ...
  };
}
```

### 6. Verify again at any time

```bash
pnpm --filter example-checkout-ts verify     # property-based test against the example
pnpm typecheck                               # type-check the specs and the framework
pnpm test                                    # the framework's own tests
```

When an implementation is wrong, the test reports the shortest sequence of commands that shows it. For an
implementation that forgets the refund when a paid order is cancelled:

```text
PlaceOrder  →  Checkout (The payment succeeded)  →  Cancel
expected: state CANCELLED, effects [Refund]
actual:   state CANCELLED, effects []
```

## Future Scope

- Holding back a run until the questions an LLM left in an interpretation (`// REVIEW:`) and the
  disagreements between two interpretations have been looked at (today they are only reported)
- Comparing the vocabulary of two interpretations (today the second session is given the first one's states,
  commands, queries and effects)
- Queries that take arguments, so that what a component asked about is verified too
- Describing the framework itself in the framework (`examples/co-llm-piler`): so far its pipeline and one of
  its checks
- Stopping after the design step so a person can review the skeleton before it is wired and implemented
- Applying a spec to existing production code (legacy code): wiring and verification only, with mismatches
  reported to a person instead of being sent back to the agent (design notes in `INCREMENTAL.md`)
- A writable scope narrower than "everything under `--src`" when several components share production code
- Help with triaging surviving mutations: logic the spec cannot exercise versus code that is not needed
- Operations that return values (value objects), and multiplicity declared as values
- Composing components (connecting one component's dependency to another real component instead of a stand-in),
  and describing the UI layer
- Target languages other than TypeScript (Go, Rust, Python). The per-language parts (test-side generation,
  running the tests, static checks, mutation) already sit behind one interface, but TypeScript is its only
  implementation
- A single `clp` command in place of the current scripts
- Stronger agent isolation (containers)
- Diagrams generated from the IR, and a trace visualizer
- Larger specs: how often the agent succeeds, and whether the feedback loop converges
