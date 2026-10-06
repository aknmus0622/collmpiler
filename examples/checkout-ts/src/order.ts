import type { Calendar, CouponIssuer, CustomerNotifier, PaymentGateway } from "./dependencies.ts";
import { campaignFor, priorityShipping, refundOnCancel } from "./policies.ts";
import type { CustomerRank } from "./policies.ts";

export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

export type OrderDependencies = {
  payments: PaymentGateway;
  calendar: Calendar;
  notifier: CustomerNotifier;
  coupons: CouponIssuer;
};

export class Order {
  private currentStatus: OrderStatus = "DRAFT";
  private rank: CustomerRank | undefined = undefined;
  private readonly deps: OrderDependencies;

  constructor(deps: OrderDependencies) {
    this.deps = deps;
  }

  get status(): OrderStatus {
    return this.currentStatus;
  }

  place(customerRank: CustomerRank): void {
    if (this.currentStatus !== "DRAFT") return;
    this.rank = customerRank;
    this.currentStatus = "PENDING";
    this.deps.notifier.orderConfirmed();
  }

  checkout(): void {
    if (this.currentStatus !== "PENDING" || this.rank === undefined) return;
    if (!this.deps.payments.isAvailable()) return;

    if (this.deps.payments.charge() === "declined") {
      this.deps.notifier.paymentFailed();
      return;
    }

    const campaign = campaignFor(this.rank, this.deps.calendar.isMonthEnd());
    this.currentStatus = "PAID";
    this.deps.notifier.receipt(campaign.discount);
    for (const type of campaign.coupons) {
      this.deps.coupons.issue(type);
    }
  }

  ship(): void {
    if (this.currentStatus !== "PAID" || this.rank === undefined) return;
    this.currentStatus = "SHIPPED";
    this.deps.notifier.shippingNotice(priorityShipping(this.rank));
  }

  cancel(): void {
    if (this.currentStatus !== "PENDING" && this.currentStatus !== "PAID") return;
    const refund = refundOnCancel(this.currentStatus === "PAID");
    this.currentStatus = "CANCELLED";
    if (refund) {
      this.deps.payments.refund();
    }
  }
}
