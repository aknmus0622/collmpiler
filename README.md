# co-llm-piler : Use LLM as a Compiler / Compiler Agent

## Current Scope

Phase 1 spike. TypeScript targets only.

**What works today**

- **Write a spec as TypeScript data.** A component is described by its boundary: actions and their inputs,
  queries to dependencies, commands to dependencies, and remembered data. Conditions, formulas, and invariants
  are written as natural-language names and bound to functions separately.
- **Check the spec on its own.** Conflicting conditions, missing bindings, broken invariants, and values that
  do not fit their declared type are reported before any implementation exists.
- **Have an LLM agent write the production code from the spec**, in an isolated directory. The framework
  generates test-side code only and places nothing in production code.
- **Verify the result.** Property-based tests run sequences of actions and shrink failures to the shortest
  sequence; a mutation gate confirms that the tested behaviour really comes from production code. Failures go
  back to the agent until it passes.

## Future Scope

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

**The boundary of the component** (`specs/order.model.ts`). Everything is a value; types are derived from it.

```ts
const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

export const OrderModel = {
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  data: { rank: Rank, price: Yen },                       // what the order remembers
  actions: {                                              // what drives it, with inputs
    PlaceOrder: { customerRank: Rank, listPrice: Yen },
    Checkout: {}, Ship: {}, Cancel: {},
  },
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
} as const satisfies DomainModel;
```

**A decision table** (`specs/campaign.dmn.ts`). Each row is a condition in natural language.

```ts
export const CampaignRules = {
  "The customer is a Gold member and it is month-end": {
    discountPercent: 20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "The customer is a Silver member": { discountPercent: 5, effects: [] },
  "default": { discountPercent: 0, effects: [] }
} as const satisfies DecisionTable<CampaignOutputs>;
```

**A behaviour** (`specs/order.spec.ts`). Cases are keyed by conditions too. A case contains no logic: it
applies tables and formulas and maps the results to a transition.

```ts
Checkout: {
  from: ["PENDING"],
  where: ["The external payment module is active"],
  cases: {
    "The payment succeeded": (state) => {
      const campaign = applyDecision(CampaignRules, state);
      const amount = applyFormula(OrderModel, "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen", state);

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
  }
},
```

**The binding** (`specs/vocabulary.ts`). This is what the names mean. It is the oracle for the tests and is
never shown to the agent.

```ts
export const Specification = bindSpecification(OrderModel, {
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

### 2. Check the spec

```bash
pnpm -s run ir
```

This checks the spec on its own and prints the IR: the spec as language-independent JSON. The names stay as
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

Any command can be the agent. It runs in a temporary directory outside the repository that contains only the
IR, the adapter contract, an adapter skeleton, and the request. When it finishes, the framework collects its
files, runs the property-based test and the mutation gate, and sends any failure back for another attempt.

```text
[1] strategy: claude -p "Read aac/REQUEST.md and carry out the request." ... (in /tmp/aac-hrDWMt)
[1] exit gate: pass (mutation: builtin, 9/19 killed)
```

Here the agent passed on its first attempt. The mutations that survived are reported but do not fail the
run: they are return values that nothing observes. A run fails only when changing a value from a decision
table leaves the tests passing.

### 4. What you get

```text
examples/checkout-ts/
├── src/                      written by the agent; no framework imports, no framework types
│   ├── rules.ts
│   ├── order.ts
│   └── dependencies.ts
└── aac/                      the test side
    ├── ir.json               generated
    ├── adapter.contract.ts   generated
    ├── verify.ts             generated
    └── adapter.ts            skeleton generated, filled in by the agent
```

**Production code** (`src/rules.ts`). The agent turned the natural-language names into code: the formula with
its rounding, and the 10,000-yen threshold.

```ts
export function campaignFor(rank: MemberRank, isMonthEnd: boolean): Campaign {
  if (rank === "Gold" && isMonthEnd) {
    return { discountPercent: 20, coupon: "Premium" };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupon: null };
  }
  return { discountPercent: 0, coupon: null };
}

/** Price after discount, rounded down to a whole yen. */
export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

export function isPriorityShipment(rank: MemberRank, price: number): boolean {
  if (rank === "Gold" || price >= 10000) {
    return true;
  }
  return false;
}
```

**The adapter** (`aac/adapter.ts`). Production code defines its dependencies in its own terms; the adapter
connects them to the stand-ins the test harness provides.

```ts
order = new Order({
  payments: {
    isAvailable: () => ports.queries.paymentModuleActive(),
    charge: () => ports.queries.paymentResult(),
    refund: () => ports.commands.Refund({}),
  },
  calendar: {
    isMonthEnd: () => ports.queries.isMonthEnd(),
  },
  // ...
});
```

### 5. Verify again at any time

```bash
pnpm --filter example-checkout-ts verify     # property-based test against the example
pnpm test                                    # the framework's own tests
```

When an implementation is wrong, the test reports the shortest sequence of actions that shows it. For an
implementation that forgets the refund when a paid order is cancelled:

```text
PlaceOrder  →  Checkout (The payment succeeded)  →  Cancel
expected: state CANCELLED, commands [Refund]
actual:   state CANCELLED, commands []
```
