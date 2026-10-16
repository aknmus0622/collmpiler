import { calculations, commands, conditions, data, effects, input, integer, invariants, otherwise, queries, service, states } from "@clp/core";
import { CampaignIf, Decision, ShippingIf } from "./order.decisions.ts";

const Rank = ["Gold", "Silver", "Bronze"] as const;
// Money is a whole number of yen. `around` lists thresholds the property-based test probes closely.
const Yen = integer({ min: 0, max: 1_000_000, around: [10_000] });
export const If = conditions({
  externalPaymentModuleActive: "The external payment module is active",
  paymentSucceeded: "The payment succeeded",
});

export const State = states(["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"]);

export const Data = data({ rank: Rank, price: Yen });

export const Query = queries({
  isMonthEnd: { description: "Whether today is the last day of the month.", output: "boolean" },
  paymentModuleActive: "boolean",
  paymentResult: { description: "What the payment module answered for this order.", output: ["succeeded", "failed"] },
});

export const Effect = effects({
  SendOrderConfirmation: input({}),
  SendReceipt: input({ discountPercent: "integer", amount: "integer" }),
  IssueCoupon: input({ type: ["Premium", "Standard"] }),
  NotifyPaymentFailure: input({}),
  SendShippingNotice: input({ priority: "boolean" }),
  // Prose only: whether it carries anything is left to the interpretation
  Refund: "What the customer paid is returned.",
});

export const Calc = calculations({
  amountCharged: { description: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen", output: "integer" },
});

export const Inv = invariants({
  everyOrderPastDraftState: "Every order past the draft state has a member rank and a price",
});

export const PlaceOrderInput = input({ customerRank: Rank, listPrice: Yen });

// The commands. A name is born here, as a key; inside, every key is a field of the command.
// Each command is as structured as the author wants: fully, partly, or prose only.
export const Command = commands({
  // Fully structured: input, where it applies, where it leads
  PlaceOrder: {
    input: PlaceOrderInput,
    from: State.DRAFT,
    goTo: State.PENDING,
    does: "The order remembers the customer's rank and the list price. An order confirmation is sent.",
  },
  Checkout: {
    from: State.PENDING,
    onlyIf: If.externalPaymentModuleActive,
    cases: [
      If.paymentSucceeded.then({
        goTo: State.PAID,
        does: "A receipt is sent with the campaign's discount percent and the amount charged. Then a coupon is issued if the campaign grants one.",
      }),
      // No goTo: the order stays where it is
      otherwise({ does: "The customer is notified of the payment failure." }),
    ],
  },
  // Partly structured: the resulting state is left to the prose
  Ship: { from: State.PAID, does: "The order becomes shipped. A shipping notice is sent, with priority as the shipping decision says." },
  // Prose only
  Cancel: "A pending or paid order can be cancelled. If the order had been paid, a refund is issued.",
});

// Layer 1 of the "order" component, written by a person. Every entry is prose, structure (a type, an input,
// `from`, `goTo`, ...), or both, whichever the author wants to pin down. What the prose means — the rest of the
// structure, and the meaning of every sentence — is derived by an LLM into order.interpretation.ts. To make
// something more precise, write more structure here; the interpretation cannot override what is written as structure.
export const Order = service({
  description: "An order: placed by a customer, paid through an external payment module, then shipped or cancelled.",
  init: State.DRAFT,
  // The vocabulary: states, what the order remembers, what it asks its dependencies, the effects it has on them,
  // decisions, calculations, properties that must hold after every command, and the commands
  uses: [State, Data, Query, Effect, Decision, CampaignIf, ShippingIf, If, Calc, Inv, Command],
});
