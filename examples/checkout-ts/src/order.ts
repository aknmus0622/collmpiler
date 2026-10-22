/**
 * The order component (specification component `order`, the root).
 */

import type { OrderDependencies } from "./dependencies.ts";
import { chargedAmount, couponToIssue, decideCampaign, decideShipping } from "./rules.ts";
import type { CancelOutcome, CustomerRank, OrderStatus } from "./types.ts";

/**
 * One order, kept in memory (nothing survives a restart). A new instance starts in the specification's
 * initial state. Each command method performs one specification command in a single synchronous step:
 * it reads the stored fields, asks the dependencies it needs, updates the fields and sends the resulting
 * notifications through the dependencies before returning.
 *
 * Callers only invoke commands with inputs and in situations the specification allows (its `requires`);
 * behaviour outside those is unspecified.
 */
export class Order {
  readonly #deps: OrderDependencies;
  /** Specification state field `order.status`. */
  #status!: OrderStatus;
  /** Specification state field `order.rank`. */
  #rank!: CustomerRank | null;
  /** Specification state field `order.price`, in whole yen. */
  #price!: number;
  /** Specification state field `order.amountPaid`, in whole yen. */
  #amountPaid!: number;

  /**
   * Creates a new order.
   * @param deps calendar, payment module, customer notifier and refund service it talks to.
   */
  constructor(deps: OrderDependencies) {
    this.#deps = deps;
    this.#status = "DRAFT";
    this.#rank = null;
    this.#price = 0;
    this.#amountPaid = 0;
  }

  /**
   * Reads the lifecycle value (specification query `Status`); see {@link OrderStatus} for the values.
   * Talks to no dependency.
   */
  status(): OrderStatus {
    return this.#status;
  }

  /**
   * Performs specification command `PlaceOrder`. Stores the inputs and calls
   * {@link CustomerNotifier.sendOrderConfirmation}.
   * @param customerRank membership rank (specification `customerRank`).
   * @param listPrice list price in whole yen (specification `listPrice`).
   */
  placeOrder(customerRank: CustomerRank, listPrice: number): void {
    this.#price = listPrice;
    this.#rank = customerRank;
    this.#status = "PENDING";
    this.#deps.customer.sendOrderConfirmation();
  }

  /**
   * Performs specification command `Checkout` (events `Checkout.paid` / `Checkout.otherwise`).
   * Asks {@link PaymentModule.result}, may ask {@link Calendar.isMonthEnd}, then calls either
   * {@link CustomerNotifier.sendReceipt} (possibly followed by {@link CustomerNotifier.issueCoupon}) or
   * {@link CustomerNotifier.sendPaymentFailure}. Returns nothing.
   */
  checkout(): void {
    const { calendar, payment, customer } = this.#deps;
    if (payment.result() !== "succeeded") {
      customer.sendPaymentFailure();
      return;
    }
    const rank = this.#placedRank();
    const campaign = decideCampaign(rank, rank === "Gold" && calendar.isMonthEnd());
    const amount = chargedAmount(this.#price, campaign.discountPercent);
    this.#amountPaid = amount;
    this.#status = "PAID";
    customer.sendReceipt(amount, campaign.discountPercent);
    const coupon = couponToIssue(campaign);
    if (coupon !== null) {
      customer.issueCoupon(coupon);
    }
  }

  /**
   * Performs specification command `Ship` and calls {@link CustomerNotifier.sendShippingNotice}.
   */
  ship(): void {
    const plan = decideShipping(this.#placedRank(), this.#price);
    this.#status = "SHIPPED";
    this.#deps.customer.sendShippingNotice(plan.priority);
  }

  /**
   * Performs specification command `Cancel` (events `Cancel.case1`, `Cancel.case2`, `Cancel.otherwise`).
   * May call {@link RefundService.refund}.
   * @returns the command's answer; see {@link CancelOutcome}.
   */
  cancel(): CancelOutcome {
    if (this.#status === "PAID") {
      const refund = this.#amountPaid;
      this.#status = "CANCELLED";
      this.#deps.refunds.refund(refund);
      return "cancelled";
    }
    if (this.#status === "PENDING") {
      this.#status = "CANCELLED";
      return "cancelled";
    }
    return "not-cancellable";
  }

  /** The stored rank, which the specification guarantees is set once the order is past the draft state. */
  #placedRank(): CustomerRank {
    return this.#rank!;
  }
}
