import type { Clock } from "./calendar.ts";
import { isLastDayOfMonth } from "./calendar.ts";
import { billingAmount, campaignFor } from "./campaign.ts";
import { requiresRefund } from "./cancellation.ts";
import { isPriorityShipment } from "./shipping.ts";
import type { CouponIssuer, CustomerNotifier, CustomerRank, OrderStatus, PaymentGateway } from "./types.ts";

export type OrderDependencies = {
  clock: Clock;
  payments: PaymentGateway;
  notifier: CustomerNotifier;
  coupons: CouponIssuer;
};

type OrderDetails = { rank: CustomerRank; price: number };

/** Raised when an operation is not allowed for the order as it currently stands. */
export class OrderOperationError extends Error {}

export class Order {
  private readonly deps: OrderDependencies;
  private currentStatus: OrderStatus = "DRAFT";
  private details: OrderDetails | null = null;

  constructor(deps: OrderDependencies) {
    this.deps = deps;
  }

  get status(): OrderStatus {
    return this.currentStatus;
  }

  place(rank: CustomerRank, price: number): void {
    this.requireStatus("place", "DRAFT");
    this.details = { rank, price };
    this.currentStatus = "PENDING";
    this.deps.notifier.orderConfirmed();
  }

  checkout(): void {
    this.requireStatus("check out", "PENDING");
    const { rank, price } = this.placedDetails();
    const { payments, notifier, coupons, clock } = this.deps;
    if (!payments.isAvailable()) {
      throw new OrderOperationError("Payment is currently unavailable");
    }

    const campaign = campaignFor(rank, isLastDayOfMonth(clock.today()));
    const amount = billingAmount(price, campaign.discountPercent);
    if (payments.charge(amount) !== "succeeded") {
      notifier.paymentFailed();
      return;
    }

    this.currentStatus = "PAID";
    notifier.receipt(amount, campaign.discountPercent);
    for (const coupon of campaign.coupons) {
      coupons.issue(coupon);
    }
  }

  ship(): void {
    this.requireStatus("ship", "PAID");
    const { rank, price } = this.placedDetails();
    this.currentStatus = "SHIPPED";
    this.deps.notifier.shipped(isPriorityShipment(rank, price));
  }

  cancel(): void {
    this.requireStatus("cancel", "PENDING", "PAID");
    const refund = requiresRefund(this.currentStatus);
    this.currentStatus = "CANCELLED";
    if (refund) {
      this.deps.payments.refund();
    }
  }

  private requireStatus(operation: string, ...allowed: OrderStatus[]): void {
    if (!allowed.includes(this.currentStatus)) {
      throw new OrderOperationError(`Cannot ${operation} an order that is ${this.currentStatus}`);
    }
  }

  private placedDetails(): OrderDetails {
    if (this.details === null) {
      throw new OrderOperationError("Order has not been placed");
    }
    return this.details;
  }
}
