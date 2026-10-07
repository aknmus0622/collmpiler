import type { OrderDependencies } from "./dependencies.ts";
import {
  amountCharged,
  cancellationRequiresRefund,
  isPriorityShipment,
  selectCampaignOffer,
} from "./rules.ts";
import type { CustomerRank, OrderStatus } from "./types.ts";

/**
 * One customer order, from draft to shipment or cancellation. This is the component described by the
 * specification: its four actions are the methods {@link Order.placeOrder}, {@link Order.checkout},
 * {@link Order.ship} and {@link Order.cancel}; its state is read through {@link Order.status}.
 *
 * A newly constructed order is in the specification's initial state and remembers no price or rank.
 *
 * All actions are synchronous: when a method returns, the status has been updated and every call to a
 * dependency belonging to that action has been made, in the order the specification lists its commands.
 * An action invoked in a status where the specification does not allow it, or while one of its
 * preconditions does not hold, throws an `Error` and leaves the order untouched.
 */
export class Order {
  private readonly dependencies: OrderDependencies;
  private currentStatus: OrderStatus = "DRAFT";
  private placedPrice: number | undefined;
  private placedRank: CustomerRank | undefined;

  /**
   * @param dependencies the calendar, payment module, customer notifier and coupon issuer this order
   *   works with. They are consulted afresh on every action.
   */
  constructor(dependencies: OrderDependencies) {
    this.dependencies = dependencies;
  }

  /** The current state of the order; see {@link OrderStatus} for the meaning of each value. */
  get status(): OrderStatus {
    return this.currentStatus;
  }

  /**
   * The list price the order was placed with, in whole yen, or `undefined` while nothing has been
   * placed yet. Corresponds to the remembered `price` field.
   */
  get price(): number | undefined {
    return this.placedPrice;
  }

  /**
   * The membership rank the order was placed with, or `undefined` while nothing has been placed yet.
   * Corresponds to the remembered `rank` field.
   */
  get rank(): CustomerRank | undefined {
    return this.placedRank;
  }

  /**
   * Performs the specification's `PlaceOrder` action: records what is being ordered and by whom.
   *
   * @param listPrice the price of the order in whole yen (the action's `listPrice` input).
   * @param customerRank the customer's membership rank (the action's `customerRank` input).
   */
  placeOrder(listPrice: number, customerRank: CustomerRank): void {
    this.requireStatus("place", "DRAFT");
    this.placedPrice = listPrice;
    this.placedRank = customerRank;
    this.currentStatus = "PENDING";
    this.dependencies.notifier.sendOrderConfirmation();
  }

  /**
   * Performs the specification's `Checkout` action (no input): tries to collect the payment through
   * the payment module and informs the customer of the result. Consults the calendar and the payment
   * module while it runs.
   */
  checkout(): void {
    this.requireStatus("check out", "PENDING");
    const { calendar, payments, notifier, coupons } = this.dependencies;
    if (!payments.isActive()) {
      throw new Error("Cannot check out the order: the payment module is not active");
    }
    const { price, rank } = this.placedDetails();
    const offer = selectCampaignOffer(rank, calendar.today());
    const amount = amountCharged(price, offer.discountPercent);
    if (payments.charge(amount) !== "succeeded") {
      notifier.notifyPaymentFailure();
      return;
    }
    this.currentStatus = "PAID";
    notifier.sendReceipt({ amount, discountPercent: offer.discountPercent });
    for (const coupon of offer.coupons) {
      coupons.issueCoupon(coupon);
    }
  }

  /** Performs the specification's `Ship` action (no input): sends the order to the customer. */
  ship(): void {
    this.requireStatus("ship", "PAID");
    const { price, rank } = this.placedDetails();
    this.currentStatus = "SHIPPED";
    this.dependencies.notifier.sendShippingNotice({ priority: isPriorityShipment(rank, price) });
  }

  /** Performs the specification's `Cancel` action (no input): calls the order off. */
  cancel(): void {
    this.requireStatus("cancel", "PENDING", "PAID");
    const refund = cancellationRequiresRefund(this.currentStatus);
    this.currentStatus = "CANCELLED";
    if (refund) {
      this.dependencies.payments.refund();
    }
  }

  /** Throws unless the order is in one of the statuses in which the action is allowed. */
  private requireStatus(action: string, ...allowed: OrderStatus[]): void {
    if (!allowed.includes(this.currentStatus)) {
      throw new Error(`Cannot ${action} the order while it is ${this.currentStatus}`);
    }
  }

  /** The price and rank recorded when the order was placed; every order past the draft has both. */
  private placedDetails(): { price: number; rank: CustomerRank } {
    if (this.placedPrice === undefined || this.placedRank === undefined) {
      throw new Error("The order has not been placed");
    }
    return { price: this.placedPrice, rank: this.placedRank };
  }
}
