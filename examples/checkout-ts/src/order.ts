import { amountCharged, decideCampaign, isPriorityShipping } from "./policy.ts";
import type { OrderDependencies } from "./ports.ts";
import type { MemberRank, OrderStatus, PlaceOrderRequest } from "./types.ts";

/**
 * One customer order: the component described by the specification.
 *
 * Create one instance per order; it starts in the specification's initial state. Drive it with
 * the four command methods and read the resulting state from `status`. All methods are
 * synchronous: every dependency call a command makes has happened by the time it returns, in
 * the order the specification lists the effects.
 *
 * Each command is meant to be called only in the states, and under the preconditions, that the
 * specification allows for it; what happens otherwise is unspecified.
 */
export class Order {
  private readonly deps: OrderDependencies;
  private state: OrderStatus = "DRAFT";
  // Set by placeOrder; every order past the draft state has both.
  private rank: MemberRank = "Bronze";
  private price = 0;

  /** `deps` are the order's collaborators; they are kept and used by the command methods. */
  constructor(deps: OrderDependencies) {
    this.deps = deps;
  }

  /** The current state, as a specification state name. */
  get status(): OrderStatus {
    return this.state;
  }

  /**
   * Specification command `PlaceOrder`. Remembers the customer's rank and the list price from
   * `request` (the specification's `rank` and `price` data) and tells the notifier to send the
   * order confirmation.
   */
  placeOrder(request: PlaceOrderRequest): void {
    this.rank = request.customerRank;
    this.price = request.listPrice;
    this.state = "PENDING";
    this.deps.notifier.sendOrderConfirmation();
  }

  /**
   * Specification command `Checkout` (no input). Asks the payment gateway whether it is active
   * and for the charge outcome, and the calendar for today's date; depending on the outcome it
   * tells the notifier to send a receipt or a payment-failure notice, and may tell the coupon
   * issuer to issue a coupon.
   */
  checkout(): void {
    const { calendar, payments, notifier, coupons } = this.deps;
    if (!payments.isActive()) {
      return;
    }
    const terms = decideCampaign(this.rank, calendar.today());
    const amount = amountCharged(this.price, terms.discountPercent);
    if (payments.charge(amount) !== "succeeded") {
      notifier.notifyPaymentFailure();
      return;
    }
    this.state = "PAID";
    notifier.sendReceipt({ amount, discountPercent: terms.discountPercent });
    if (terms.coupon !== null) {
      coupons.issue(terms.coupon);
    }
  }

  /**
   * Specification command `Ship` (no input). Tells the notifier to send the shipping notice.
   */
  ship(): void {
    this.state = "SHIPPED";
    this.deps.notifier.sendShippingNotice(isPriorityShipping(this.rank, this.price));
  }

  /**
   * Specification command `Cancel` (no input). May tell the payment gateway to refund.
   */
  cancel(): void {
    const wasPaid = this.state === "PAID";
    this.state = "CANCELLED";
    if (wasPaid) {
      this.deps.payments.refund();
    }
  }
}
