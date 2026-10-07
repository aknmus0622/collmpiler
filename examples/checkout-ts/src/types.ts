/**
 * Membership rank of the customer who places an order.
 * Same names as the specification's `customerRank` input / `rank` data values.
 */
export type MemberRank = "Gold" | "Silver" | "Bronze";

/**
 * Lifecycle state of an order. The values are the specification's state names, unchanged.
 * A newly constructed order is in the specification's initial state.
 */
export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/** Kind of coupon that can be issued (the `type` payload of the specification's `IssueCoupon` effect). */
export type CouponType = "Premium" | "Standard";

/** Outcome of a charge attempt. Same values as the specification's `paymentResult` query. */
export type PaymentResult = "succeeded" | "failed";

/**
 * A calendar day with no time-of-day and no time zone.
 * `month` is 1-12 (1 = January) and `day` is the day of the month starting at 1.
 */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * Input of the PlaceOrder command.
 * `customerRank` is the specification's `customerRank`; `listPrice` is the specification's
 * `listPrice`, a whole number of yen.
 */
export interface PlaceOrderRequest {
  readonly customerRank: MemberRank;
  readonly listPrice: number;
}

/**
 * The campaign terms that apply to a checkout (one row of the specification's `campaign` decision).
 * `discountPercent` is the specification's `discountPercent` column.
 * `coupon` combines the `grantsCoupon` and `coupon` columns: it is the coupon type to issue,
 * or `null` when no coupon is granted.
 */
export interface CampaignTerms {
  readonly discountPercent: number;
  readonly coupon: CouponType | null;
}

/**
 * Content of a payment receipt (payload of the specification's `SendReceipt` effect).
 * `amount` is the amount charged in whole yen; `discountPercent` is the discount applied.
 */
export interface Receipt {
  readonly amount: number;
  readonly discountPercent: number;
}
