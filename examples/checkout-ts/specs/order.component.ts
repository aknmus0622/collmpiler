import { answer, decisions, does, external, init, is, otherwise, requires, service } from "@clp/core";
import type { Int } from "@clp/core";

export type Rank = "Gold" | "Silver" | "Bronze";

// The world around an order. What it asks: the calendar and the payment module. What it tells: the customer.
export const Calendar = external("The calendar.", {
  queries: { IsMonthEnd: (): boolean => answer() },
});
export const Payment = external("The external payment module.", {
  queries: {
    Active: (): boolean => answer(),
    /** What the payment module answered for this order. */
    Result: (): "succeeded" | "failed" => answer(),
  },
});
export const Customer = external("Messages sent to the customer.", {
  commands: {
    OrderConfirmation() {},
    Receipt(discountPercent: Int, amount: Int) {},
    Coupon(type: "Premium" | "Standard") {},
    PaymentFailure() {},
    ShippingNotice(priority: boolean) {},
  },
});

// Decision tables: a condition selects a row of constants. The last row is `otherwise`; `null` means the row gives no
// value for that column (it must not be used when that row applies). The discount is a whole-number percentage.
export const Campaign = decisions("The campaign that applies to the order", () => [
  [is.goldAtMonthEnd("The customer is a Gold member and it is month-end"), { discountPercent: 20, grantsCoupon: true, coupon: "Premium" }],
  [is.silver("The customer is a Silver member"), { discountPercent: 5, grantsCoupon: false, coupon: null }],
  [otherwise, { discountPercent: 0, grantsCoupon: false, coupon: null }],
]);
export const Shipping = decisions("How the order is shipped", () => [
  [is.goldOrLarge("The customer is a Gold member, or the order is 10,000 yen or more"), { priority: true }],
  [otherwise, { priority: false }],
]);

// Layer 1 of the order, written by a person: structure where the author pinned it down, prose elsewhere. What the prose
// means is derived by `clp interpret` into order.interpretation.ts. Money is a whole number of yen.
export const Order = service("An order: placed by a customer, paid through an external payment module, then shipped or cancelled.", {
  state: {
    status: init<"DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED">("DRAFT"),
    rank: init<Rank | null>(null),
    price: init<Int>(0),
  },

  commands: {
    // Fully structured where it applies and where it leads; what it remembers and sends is prose
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
    // Partly structured: where it leads is left to the prose
    Ship() {
      requires(this.status === "PAID");
      does.ship("The order becomes shipped. A shipping notice is sent, with priority as the shipping decision says.");
    },
    // Prose only
    Cancel: "A pending or paid order can be cancelled. If the order had been paid, the customer is refunded what they paid.",
  },

  queries: {
    Status: "The order's current status",
  },

  rules: {
    pastDraftHasRankAndPrice: "Every order past the draft state has a member rank",
  },
});
