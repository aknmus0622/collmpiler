# co-llm-piler : Use LLM as a Compiler / Compiler Agent

## Current Scope

Phase 1 spike. TypeScript targets only.

- **Write a spec as TypeScript data. (Spec Driven Development)** Decision tables, plus a component: its vocabulary (states, remembered
  data, queries to and effects on dependencies), the skeleton of its state machine, and what each command does
  in prose. No functions. A separate binding says what the prose means: the structure of each command as
  declarations, and the meaning of each condition, calculation, and invariant as functions.
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

### 1. Write the spec

A spec is **decision tables**, one **component**, and its **binding**. A scenario, a domain part, and a UI
part are all written as components of the same shape.

**Decision tables** (`specs/order.decisions.ts`). Each row is a condition in natural language; cells are
values, or `null` where a row gives no value for a column. `otherwise` is mandatory.

```ts
export const Campaign = decisionTable({
  "The customer is a Gold member and it is month-end": { discountPercent: 20, grantsCoupon: true, coupon: "Premium" },
  "The customer is a Silver member": { discountPercent: 5, grantsCoupon: false, coupon: null },
  otherwise: { discountPercent: 0, grantsCoupon: false, coupon: null },
});
```

**The component** (`specs/order.component.ts`). Vocabulary, the skeleton of the state machine, and prose. It
contains no functions; types are derived from it.

```ts
const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

export const Order = component({
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
    PlaceOrder: {
      input: { customerRank: Rank, listPrice: Yen },
      from: ["DRAFT"],
      then: {
        goTo: "PENDING",
        does: "The order remembers the customer's rank and the list price. An order confirmation is sent.",
      },
    },
    Checkout: {
      from: ["PENDING"],
      onlyIf: ["The external payment module is active"],
      when: {
        "The payment succeeded": {
          goTo: "PAID",
          does:
            "A receipt is sent with the campaign's discount percent and the amount charged. " +
            "Then a coupon is issued if the campaign grants one.",
        },
        otherwise: { goTo: "PENDING", does: "The customer is notified of the payment failure." },
      },
    },
    Cancel: {
      from: ["PENDING", "PAID"],
      then: { goTo: "CANCELLED", does: "If the order had been paid, a refund is issued." },
    },
    // ...
  },
});
```

**The binding** (`specs/order.binding.ts`). It has two parts. `commands` is the *structure*: what each `does`
sentence means, written as declarations and references (`ref.*`). It goes into the IR. The rest is the *meaning*: what
each name refers to, written as functions. That is the oracle for the tests and is never shown to the agent.
A missing entry, an unknown name, or a reference of the wrong type is a compile error.

```ts
export const Binding = bind(Order, {
  commands: {
    PlaceOrder: {
      set: { rank: ref.input("customerRank"), price: ref.input("listPrice") },
      effects: [{ SendOrderConfirmation: {} }],
    },
    Checkout: {
      "The payment succeeded": {
        effects: [
          { SendReceipt: { discountPercent: ref.decision("campaign", "discountPercent"), amount: ref.calculation("amountCharged") } },
          { IssueCoupon: { type: ref.decision("campaign", "coupon") }, when: ref.decision("campaign", "grantsCoupon") },
        ],
      },
      otherwise: { effects: [{ NotifyPaymentFailure: {} }] },
    },
    Cancel: { effects: [{ Refund: {}, when: ref.was("PAID") }] },
    // ...
  },

  conditions: {
    "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
    "The customer is a Silver member": (state) => state.rank === "Silver",
    "The payment succeeded": (state) => state.paymentResult === "succeeded",
    // ...
  },
  calculations: {
    amountCharged: (state) =>
      Math.floor(((state.price ?? 0) * (100 - decide(Order, "campaign", state).discountPercent)) / 100),
  },
  invariants: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined),
  },
});
```

The binding does not have to be written from scratch. An agent can draft it, structure and meaning both:

```bash
pnpm -s run draft-binding \
  --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

The draft goes to `specs/order.binding.draft.ts` and is ignored until you have read it and dropped `.draft`
from its name, because the binding is what the implementation is judged against. (For unattended runs,
`implement --drafts` uses the draft as it is; the result then records that the oracle was not reviewed.) The
agent marks what it found ambiguous:

```ts
// REVIEW: "the order is 10,000 yen or more" is read as the remembered list price. It could also mean the
// amount charged after the campaign discount; the two differ for e.g. a Silver order of 10,000 yen
// (charged 9,500).
"The customer is a Gold member, or the order is 10,000 yen or more": (state) => {
  return state.rank === "Gold" || (state.price !== undefined && state.price >= 10_000);
},
```

### 2. Check the spec

```bash
pnpm -s run ir
```

This type-checks the spec, checks it on its own, and prints the IR: the spec as language-independent JSON. The
prose and the structure are both there, under the same keys as in the spec; the bound functions are left out, so the IR says *what* must hold but
not *how* to decide it.

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

### 3. Have an agent implement it

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

### 4. What you get

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

### 5. Verify again at any time

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

- Drafting the component itself from requirements written in natural language
- Alerts from the review notes an LLM leaves in a draft binding (`// REVIEW:`): collecting them, reporting
  them, and holding back a run until the ambiguous names they point at have been looked at
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
