/**
 * Shared value types for the order component.
 */

/**
 * Membership rank of the customer who places an order.
 * Corresponds to the specification's `customerRank` input and `rank` data field.
 */
export type CustomerRank = "Gold" | "Silver" | "Bronze";

/**
 * Lifecycle state of an order. The names are the specification's state names, unchanged.
 *
 * - `DRAFT`: the order has been created but not yet placed (the starting state).
 * - `PENDING`: the order has been placed and awaits payment.
 * - `PAID`: payment has been taken.
 * - `SHIPPED`: the order has been handed over for shipping.
 * - `CANCELLED`: the order has been cancelled.
 */
export type OrderState = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/**
 * Kind of coupon that can be issued to a customer.
 * Corresponds to the `type` payload of the specification's `IssueCoupon` effect.
 */
export type CouponType = "Premium" | "Standard";

/**
 * Outcome of a charge attempt reported by the payment gateway.
 * Corresponds to the specification's `paymentResult` query.
 */
export type PaymentResult = "succeeded" | "failed";

/**
 * A calendar date without time or time zone.
 */
export interface CalendarDate {
  /** Full year, e.g. 2026. */
  readonly year: number;
  /** Month of the year, 1 (January) to 12 (December). */
  readonly month: number;
  /** Day of the month, starting at 1. */
  readonly day: number;
}

/**
 * The campaign terms that apply to one checkout.
 * Corresponds to one row of the specification's `campaign` decision table.
 */
export interface CampaignTerms {
  /** Discount in whole percent (specification column `discountPercent`). */
  readonly discountPercent: number;
  /** Whether a coupon is issued at all (specification column `grantsCoupon`). */
  readonly grantsCoupon: boolean;
  /** The coupon type the campaign names (specification column `coupon`). */
  readonly coupon: CouponType;
}

/**
 * Contents of the receipt sent to the customer after a successful payment.
 * Corresponds to the payload of the specification's `SendReceipt` effect.
 */
export interface Receipt {
  /** Amount charged, in whole yen (specification payload field `amount`). */
  readonly amountYen: number;
  /** Discount applied, in whole percent (specification payload field `discountPercent`). */
  readonly discountPercent: number;
}
