import { OrderActionNotAllowedError } from "./errors.ts";
import type { OrderAction } from "./errors.ts";
import { amountCharged, campaignTermsFor, isMonthEnd, shipsWithPriority } from "./policies.ts";
import type { OrderDependencies } from "./ports.ts";
import type { CustomerRank, OrderStatus } from "./types.ts";

/**
 * One customer order, from draft to shipment or cancellation. This is the component the
 * specification describes: each of its actions is one method here, its state is read with
 * {@link Order.status}, and its queries and commands go through the dependencies given to the
 * constructor (see `ports.ts`).
 *
 * | Specification action | Method                           |
 * | -------------------- | -------------------------------- |
 * | `PlaceOrder`         | `place(customerRank, listPrice)` |
 * | `Checkout`           | `checkout()`                     |
 * | `Ship`               | `ship()`                         |
 * | `Cancel`             | `cancel()`                       |
 *
 * All methods are synchronous. Within one action the dependencies are called in the order in
 * which the specification lists that transition's commands. An action that the specification
 * does not allow right now throws {@link OrderActionNotAllowedError} and changes nothing.
 *
 * A new order starts in the specification's initial state.
 */
export class Order {
  private readonly deps: OrderDependencies;
  /** Specification state. */
  private currentStatus: OrderStatus = "DRAFT";
  /** Specification data `rank`; absent until the order is placed. */
  private rank: CustomerRank | undefined;
  /** Specification data `price`, in whole yen; absent until the order is placed. */
  private price: number | undefined;

  /**
   * @param deps the calendar, payment gateway, notifier and coupon issuer this order uses for
   *   its whole life. They are only stored here; nothing is called until an action runs.
   */
  constructor(deps: OrderDependencies) {
    this.deps = deps;
  }

  /**
   * The current state of the order, as one of the specification's state names.
   * Calls no dependency.
   */
  status(): OrderStatus {
    return this.currentStatus;
  }

  /**
   * Specification action `PlaceOrder`.
   *
   * Tells {@link CustomerNotifier.sendOrderConfirmation}.
   *
   * @param customerRank the action's `customerRank` input.
   * @param listPrice the action's `listPrice` input, in whole yen.
   */
  place(customerRank: CustomerRank, listPrice: number): void {
    if (this.currentStatus !== "DRAFT") {
      throw this.notAllowed("place");
    }
    this.rank = customerRank;
    this.price = listPrice;
    this.currentStatus = "PENDING";
    this.deps.notifier.sendOrderConfirmation();
  }

  /**
   * Specification action `Checkout` (no input).
   *
   * Asks {@link PaymentGateway.isActive} first, then {@link BusinessCalendar.today}, then
   * {@link PaymentGateway.charge} for the outcome of the payment. Depending on that outcome it
   * tells {@link CustomerNotifier.sendReceipt} and possibly {@link CouponIssuer.issue}, or
   * {@link CustomerNotifier.notifyPaymentFailure}.
   */
  checkout(): void {
    const active = this.deps.payments.isActive();
    if (this.currentStatus !== "PENDING" || !active) {
      throw this.notAllowed("checkout");
    }
    const { rank, price } = this.placed("checkout");
    const terms = campaignTermsFor(rank, isMonthEnd(this.deps.calendar.today()));
    const amount = amountCharged(price, terms.discountPercent);
    if (this.deps.payments.charge(amount) !== "succeeded") {
      this.deps.notifier.notifyPaymentFailure();
      return;
    }
    this.currentStatus = "PAID";
    this.deps.notifier.sendReceipt({ amount, discountPercent: terms.discountPercent });
    if (terms.grantsCoupon) {
      this.deps.coupons.issue(terms.coupon);
    }
  }

  /**
   * Specification action `Ship` (no input).
   *
   * Tells {@link CustomerNotifier.sendShippingNotice}.
   */
  ship(): void {
    if (this.currentStatus !== "PAID") {
      throw this.notAllowed("ship");
    }
    const { rank, price } = this.placed("ship");
    this.currentStatus = "SHIPPED";
    this.deps.notifier.sendShippingNotice(shipsWithPriority(rank, price));
  }

  /**
   * Specification action `Cancel` (no input).
   *
   * May tell {@link PaymentGateway.refund}.
   */
  cancel(): void {
    if (this.currentStatus !== "PENDING" && this.currentStatus !== "PAID") {
      throw this.notAllowed("cancel");
    }
    const wasPaid = this.currentStatus === "PAID";
    this.currentStatus = "CANCELLED";
    if (wasPaid) {
      this.deps.payments.refund();
    }
  }

  private notAllowed(action: OrderAction): OrderActionNotAllowedError {
    return new OrderActionNotAllowedError(action, this.currentStatus);
  }

  /** The rank and price remembered since the order was placed. */
  private placed(action: OrderAction): { rank: CustomerRank; price: number } {
    if (this.rank === undefined || this.price === undefined) {
      throw this.notAllowed(action);
    }
    return { rank: this.rank, price: this.price };
  }
}
