# co-llm-piler : Use LLM as a Compiler / Compiler Agent

## Current Scope

This project is at the Phase 1 spike stage.

**What works today**

- Writing specs (DecisionTables and behavior definitions) in TypeScript

## Requirements and Setup

- Node.js 22.18 or later (`.node-version` pins 24)
- pnpm

```bash
pnpm install
```

There is no build step. Node runs the `.ts` files directly.

## Example

`specs/` contains the example from `SPEC.md` (order checkout with a campaign discount).

```bash
pnpm -s run ir   # emit the IR for specs/ to stdout
pnpm test        # run the tests
```

Spec (excerpt from `specs/order.spec.ts`):

```ts
"PaymentSuccess": (state) => {
  const campaign = applyDecision(CampaignRules, state);
  return state.PAID({
    event: "Payment completed",
    effects: [
      { action: "SendReceipt", payload: { discount: campaign.discount } },
      ...campaign.effects
    ]
  });
}
```

Emitted IR (excerpt):

```json
{
  "nextState": "PAID",
  "event": "Payment completed",
  "emittedCommands": [
    { "action": "SendReceipt",
      "payload": { "discount": { "$ref": "decision:CampaignRules.discount" } },
      "payloadSchema": { "discount": "number" } },
    { "$spread": "decision:CampaignRules.effects" }
  ]
}
```

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Core types, dynamic evaluation on Node, PBT for TypeScript with fast-check | In progress (IR extraction done) |
| 2 | Extract Universal IR generation into a standalone compiler | Partly started |
| 3 | Multi-language targets such as Go | Not started |
| 4 | Diagram generation, Trace Visualizer, deterministic replay | Not started |
