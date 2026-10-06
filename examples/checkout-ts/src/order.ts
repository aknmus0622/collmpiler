import type { OrderDependencies } from "./dependencies.ts";
import { amountCharged, campaignFor, isPriorityShipment } from "./rules.ts";
import type { MemberRank } from "./rules.ts";

export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

type OrderDetails = { rank: MemberRank; price: number };

/**
 * The lifecycle of a single order. A request that is not valid in the current
 * status is ignored and reported by returning false.
 */
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

  place(rank: MemberRank, listPrice: number): boolean {
    if (this.currentStatus !== "DRAFT") return false;
    this.details = { rank, price: listPrice };
    this.currentStatus = "PENDING";
    this.deps.notifier.orderConfirmed();
    return true;
  }

  checkout(): boolean {
    const details = this.details;
    if (this.currentStatus !== "PENDING" || details === null) return false;
    if (!this.deps.payments.isAvailable()) return false;

    if (this.deps.payments.charge() !== "succeeded") {
      this.deps.notifier.paymentFailed();
      return true;
    }

    const campaign = campaignFor(details.rank, this.deps.calendar.isMonthEnd());
    this.currentStatus = "PAID";
    this.deps.notifier.receipt(
      amountCharged(details.price, campaign.discountPercent),
      campaign.discountPercent,
    );
    if (campaign.coupon !== null) {
      this.deps.coupons.issue(campaign.coupon);
    }
    return true;
  }

  ship(): boolean {
    const details = this.details;
    if (this.currentStatus !== "PAID" || details === null) return false;
    this.currentStatus = "SHIPPED";
    this.deps.notifier.shippingNotice(isPriorityShipment(details.rank, details.price));
    return true;
  }

  cancel(): boolean {
    const wasPaid = this.currentStatus === "PAID";
    if (!wasPaid && this.currentStatus !== "PENDING") return false;
    this.currentStatus = "CANCELLED";
    if (wasPaid) {
      this.deps.payments.refund();
    }
    return true;
  }
}
