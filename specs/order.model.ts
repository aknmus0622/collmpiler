import type { CommandsOf, DomainModel } from "@aac/core";

const Rank = ["Gold", "Silver", "Bronze"] as const;
// Money is a whole number of yen. `around` lists thresholds the property-based test probes closely.
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

// The boundary of the "order" component. This value is the single source of truth; types are derived from it.
export const OrderModel = {
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // What the order remembers between actions (nothing is set in the initial state)
  data: {
    rank: Rank,
    price: Yen,
  },
  // Actions and their inputs
  actions: {
    PlaceOrder: { customerRank: Rank, listPrice: Yen },
    Checkout: {},
    Ship: {},
    Cancel: {},
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
  // Formulas: the name states the calculation and the rounding. The function is bound in vocabulary.ts.
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": "integer",
  },
  // Invariants: properties that must hold after every action
  invariants: [
    "Every order past the draft state has a member rank and a price",
  ],
} as const satisfies DomainModel;

export type DomainCommand = CommandsOf<typeof OrderModel>;
