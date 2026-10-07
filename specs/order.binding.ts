import { bind, decide, ref } from "@clp/core";
import { Order } from "./order.component.ts";

export const Binding = bind(Order, {
  // ── Structure: what each command's sentence means, as declarations. This part goes into the IR. ──
  // `effects` lists the effects in order; `set` stores data. Values come from references:
  // ref.decision (a decision table's column), ref.calculation, ref.input (the command's input), ref.data, ref.query.
  commands: {
    PlaceOrder: {
      set: { rank: ref.input("customerRank"), price: ref.input("listPrice") },
      effects: [{ SendOrderConfirmation: {} }],
    },

    Checkout: {
      "The payment succeeded": {
        effects: [
          {
            SendReceipt: {
              discountPercent: ref.decision("campaign", "discountPercent"),
              amount: ref.calculation("amountCharged"),
            },
          },
          // `when` on an effect: a condition sentence, or a boolean reference as here
          { IssueCoupon: { type: ref.decision("campaign", "coupon") }, when: ref.decision("campaign", "grantsCoupon") },
        ],
      },
      otherwise: { effects: [{ NotifyPaymentFailure: {} }] },
    },

    Ship: { effects: [{ SendShippingNotice: { priority: ref.decision("shipping", "priority") } }] },

    // ref.was(...): the state before the command
    Cancel: { effects: [{ Refund: {}, when: ref.was("PAID") }] },
  },

  // ── Meaning: what each name refers to, as functions. This part is the oracle and never leaves the spec. ──
  // Conditions: decision-table rows, onlyIf, and the keys of when.
  // At most one of a table's (or a command's) conditions may hold at a time.
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
  invariants: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined),
  },
});
