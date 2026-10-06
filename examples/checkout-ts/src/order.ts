import { campaignBenefit } from "./campaign.ts";
import type { CouponType, MemberRank } from "./campaign.ts";

export type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

export type PaymentResult = "succeeded" | "failed";

export interface Clock {
  today(): Date;
}

export interface PaymentGateway {
  isAvailable(): boolean;
  charge(): PaymentResult;
  refund(): void;
}

export interface CustomerNotifier {
  sendReceipt(discountRate: number): void;
  notifyPaymentFailure(): void;
  sendShippingNotice(): void;
}

export interface CouponIssuer {
  issue(type: CouponType): void;
}

export type OrderDependencies = {
  clock: Clock;
  payments: PaymentGateway;
  notifier: CustomerNotifier;
  coupons: CouponIssuer;
};

/** A cancelled order must be refunded only if it has already been paid for. */
export function requiresRefund(status: OrderStatus): boolean {
  return status === "PAID";
}

export function canCancel(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PAID";
}

export class Order {
  private currentStatus: OrderStatus = "PENDING";
  private readonly clock: Clock;
  private readonly payments: PaymentGateway;
  private readonly notifier: CustomerNotifier;
  private readonly coupons: CouponIssuer;

  constructor(deps: OrderDependencies) {
    this.clock = deps.clock;
    this.payments = deps.payments;
    this.notifier = deps.notifier;
    this.coupons = deps.coupons;
  }

  get status(): OrderStatus {
    return this.currentStatus;
  }

  checkout(rank: MemberRank): void {
    if (this.currentStatus !== "PENDING" || !this.payments.isAvailable()) {
      return;
    }
    if (this.payments.charge() === "failed") {
      this.notifier.notifyPaymentFailure();
      return;
    }
    const benefit = campaignBenefit(rank, this.clock.today());
    this.notifier.sendReceipt(benefit.discountRate);
    for (const type of benefit.coupons) {
      this.coupons.issue(type);
    }
    this.currentStatus = "PAID";
  }

  cancel(): void {
    if (!canCancel(this.currentStatus)) {
      return;
    }
    if (requiresRefund(this.currentStatus)) {
      this.payments.refund();
    }
    this.currentStatus = "CANCELLED";
  }

  ship(): void {
    if (this.currentStatus !== "PAID") {
      return;
    }
    this.notifier.sendShippingNotice();
    this.currentStatus = "SHIPPED";
  }
}
