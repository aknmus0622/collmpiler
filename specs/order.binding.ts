import { bind, calculated, decide, decided, given, was } from "@aac/core";
import { Order } from "./order.component.ts";

export const Binding = bind(Order, {
  // ── Structure: what each action's sentence means, as declarations. This part goes into the IR. ──
  // `tell` lists the commands in order; `remember` stores data. Values come from references:
  // decided (a decision table's column), calculated, given (the action's input), remembered, asked.
  actions: {
    PlaceOrder: {
      remember: { rank: given("customerRank"), price: given("listPrice") },
      tell: [{ SendOrderConfirmation: {} }],
    },

    Checkout: {
      "The payment succeeded": {
        tell: [
          {
            SendReceipt: {
              discountPercent: decided("campaign", "discountPercent"),
              amount: calculated("amountCharged"),
            },
          },
          // `when` on a command: a condition sentence, or a boolean reference as here
          { IssueCoupon: { type: decided("campaign", "coupon") }, when: decided("campaign", "grantsCoupon") },
        ],
      },
      otherwise: { tell: [{ NotifyPaymentFailure: {} }] },
    },

    Ship: { tell: [{ SendShippingNotice: { priority: decided("shipping", "priority") } }] },

    // was(...): the state before the action
    Cancel: { tell: [{ Refund: {}, when: was("PAID") }] },
  },

  // ── Meaning: what each name refers to, as functions. This part is the oracle and never leaves the spec. ──
  // Conditions: decision-table rows, onlyIf, and the keys of when.
  // At most one of a table's (or an action's) conditions may hold at a time.
  conditions: {
    "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
    "The customer is a Silver member": (state) => state.rank === "Silver",
    "The customer is a Gold member, or the order is 10,000 yen or more": (state) =>
      state.rank === "Gold" || (state.price ?? 0) >= 10_000,
    "The external payment module is active": (state) => state.paymentModuleActive,
    "The payment succeeded": (state) => state.paymentResult === "succeeded",
  },

  calculations: {
    amountCharged: (state) =>
      Math.floor(((state.price ?? 0) * (100 - decide(Order, "campaign", state).discountPercent)) / 100),
  },

  // These check the spec itself, not the implementation.
  alwaysTrue: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined),
  },
});
