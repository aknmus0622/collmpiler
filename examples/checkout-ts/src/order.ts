/**
 * The order itself: a small state machine that remembers what was ordered, consults the business
 * rules in `rules.ts`, and talks to its dependencies.
 */
import type { OrderDependencies } from "./ports.ts";
import { amountCharged, campaignFor, isMonthEnd, isPriorityShipment, refundDueOnCancel } from "./rules.ts";
import type { OrderPlacement, OrderStatus } from "./types.ts";

/**
 * Thrown by an `Order` action that is not permitted right now: the order is in a state from
 * which the action cannot be executed, or (for `checkout`) the external payment module is not
 * active. When this is thrown the order's state is unchanged and no notification, coupon,
 * charge or refund has been issued.
 *
 * The specification leaves these situations undefined ("not tested"); rejecting them is this
 * component's own choice.
 */
export class OrderActionError extends Error {
  /**
   * @param message a human-readable explanation of why the action was rejected.
   */
  constructor(message: string) {
    super(message);
    this.name = "OrderActionError";
  }
}

/**
 * A single customer order, from draft to shipment or cancellation.
 *
 * One instance is one run of the specification's component. A freshly constructed order is in
 * the specification's initial state (`"DRAFT"`) and remembers nothing yet. The specification's
 * four actions are the four methods below:
 *
 * | Specification action | Method                                   |
 * | -------------------- | ---------------------------------------- |
 * | `PlaceOrder`         | `place({ listPrice, customerRank })`     |
 * | `Checkout`           | `checkout()`                             |
 * | `Ship`               | `ship()`                                 |
 * | `Cancel`             | `cancel()`                               |
 *
 * All methods are synchronous and return nothing; their effects are the new `status` and the
 * calls made on the dependencies. The current state is read through the `status` property.
 */
export class Order {
  private readonly deps: OrderDependencies;
  private currentStatus: OrderStatus = "DRAFT";
  private placement: OrderPlacement | null = null;

  /**
   * Creates a new draft order.
   *
   * @param deps the collaborators this order uses: the business calendar, the payment module,
   *             the customer notifier and the coupon service (see `OrderDependencies`). Nothing
   *             is asked of them or told to them during construction.
   */
  constructor(deps: OrderDependencies) {
    this.deps = deps;
  }

  /**
   * The order's current lifecycle state (a read-only property, not a method: `order.status`).
   * The values are exactly the specification's state names (`"DRAFT"`, `"PENDING"`, `"PAID"`,
   * `"SHIPPED"`, `"CANCELLED"`; see `OrderStatus`). Reading it has no side effects and consults
   * no dependency.
   */
  get status(): OrderStatus {
    return this.currentStatus;
  }

  /**
   * Places the order (specification action `PlaceOrder`). Permitted only while the order is
   * `"DRAFT"`.
   *
   * Remembers the list price as the order's price and the customer's rank, tells
   * `notifier.sendOrderConfirmation()`, and moves the order to `"PENDING"`. No dependency is
   * queried.
   *
   * @param placement the list price in whole yen (specification input `listPrice`) and the
   *                  customer's membership rank (specification input `customerRank`).
   * @throws OrderActionError when the order is not in the `"DRAFT"` state.
   */
  place(placement: OrderPlacement): void {
    if (this.currentStatus !== "DRAFT") {
      throw new OrderActionError(`Cannot place an order that is ${this.currentStatus}.`);
    }
    this.placement = placement;
    this.deps.notifier.sendOrderConfirmation();
    this.currentStatus = "PENDING";
  }

  /**
   * Takes payment for the order (specification action `Checkout`). Permitted only while the
   * order is `"PENDING"` and `payments.isActive()` returns `true` (specification precondition
   * "The external payment module is active").
   *
   * Asks `payments.isActive()`, then `clock.today()` to determine the campaign that applies
   * (specification query `isMonthEnd`), then `payments.charge(amount)` with the discounted
   * amount (its answer is the specification query `paymentResult`).
   *
   * - Payment succeeded: tells `notifier.sendReceipt({ amount, discountPercent })`, then — only
   *   if the campaign grants a coupon — `coupons.issueCoupon(type)`, in that order, and moves
   *   the order to `"PAID"`.
   * - Payment failed: tells `notifier.notifyPaymentFailure()` and leaves the order `"PENDING"`,
   *   so checkout can be attempted again.
   *
   * @throws OrderActionError when the order is not `"PENDING"` or the payment module is not
   *                          active.
   */
  checkout(): void {
    if (this.currentStatus !== "PENDING") {
      throw new OrderActionError(`Cannot check out an order that is ${this.currentStatus}.`);
    }
    if (!this.deps.payments.isActive()) {
      throw new OrderActionError("Cannot check out while the payment module is not active.");
    }
    const { listPrice, customerRank } = this.placed();
    const campaign = campaignFor(customerRank, isMonthEnd(this.deps.clock.today()));
    const amount = amountCharged(listPrice, campaign.discountPercent);
    if (this.deps.payments.charge(amount) !== "succeeded") {
      this.deps.notifier.notifyPaymentFailure();
      return;
    }
    this.deps.notifier.sendReceipt({ amount, discountPercent: campaign.discountPercent });
    if (campaign.coupon !== null) {
      this.deps.coupons.issueCoupon(campaign.coupon);
    }
    this.currentStatus = "PAID";
  }

  /**
   * Ships the order (specification action `Ship`). Permitted only while the order is `"PAID"`.
   *
   * Tells `notifier.sendShippingNotice(priority)`, where `priority` is decided from the
   * remembered rank and price, and moves the order to `"SHIPPED"`. No dependency is queried.
   *
   * @throws OrderActionError when the order is not in the `"PAID"` state.
   */
  ship(): void {
    if (this.currentStatus !== "PAID") {
      throw new OrderActionError(`Cannot ship an order that is ${this.currentStatus}.`);
    }
    const { listPrice, customerRank } = this.placed();
    this.deps.notifier.sendShippingNotice(isPriorityShipment(customerRank, listPrice));
    this.currentStatus = "SHIPPED";
  }

  /**
   * Cancels the order (specification action `Cancel`). Permitted only while the order is
   * `"PENDING"` or `"PAID"`.
   *
   * If the order had already been paid, tells `payments.refund()`; otherwise nothing is told to
   * any dependency. Either way the order moves to `"CANCELLED"`. No dependency is queried.
   *
   * @throws OrderActionError when the order is neither `"PENDING"` nor `"PAID"`.
   */
  cancel(): void {
    if (this.currentStatus !== "PENDING" && this.currentStatus !== "PAID") {
      throw new OrderActionError(`Cannot cancel an order that is ${this.currentStatus}.`);
    }
    if (refundDueOnCancel(this.currentStatus)) {
      this.deps.payments.refund();
    }
    this.currentStatus = "CANCELLED";
  }

  /** What was ordered; every order past the draft state has it. */
  private placed(): OrderPlacement {
    if (this.placement === null) {
      throw new OrderActionError("The order has not been placed yet.");
    }
    return this.placement;
  }
}
