/**
 * Lifecycle status of an order. The values are the specification's state names, unchanged:
 *
 * - `"DRAFT"`: the order object exists but has not been placed yet (the starting status).
 * - `"PENDING"`: the order has been placed and awaits a successful payment.
 * - `"PAID"`: the payment has been taken.
 * - `"SHIPPED"`: the order has been handed over for delivery.
 * - `"CANCELLED"`: the order has been cancelled.
 */
export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/**
 * Membership rank of the customer who places the order. The values are the specification's
 * `customerRank` / `rank` values, unchanged.
 */
export type CustomerRank = "Gold" | "Silver" | "Bronze";

/**
 * Kind of coupon that can be issued. The values are the allowed values of the `type` field of the
 * specification's `IssueCoupon` command, unchanged.
 */
export type CouponType = "Premium" | "Standard";

/**
 * Result of one payment attempt, as reported by the {@link PaymentGateway}. The values are the
 * allowed answers of the specification's `paymentResult` query, unchanged.
 */
export type PaymentOutcome = "succeeded" | "failed";

/**
 * A calendar day in the shop's business calendar, free of time-of-day and time zone.
 * Used as the answer of {@link BusinessCalendar.today}.
 */
export interface CalendarDate {
  /** Four-digit year, e.g. `2026`. */
  year: number;
  /** Month of the year, `1` (January) to `12` (December). */
  month: number;
  /** Day of the month, starting at `1`. */
  day: number;
}

/**
 * What the customer is told on the receipt. Corresponds to the payload of the specification's
 * `SendReceipt` command, field for field.
 */
export interface Receipt {
  /** Amount charged, in whole yen (specification: `SendReceipt.amount`). */
  amount: number;
  /** Discount applied, as a whole percentage (specification: `SendReceipt.discountPercent`). */
  discountPercent: number;
}

/**
 * The terms the current campaign gives one order. Corresponds to one row of the specification's
 * `campaign` decision table: `discountPercent` and `grantsCoupon` column for column, and the
 * `coupon` column for the rows that grant a coupon. A row that grants none has no `coupon`: the
 * specification never issues that row's coupon, so its kind is not a decision of this code.
 */
export type CampaignTerms =
  | {
      /** Discount as a whole percentage (specification column `discountPercent`). */
      discountPercent: number;
      /** A coupon is issued (specification column `grantsCoupon`). */
      grantsCoupon: true;
      /** Kind of coupon that is issued (specification column `coupon`). */
      coupon: CouponType;
    }
  | {
      /** Discount as a whole percentage (specification column `discountPercent`). */
      discountPercent: number;
      /** No coupon is issued (specification column `grantsCoupon`). */
      grantsCoupon: false;
    };
