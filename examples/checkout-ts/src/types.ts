/**
 * Lifecycle status of an order. The values are the specification's state names, unchanged:
 *
 * - `"DRAFT"`     — the order exists but has not been placed yet (the specification's initial state).
 * - `"PENDING"`   — the order has been placed and is waiting for payment.
 * - `"PAID"`      — payment has been collected.
 * - `"SHIPPED"`   — the order has been handed over for delivery.
 * - `"CANCELLED"` — the order has been cancelled.
 */
export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/**
 * Membership rank of the customer who owns the order. Corresponds to the `customerRank` input of the
 * specification's `PlaceOrder` action and to the remembered `rank` field.
 */
export type CustomerRank = "Gold" | "Silver" | "Bronze";

/** Kind of coupon that can be issued to a customer. Corresponds to the `type` field of `IssueCoupon`. */
export type CouponType = "Premium" | "Standard";

/** Result of an attempt to collect a payment. Corresponds to the specification's `paymentResult` query. */
export type PaymentOutcome = "succeeded" | "failed";

/**
 * A calendar day in the business's own calendar, without a time of day or a time zone.
 */
export interface CalendarDate {
  /** Full year, e.g. 2026. */
  readonly year: number;
  /** Month of the year, 1 (January) to 12 (December). */
  readonly month: number;
  /** Day of the month, starting at 1. */
  readonly day: number;
}

/** Content of the receipt sent to the customer. Corresponds to the payload of `SendReceipt`. */
export interface Receipt {
  /** Amount actually charged, in whole yen. Corresponds to `SendReceipt.amount`. */
  readonly amount: number;
  /** Discount that was applied, in percent. Corresponds to `SendReceipt.discountPercent`. */
  readonly discountPercent: number;
}

/** Content of the shipping notice. Corresponds to the payload of `SendShippingNotice`. */
export interface ShippingNotice {
  /** Whether the shipment is handled with priority. Corresponds to `SendShippingNotice.priority`. */
  readonly priority: boolean;
}

/** What a campaign grants to one checkout. One row of the specification's `CampaignRules` table. */
export interface CampaignOffer {
  /** Discount to apply to the price, in percent. Corresponds to `CampaignRules.discountPercent`. */
  readonly discountPercent: number;
  /**
   * Coupons to issue to the customer, in order. Corresponds to `CampaignRules.effects`: each element is
   * the `type` of one `IssueCoupon` command.
   */
  readonly coupons: readonly CouponType[];
}
