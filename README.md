# co-llm-piler : Use LLM as a Compiler / Compiler Agent

## Current Scope

Phase 1 spike. TypeScript targets only.

**What works today**

- **Write a spec as TypeScript data.** A component is described by its boundary and structure: states, actions
  and their inputs, queries to dependencies, commands to dependencies, and remembered data. Conditions,
  formulas, and invariants are written as natural-language names and bound to functions separately.
- **Have an LLM draft the binding.** The draft is kept out of use until a person has reviewed it, and it
  flags names that can be read in more than one way.
- **Check the spec on its own.** Type errors, conflicting conditions, missing bindings, broken invariants, and
  values that do not fit their declared type are reported before any implementation exists.
- **Have an LLM agent write the production code from the spec**, test-first, in three isolated sessions:
  design a skeleton, wire it to the test harness, then implement it. The framework generates test-side code
  only and places nothing in production code.
- **Verify the result.** Property-based tests run sequences of actions and shrink failures to the shortest
  sequence; a mutation gate confirms that the tested behaviour really comes from production code. Failures go
  back to the agent until it passes.

## Future Scope

- Drafting the component itself from requirements written in natural language
- Stopping after the design step so a person can review the skeleton before it is wired and implemented
- Help with triaging surviving mutations: logic the spec cannot exercise versus code that is not needed
- Operations that return values (value objects), and multiplicity declared as values
- Composing components, and describing the UI layer
- Target languages other than TypeScript (Go, Rust)
- A single `aac` command in place of the current scripts
- Stronger agent isolation (containers)
- Diagrams generated from the IR, and a trace visualizer
- Larger specs: how often the agent succeeds, and whether the feedback loop converges

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

A spec is one **component** plus its **binding**. A scenario, a domain part, and a UI part are all written as
components of the same shape.

**Boundary and structure** (`specs/order.component.ts`). Pure data: no functions. Types are derived from it.

```ts
const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

const OrderBoundary = defineComponent({
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  data: { rank: Rank, price: Yen },                       // what the order remembers
  queries: {                                              // what it asks its dependencies
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },
  commands: {                                             // what it does to its dependencies
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    // ...
  },
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": "integer",
  },
  invariants: ["Every order past the draft state has a member rank and a price"],
  actions: {                                              // what drives it: input, allowed states, preconditions
    PlaceOrder: { input: { customerRank: Rank, listPrice: Yen }, from: ["DRAFT"] },
    Checkout: { from: ["PENDING"], where: ["The external payment module is active"] },
    Ship: { from: ["PAID"] },
    Cancel: { from: ["PENDING", "PAID"] },
  },
});
```

**A decision table** (same file). Each row is a condition in natural language; cells are constants.

```ts
export const CampaignRules = {
  "The customer is a Gold member and it is month-end": {
    discountPercent: 20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "The customer is a Silver member": { discountPercent: 5, effects: [] },
  "default": { discountPercent: 0, effects: [] }
} as const satisfies DecisionTable<{ discountPercent: number; effects: Command[] }>;
```

**Cases** (same file). Attaching what each action does completes the component. An action that does not
branch is a single function; one that branches is a table keyed by conditions. A case contains no logic: it
applies tables and formulas and maps the results to a transition.

```ts
export const Order = OrderBoundary.cases({
  PlaceOrder: (state) => state.PENDING({
    event: "Order placed",
    set: { rank: state.customerRank, price: state.listPrice },
    effects: [{ action: "SendOrderConfirmation", payload: {} }]
  }),

  Checkout: {
    "The payment succeeded": (state) => {
      const campaign = applyDecision(CampaignRules, state);
      const amount = applyFormula(OrderBoundary, "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen", state);

      return state.PAID({
        event: "Payment completed",
        effects: [
          { action: "SendReceipt", payload: { discountPercent: campaign.discountPercent, amount } },
          ...campaign.effects
        ]
      });
    },
    "default": (state) => state.PENDING({
      event: "Payment failed",
      effects: [{ action: "NotifyPaymentFailure", payload: {} }]
    })
  },
  // ...
});
```

**The binding** (`specs/order.binding.ts`). This is what the names mean. It is the oracle for the tests and is
never shown to the agent. A missing binding, or a condition that nothing uses, is a compile error.

```ts
export const Specification = bindSpecification(Order, {
  tables: { CampaignRules, CancelRules, ShippingRules },
  conditions: {
    "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
    "The customer is a Silver member": (state) => state.rank === "Silver",
    "The payment succeeded": (state) => state.paymentResult === "succeeded",
    // ...
  },
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": (state) =>
      Math.floor(((state.price ?? 0) * (100 - applyDecision(CampaignRules, state).discountPercent)) / 100)
  },
  invariants: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined)
  }
});
```

The binding does not have to be written from scratch. An agent can draft it:

```bash
pnpm -s run draft-binding \
  --agent 'claude -p "Read aac/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

The draft goes to `specs/order.binding.draft.ts` and is ignored until you have read it and dropped `.draft`
from its name, because the binding is what the implementation is judged against. (For unattended runs,
`implement --drafts` uses the draft as it is; the result then records that the oracle was not reviewed.) The agent marks the names
it found ambiguous:

```ts
// REVIEW: "the order is 10,000 yen or more" is read as the remembered `price` (the list price at
// PlaceOrder). It could also mean the amount actually charged after the campaign discount, which
// differs for discounted orders (e.g. a Silver order of 10,000 yen is charged 9,500 yen).
"The customer is a Gold member, or the order is 10,000 yen or more": (state) => {
  return state.rank === "Gold" || (state.price !== undefined && state.price >= 10_000);
},
```

### 2. Check the spec

```bash
pnpm -s run ir
```

This type-checks the spec, checks it on its own, and prints the IR: the spec as language-independent JSON. The names stay as
text and the bound functions are left out, so the IR says *what* must hold but not *how* to compute it.

```json
"The payment succeeded": {
  "nextState": "PAID",
  "emittedCommands": [
    { "action": "SendReceipt",
      "payload": {
        "discountPercent": { "$ref": "decision:CampaignRules.discountPercent" },
        "amount": { "$ref": "formula:Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen" } } },
    { "$spread": "decision:CampaignRules.effects" }
  ]
}
```

### 3. Have an agent implement it

```bash
pnpm -s run implement --out examples/checkout-ts --fresh \
  --agent 'claude -p "Read aac/REQUEST.md and carry out the request." --permission-mode acceptEdits'
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
const OrderBoundary = defineComponent({
  assets: [
    file("docs/architecture.md"),                     // a file
    dir("docs/conventions"),                          // every file in a directory
    text("Money is always handled as whole yen."),    // a short note, put straight into the request
  ],
  initial: "DRAFT",
  // ...
});
```

A second argument chooses the steps an asset goes to, for example `text("...", { phases: ["wiring"] })`.

```text
[1] design #1: ok
[1] wiring #1: ok (tests fail as expected: not implemented)
[1] implementation #1: pass (mutation: builtin, 8/22 killed)
```

Here every step passed on its first attempt. The mutations that survived are reported but do not fail the
run: the agent chose to have its calendar return a date and to compute "month-end" itself, and the spec, which
only speaks of a month-end flag, cannot exercise that calendar logic. A run fails only when changing a value
from a decision table leaves the tests passing.

### 4. What you get

```text
examples/checkout-ts/
├── src/                      written by the agent; no framework imports, no framework types
│   ├── types.ts
│   ├── dependencies.ts       the dependencies, in the production code's own terms
│   ├── rules.ts              the business decisions, as pure functions
│   ├── order.ts
│   └── index.ts
└── aac/                      the test side
    ├── ir.json               generated
    ├── adapter.contract.ts   generated
    ├── verify.ts             generated
    └── adapter.ts            skeleton generated, filled in by the agent
```

**Production code** (`src/rules.ts`). The agent turned the natural-language names into code: the decision
table, the formula with its rounding, and the 10,000-yen threshold.

```ts
export function selectCampaignOffer(rank: CustomerRank, today: CalendarDate): CampaignOffer {
  if (rank === "Gold" && isMonthEnd(today)) {
    return { discountPercent: 20, coupons: ["Premium"] };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupons: [] };
  }
  return { discountPercent: 0, coupons: [] };
}

export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

export function isPriorityShipment(rank: CustomerRank, price: number): boolean {
  return rank === "Gold" || price >= 10000;
}
```

**The adapter** (`aac/adapter.ts`). Production code defines its dependencies in its own terms; the adapter
connects them to the stand-ins the test harness provides, translating where the two differ. Here the
production calendar returns a date, while the spec speaks of a month-end flag.

```ts
const MONTH_END_DAY: CalendarDate = { year: 2026, month: 1, day: 31 };
const ORDINARY_DAY: CalendarDate = { year: 2026, month: 1, day: 15 };

function dependenciesFor(ports: Ports): OrderDependencies {
  return {
    calendar: {
      today: () => (ports.queries.isMonthEnd() ? MONTH_END_DAY : ORDINARY_DAY),
    },
    payments: {
      isActive: () => ports.queries.paymentModuleActive(),
      charge: (_amount) => ports.queries.paymentResult(),
      refund: () => ports.commands.Refund({}),
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

When an implementation is wrong, the test reports the shortest sequence of actions that shows it. For an
implementation that forgets the refund when a paid order is cancelled:

```text
PlaceOrder  →  Checkout (The payment succeeded)  →  Cancel
expected: state CANCELLED, commands [Refund]
actual:   state CANCELLED, commands []
```
