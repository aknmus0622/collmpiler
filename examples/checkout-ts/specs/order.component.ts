import { component, compose, description, does, from, goTo, input, onlyIf, otherwise, output, typed, when } from "@clp/core";
import { Campaign, Shipping } from "./order.decisions.ts";

const Rank = ["Gold", "Silver", "Bronze"] as const;
// Money is a whole number of yen. `around` lists thresholds the property-based test probes closely.
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

// Layer 1 of the "order" component, written by a person. Every entry is prose (`description`), parts (`typed`,
// `input`, `output`, `from`, `goTo`, ...), or both merged by `compose`, whichever the author wants to pin down. What the prose means — the rest of the structure, and the meaning of every
// sentence — is derived by an LLM into order.interpretation.ts. To make something more precise, write more
// structure here; the interpretation cannot override what is written as structure.
export const Order = component({
  description: "An order: placed by a customer, paid through an external payment module, then shipped or cancelled.",

  // ── Vocabulary ──────────────────────────────────────────────
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  init: "DRAFT",

  // What the order remembers between commands (nothing is set at the start)
  data: { rank: typed(Rank), price: typed(Yen) },

  // What the order asks its dependencies (a clock, configuration, an external service's response)
  queries: {
    isMonthEnd: compose(description("Whether today is the last day of the month."), output("boolean")),
    paymentModuleActive: output("boolean"),
    paymentResult: compose(description("What the payment module answered for this order."), output(["succeeded", "failed"])),
  },

  // The effects the order has on its dependencies
  effects: {
    SendOrderConfirmation: input({}),
    SendReceipt: input({ discountPercent: "integer", amount: "integer" }),
    IssueCoupon: input({ type: ["Premium", "Standard"] }),
    NotifyPaymentFailure: input({}),
    SendShippingNotice: input({ priority: "boolean" }),
    // Prose only: whether it carries anything is left to the interpretation
    Refund: description("What the customer paid is returned."),
  },

  // ── Decisions and calculations ──────────────────────────────
  decisions: { campaign: Campaign, shipping: Shipping },

  calculations: {
    amountCharged: compose(description("price × (100 − discount percent) ÷ 100, rounded down to a whole yen"), output("integer")),
  },

  // Properties that must hold after every command
  invariants: ["Every order past the draft state has a member rank and a price"],

  // ── Commands ────────────────────────────────────────────────
  commands: {
    // Fully structured: input, where it applies, where it leads
    PlaceOrder: compose(
      input({ customerRank: Rank, listPrice: Yen }),
      from("DRAFT"),
      goTo("PENDING"),
      does("The order remembers the customer's rank and the list price. An order confirmation is sent."),
    ),

    Checkout: compose(
      from("PENDING"),
      onlyIf("The external payment module is active"),
      when(
        "The payment succeeded",
        goTo("PAID"),
        does(
          "A receipt is sent with the campaign's discount percent and the amount charged. " +
            "Then a coupon is issued if the campaign grants one.",
        ),
      ),
      // No goTo: the order stays where it is
      otherwise(does("The customer is notified of the payment failure.")),
    ),

    // Partly structured: the resulting state is left to the prose
    Ship: compose(from("PAID"), does("The order becomes shipped. A shipping notice is sent, with priority as the shipping decision says.")),

    // Prose only
    Cancel: description("A pending or paid order can be cancelled. If the order had been paid, a refund is issued."),
  },
});
