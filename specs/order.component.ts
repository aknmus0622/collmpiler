import { applyDecision, applyFormula, defineComponent } from "@aac/core";
import type { CommandsOf, DecisionTable } from "@aac/core";

const Rank = ["Gold", "Silver", "Bronze"] as const;
// Money is a whole number of yen. `around` lists thresholds the property-based test probes closely.
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

// --- 1. Boundary and structure: pure data, the single source of truth. Types are derived from it. ---
const OrderBoundary = defineComponent({
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // What the order remembers between actions (nothing is set in the initial state)
  data: {
    rank: Rank,
    price: Yen,
  },
  // Queries to dependencies: values the component asks for (clock, configuration, an external service's response)
  queries: {
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },
  // Commands to dependencies: the side effects the spec allows
  commands: {
    SendOrderConfirmation: {},
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: { priority: "boolean" },
    Refund: {},
  },
  // Formulas: the name states the calculation and the rounding. The function is bound in order.binding.ts.
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": "integer",
  },
  // Invariants: properties that must hold after every action
  invariants: [
    "Every order past the draft state has a member rank and a price",
  ],
  // Actions: their input, the states they can run in (from), and their preconditions (where)
  actions: {
    PlaceOrder: { input: { customerRank: Rank, listPrice: Yen }, from: ["DRAFT"] },
    Checkout: { from: ["PENDING"], where: ["The external payment module is active"] },
    Ship: { from: ["PAID"] },
    Cancel: { from: ["PENDING", "PAID"] },
  },
});

// --- 2. Decision tables: each key is a condition in natural language; `default` is mandatory. ---
type Command = CommandsOf<typeof OrderBoundary>;

// The discount is a whole-number percentage (fractions would make the amount calculation inexact).
export const CampaignRules = {
  "The customer is a Gold member and it is month-end": {
    discountPercent: 20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "The customer is a Silver member": { discountPercent: 5, effects: [] },
  "default": { discountPercent: 0, effects: [] }
} as const satisfies DecisionTable<{ discountPercent: number; effects: Command[] }>;

export const CancelRules = {
  "The order has been paid": { effects: [{ action: "Refund", payload: {} }] },
  "default": { effects: [] }
} as const satisfies DecisionTable<{ effects: Command[] }>;

export const ShippingRules = {
  "The customer is a Gold member, or the order is 10,000 yen or more": { priority: true },
  "default": { priority: false }
} as const satisfies DecisionTable<{ priority: boolean }>;

// --- 3. Cases: what each action does. No logic here: apply tables and formulas, then map their results. ---
export const Order = OrderBoundary.cases({
  // An action that does not branch is a single function.
  PlaceOrder: (state) => state.PENDING({
    event: "Order placed",
    // Remember the rank and the price; checkout and shipping depend on them.
    set: { rank: state.customerRank, price: state.listPrice },
    effects: [{ action: "SendOrderConfirmation", payload: {} }]
  }),

  // An action that branches is a table keyed by conditions, with a mandatory `default`.
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

  Ship: (state) => {
    const shipping = applyDecision(ShippingRules, state);

    return state.SHIPPED({
      event: "Order shipped",
      effects: [{ action: "SendShippingNotice", payload: { priority: shipping.priority } }]
    });
  },

  Cancel: (state) => {
    const cancel = applyDecision(CancelRules, state);

    return state.CANCELLED({ event: "Order cancelled", effects: [...cancel.effects] });
  }
});
