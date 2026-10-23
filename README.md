# co-llm-piler : Use LLM as a Compiler / Compiler Agent
## Project Goal

    f(document) = software
              with no code reviews

## Current Scope

The 1.0 notation (`DSL.md` §17; what 1.0 is to complete is in [`ROADMAP.md`](ROADMAP.md), in Japanese).
TypeScript targets only.

- **Write a spec in TypeScript that is read, never run. (Spec Driven Development)** A component is a
  `service("sentence", { ... })` whose commands and queries are methods; anything you have not decided yet can stay
  a sentence — a whole component, one command, one condition inside a body (`is.onLoan("The book is on loan")`).
  An LLM writes the content of every sentence, in the same notation, into an *interpretation* that you review; it
  can never override what you wrote.
- **The spec is a formal model.** It compiles to an IR of expressions. Before any agent runs, the spec is run on
  its own, its properties and the reachability of every case are checked with Alloy, and every constant is changed
  to see that it shows in what can be verified.
- **Have an LLM agent write the production code from the spec (Harness/Loop Engineering)**, test-first, in three
  isolated sessions: design a skeleton, wire it to the test harness, then implement it. The framework generates
  test-side code only and places nothing in production code.
- **Run it again when the spec changes.** The same command brings the code back into agreement with the spec:
  only the steps the change calls for are run, existing code is kept, and the agent is first shown where the
  current code falls short. If nothing changed, it only verifies.
- **A web application, persistence and failing dependencies included.** Commands answer, values are records,
  lists, sets and maps, components contain components, and an HTTP route is part of the spec. Agents write
  everything down to the `node:http` server; a person writes only the composition root. Data that must survive a
  restart (`durable`, on `node:sqlite`) is verified by restarting the system between steps, and a dependency that
  can fail (`mayFail`) fails during verification (`examples/todo-db-ts`).
- **A person stays in the loop.** Questions the interpreting LLM could not settle, and places where two
  independent interpretations behave differently, block until a person resolves them — by making the spec more
  precise or by marking the reading as reviewed.
- **The framework is built with itself.** Nineteen of its own decisions — the reader's judgements, the oracle's
  choices, the grading verdicts, the pipeline and the interpret flow — are specs in the same notation, implemented by
  agents and used by the framework. A small hand-written version of each stays as the trusted base: parts that grade
  are always graded by it, and its answers must agree with theirs (`SELF_HOSTING.md`).

## Requirements and Setup

- Node.js 22.18 or later (`.node-version` pins 24)
- pnpm

```bash
pnpm install
```

There is no build step. Node runs the `.ts` files directly. Everything goes through one command:

```bash
pnpm clp --help
```

| Command | What it does |
| --- | --- |
| `clp run` | all of the below in one run: check, interpret, ask you the open questions, accept, implement, verify |
| `clp compile` | check the spec and print its IR |
| `clp interpret` | have an LLM derive what the prose means; `--accept` puts it into use |
| `clp apply` | bring the production code into agreement with the spec, by having an agent write it and verifying it |
| `clp verify` | verify existing production code against the spec |

`pnpm clp` runs it from the repository root; inside a package, use `pnpm exec clp`. The commands look for the
spec in `specs/` under the current directory (`--specs <dir>` names another place), so the usual way is to run
them from the directory of the thing you are building.

## Start your own

A component lives in a directory with its spec, the code written from it, and the test side:

```text
examples/my-thing/
├── package.json     { "type": "module", "devDependencies": { "@clp/cli": "workspace:*", "@clp/core": "workspace:*" } }
├── specs/           what you write (Layer 1), and the interpretation derived from it
├── src/             production code, written by the agent
└── clp/             the test side, generated
```

```bash
mkdir -p examples/my-thing/specs      # then add the package.json above
pnpm install
cd examples/my-thing

# 1. Write specs/<name>.component.ts — as roughly as you like.
# 2. Have an LLM say what it means. Read the report, make the spec more precise where it was ambiguous, repeat.
pnpm exec clp interpret --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
pnpm exec clp interpret --accept
# 3. Have an agent write the code, and verify it.
pnpm exec clp apply --out . --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
pnpm exec clp verify --out .

# Or steps 2 and 3 in one run, answering the questions as they come:
pnpm exec clp run --out . --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

For now the directory has to be a package of this repository's workspace (`examples/*`): Node does not run
`.ts` files that sit under `node_modules`, so the framework cannot yet be installed into another repository.
Everything you can write in a spec, and every message `clp compile` gives, is on one page:
[`REFERENCE.md`](REFERENCE.md).

## Example

The walkthrough below uses `examples/checkout-ts/`: the spec of an order that is placed, paid, shipped, or
cancelled (`specs/`), the implementation an LLM agent wrote from it (`src/`), and the test side (`clp/`).
Paths and commands are relative to that directory.

More examples: `examples/library-ts/` starts from a deliberately rough spec and shows how it was made
precise (see its `README.md`); `examples/lending-ts/` is a library of several components that contain one
another; `examples/todo-ts/` is a to-do list behind an HTTP API, server included, where a
person wrote only the composition root; `examples/todo-db-ts/` makes it persistent and lets a dependency fail
(each has a `README.md`); `packages/cli/self/` describes parts of the framework itself in the same way, and the
framework runs on them (`examples/co-llm-piler` is a link to it).

### 1. Write the spec

Everything goes in `specs/order.component.ts`: the outside world the order talks to, two decision tables, and the
order itself. Commands and queries are methods; what you have not pinned down stays a sentence.

```ts
import { answer, decisions, does, external, init, is, otherwise, requires, service } from "@clp/core";
import type { Int } from "@clp/core";

export type Rank = "Gold" | "Silver" | "Bronze";

// The outside world: no contents, only what it answers and what it is told
export const Calendar = external("The calendar.", { queries: { IsMonthEnd: (): boolean => answer() } });
export const Payment = external("The external payment module.", {
  queries: { Active: (): boolean => answer(), Result: (): "succeeded" | "failed" => answer() },
});
export const Customer = external("Messages sent to the customer.", {
  commands: { OrderConfirmation() {}, Receipt(discountPercent: Int, amount: Int) {}, Coupon(type: "Premium" | "Standard") {}, /* ... */ },
});

// A row is a condition and constants; the first row that holds is chosen. null: the row gives no value
export const Campaign = decisions("The campaign that applies to the order", () => [
  [is.goldAtMonthEnd("The customer is a Gold member and it is month-end"), { discountPercent: 20, grantsCoupon: true, coupon: "Premium" }],
  [is.silver("The customer is a Silver member"), { discountPercent: 5, grantsCoupon: false, coupon: null }],
  [otherwise, { discountPercent: 0, grantsCoupon: false, coupon: null }],
]);

export const Order = service("An order: placed by a customer, paid through an external payment module, then shipped or cancelled.", {
  state: {
    status: init<"DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED">("DRAFT"),
    rank: init<Rank | null>(null),
    price: init<Int>(0),
  },
  commands: {
    // where it applies and where it leads are code; what it remembers and sends is a sentence
    PlaceOrder(customerRank: Rank, listPrice: Int) {
      requires(this.status === "DRAFT" && listPrice >= 0 && listPrice <= 1000000);
      this.status = "PENDING";
      does.place("The order remembers the customer's rank and the list price. An order confirmation is sent.");
    },
    Checkout() {
      requires(this.status === "PENDING" && is.paymentModuleActive("The external payment module is active"));
      if (is.paid("The payment succeeded")) {
        this.status = "PAID";
        does.receipt("A receipt is sent with the campaign's discount percent and the amount charged (price × (100 − discount percent) ÷ 100, rounded down to a whole yen). Then a coupon is issued if the campaign grants one.");
        return;
      }
      does.failure("The customer is notified of the payment failure.");
    },
    // a sentence only
    Cancel: "A pending or paid order can be cancelled. If the order had been paid, the customer is refunded what they paid.",
    // ...
  },
  queries: { Status: "The order's current status" },
  rules: { pastDraftHasRankAndPrice: "Every order past the draft state has a member rank" },
});
```

`requires` puts a situation outside the spec: it is never tested. A rule the code must enforce is an answer
(`return "limit";`) instead. Everything you can write is on one page: [`REFERENCE.md`](REFERENCE.md).

### 2. Have an LLM interpret it

```bash
pnpm exec clp interpret \
  --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

The agent writes the **interpretation**: the content of every sentence, as code in the same notation. You do not
write this file.

```ts
// specs/order.interpretation.ts — generated
export const Refunds = external("Refunds paid back to the customer through the external payment module.", {
  commands: { Refund(amount: Int) {} },
});

export const OrderInterpretation = interpretation(Order, {
  state: { amountPaid: init<Int>(0) },
  commands: {
    Cancel() {
      if (this.status === "PAID") {
        this.status = "CANCELLED";
        Refunds.Refund(this.amountPaid);
        return "cancelled";
      }
      if (this.status === "PENDING") {
        this.status = "CANCELLED";
        return "cancelled";
      }
      return "not-cancellable";
    },
  },
  conditions: { paid() { return Payment.Result() === "succeeded"; } /* ... */ },
  does: {
    receipt() {
      const campaign = Campaign();
      const amount = Math.floor((this.price * (100 - campaign.discountPercent)) / 100);
      this.amountPaid = amount;
      Customer.Receipt(campaign.discountPercent, amount);
      if (campaign.grantsCoupon && campaign.coupon !== null) Customer.Coupon(campaign.coupon!);
    },
    // ...
  },
});
```

It **fills, never overrides**: writing again what you wrote as code is rejected. It is read and type-checked with
the rest of the spec, run on its own, and checked with Alloy before it is written out.

Because the interpretation is what the implementation is judged against, it is not used until you accept it. It
goes to `specs/order.interpretation.draft.ts`, and you are told where the prose was ambiguous, in two ways:

- **Questions the agent left** (`// REVIEW:`), for example: *Layer 1 does not say what Return answers. Chosen:
  "returned", or "refused" for a lost book.*
- **Where another reading behaves differently.** A second session interprets the same prose without seeing the
  first (only the boundary is shared: commands, queries, their answers, the outside world), and is asked to take a
  reading that is defensible but not the most obvious one. Both are run on the same sequences, and each difference
  is reported with the shortest sequence that shows it:

  ```text
  2 つ目の解釈と食い違う (Return、外の世界へのコマンド loan-world.NotifyNextMember):
    Borrow({} 外の世界: {"loan-world.ReservedBySomeoneElse":false}) → Return({} 外の世界: {"loan-world.ReservedBySomeoneElse":true})
    1つ目: {"effects":[{"port":"loan-world.NotifyNextMember","args":{}}],"output":"returned"}、2 つ目: {"effects":[],"output":"returned"}
  ```

Both are written into the draft (the differences as `// REVIEW(clp):` lines), and **the draft cannot be accepted
while any is left**. Resolve one by making Layer 1 more precise and interpreting again, or, if the draft's reading
is the one you meant, change that line's `REVIEW` to `REVIEWED`: it stays as the record. `clp interpret` also
prints every sentence next to what it became, read aloud. Then:

```bash
pnpm exec clp interpret --accept
```

The interpretation records the Layer 1 it was derived from. If Layer 1 changes afterwards, it is stale and nothing
runs until it is derived again (or accepted again, when you only reworded a sentence). Changing a value in a
decision table does not make it stale.

### 3. Check the spec

```bash
pnpm -s exec clp compile
```

This reads and type-checks the spec, runs it on its own (properties, a missing map key, a step no case applies to),
runs your examples, checks it with Alloy (every property, and a trace to every case — which also become the first
sequences tried during verification), changes each constant to see that it shows in what can be verified, and
prints the IR: the spec as a formal model, in JSON. Expressions are s-expressions:

```json
"Checkout.paid": {
  "assign": { "status": ["lit", "PAID"], "amountPaid": ["div", ["*", ["state", "price"], ["-", 100, ["field", ["decide", "campaign", {}], "discountPercent"]]], 100] },
  "calls": [{ "component": "customer", "command": "Receipt", "args": { "discountPercent": ["field", ["decide", "campaign", {}], "discountPercent"], "amount": ["div", "…"] } }, "…"]
}
```

### 4. Have an agent implement it

```bash
pnpm exec clp apply --out . --fresh \
  --agent 'claude -p "Read clp/REQUEST.md and carry out the request." --permission-mode acceptEdits'
```

Any command can be the agent. The work follows a test-driven flow in three steps, each a separate session
that sees different things:

| Step | The agent sees | The agent writes | Then the framework checks |
| --- | --- | --- | --- |
| 1. Design | the IR, and the spec read aloud | a skeleton of the production code: signatures, no behaviour | that it type-checks and loads |
| 2. Wiring | the test harness contract and the skeleton, **not the IR** | the adapter | that it type-checks, and that the tests **fail** because nothing is implemented yet |
| 3. Implementation | the IR, the spec read aloud, and the skeleton, **not the adapter** | the bodies | that it still type-checks against the adapter, that the tests pass, and the mutation gate |

Because the wiring step never sees the spec, the adapter cannot make business decisions; because the other two
steps never see the test harness, production code is not shaped by it. Each session runs in a temporary
directory outside the repository, and a failed check is sent back to the same step for another attempt.

To pass project conventions to the agent (architecture rules, naming, a glossary), declare them in the
component. They are attached to the design and implementation requests:

```ts
export const Order = service("An order ...", {
  // ...
  assets: [
    file("docs/architecture.md"),                     // a file
    dir("docs/conventions"),                          // every file in a directory
    text("Money is always handled as whole yen."),    // a short note, put straight into the request
  ],
});
```

A second argument chooses the steps an asset goes to, for example `text("...", { phases: ["wiring"] })`.

```text
[1] design #1: ok
[1] wiring #1: ok (tests fail as expected: not implemented)
[1] implementation #1: pass (mutation: builtin, …)
```

Here every step passed on its first attempt. A run fails when changing a value the spec fixes (a decision-table
cell, a constant answered or sent to the outside world) leaves the tests passing; other surviving mutations are
reported but do not fail the run.

The specs directory may hold several components. They share the production code, and each gets its own
test-side files, named after it (`clp/order.adapter.ts`). All of them are brought into agreement in turn
(`--component <name>` picks one); after a change for one component the others are verified again, and a change
that breaks one of them is sent back. Whose code is whose is decided by which component's tests execute it: a
component may change code it uses, shared or not, but a change to code only other components use is undone,
and its mutation gate breaks only the code it is responsible for.

By default the production code goes to `<out>/src` and the test side to `<out>/clp`. To follow another
layout, name the two places directly:

```bash
# src/ and test/ kept apart
pnpm exec clp apply --src app/src --tests test/clp --agent '...'

# side by side: src/order/order.ts next to src/order/clp.order.adapter.ts, clp.order.ir.json, ...
pnpm exec clp apply --src src/order --tests src/order/clp. --agent '...'
```

`--tests` is the path put in front of the test-side file names: when it ends with a `.`, its last part is a
file-name prefix; otherwise it is a directory. The directory given as `--src` is rewritten by the agent, so it
must not be a project root.

### 5. What you get

```text
examples/checkout-ts/
├── specs/                    written by you (Layer 1), plus the accepted interpretation
├── src/                      written by the agent; no framework imports, no framework types
│   ├── types.ts
│   ├── dependencies.ts       the dependencies, in the production code's own terms
│   ├── rules.ts              the business decisions, as pure functions
│   ├── order.ts
│   └── index.ts
└── clp/                      the test side
    ├── order.ir.json               generated
    ├── order.adapter.contract.ts   generated
    ├── order.verify.ts             generated
    ├── order.verified.json         the pass record
    └── order.adapter.ts            skeleton generated, filled in by the agent
```

**Production code** (`src/rules.ts`). The agent turned the expressions of the IR into code: the decision table,
the amount with its rounding, and the 10,000-yen threshold.

```ts
export function decideCampaign(rank: CustomerRank, isMonthEnd: boolean): Campaign {
  if (rank === "Gold" && isMonthEnd) return { coupon: "Premium", discountPercent: 20, grantsCoupon: true };
  if (rank === "Silver") return { coupon: null, discountPercent: 5, grantsCoupon: false };
  return { coupon: null, discountPercent: 0, grantsCoupon: false };
}

export function chargedAmount(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

export function decideShipping(rank: CustomerRank, price: number): ShippingPlan {
  return { priority: rank === "Gold" || price >= 10000 };
}
```

**The adapter** (`clp/order.adapter.ts`). Production code defines its dependencies in its own terms; the adapter
connects them to the stand-ins the test harness provides.

```ts
calendar: { isMonthEnd: () => ports.calendar.IsMonthEnd() },
payment: { isActive: () => ports.payment.Active(), result: () => ports.payment.Result() },
customer: { sendReceipt: (amount, discountPercent) => ports.customer.Receipt({ amount, discountPercent }), /* ... */ },
refunds: { refund: (amount) => ports.refunds.Refund({ amount }) },
```

### 6. Verify again at any time

```bash
pnpm exec clp verify --out .    # property-based test against the example
pnpm typecheck                  # (from the repository root) type-check the specs and the framework
pnpm test                       # (from the repository root) the framework's own tests
```

When an implementation is wrong, the test reports the shortest sequence of commands that shows it. For an
implementation that forgets the refund when a paid order is cancelled:

```text
PlaceOrder {"customerRank":"Gold","listPrice":0}  →  Checkout (order.Checkout.paid)  →  Cancel (order.Cancel.case1)
expected: effects [refunds.Refund {"amount":0}], answer "cancelled"
actual:   effects [], answer "cancelled"
```

## Future Scope

See [`ROADMAP.md`](ROADMAP.md) (in Japanese): what versions 0.1 and 0.3 completed, and the stages towards 1.0
(the notation, the formal model, the checker and the self-hosted parts are done; running the spec as a program,
`clp run`, is next).
