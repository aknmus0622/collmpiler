import { component } from "@aac/core";
import { Campaign, Shipping } from "./order.decisions.ts";

const Rank = ["Gold", "Silver", "Bronze"] as const;
// Money is a whole number of yen. `around` lists thresholds the property-based test probes closely.
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

// The "order" component: its vocabulary, the skeleton of its state machine, and what each action does, in prose.
// There are no functions here. What the sentences mean is written in order.binding.ts.
export const Order = component({
  // ── Vocabulary ──────────────────────────────────────────────
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  startsIn: "DRAFT",

  // What the order remembers between actions (nothing is set at the start)
  remembers: { rank: Rank, price: Yen },

  // What the order asks its dependencies (a clock, configuration, an external service's response)
  asks: {
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },

  // What the order tells its dependencies to do
  tells: {
    SendOrderConfirmation: {},
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: { priority: "boolean" },
    Refund: {},
  },

  // ── Decisions and calculations ──────────────────────────────
  decisions: { campaign: Campaign, shipping: Shipping },

  calculations: {
    amountCharged: {
      is: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen",
      type: "integer",
    },
  },

  // Properties that must hold after every action
  alwaysTrue: ["Every order past the draft state has a member rank and a price"],

  // ── Actions ─────────────────────────────────────────────────
  actions: {
    PlaceOrder: {
      takes: { customerRank: Rank, listPrice: Yen },
      allowedIn: ["DRAFT"],
      then: {
        goTo: "PENDING",
        does: "The order remembers the customer's rank and the list price. An order confirmation is sent.",
      },
    },

    Checkout: {
      allowedIn: ["PENDING"],
      onlyIf: ["The external payment module is active"],
      when: {
        "The payment succeeded": {
          goTo: "PAID",
          does:
            "A receipt is sent with the campaign's discount percent and the amount charged. " +
            "Then a coupon is issued if the campaign grants one.",
        },
        otherwise: {
          goTo: "PENDING",
          does: "The customer is notified of the payment failure.",
        },
      },
    },

    Ship: {
      allowedIn: ["PAID"],
      then: {
        goTo: "SHIPPED",
        does: "A shipping notice is sent, with priority as the shipping decision says.",
      },
    },

    Cancel: {
      allowedIn: ["PENDING", "PAID"],
      then: {
        goTo: "CANCELLED",
        does: "If the order had been paid, a refund is issued.",
      },
    },
  },
});
