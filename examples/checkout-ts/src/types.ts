/**
 * Shared vocabulary of the order component.
 *
 * Specification names are kept verbatim for states, member ranks and coupon types, so no
 * translation is needed for those values.
 */

/**
 * Lifecycle state of an order. The values are exactly the specification's state names.
 *
 * - `"DRAFT"`     – the order exists but has not been placed yet (the starting state).
 * - `"PENDING"`   – the order has been placed and awaits payment.
 * - `"PAID"`      – payment succeeded; the order awaits shipment.
 * - `"SHIPPED"`   – the order has been shipped (final).
 * - `"CANCELLED"` – the order has been cancelled (final).
 */
export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/**
 * Membership rank of the customer who placed the order (specification: `customerRank` input,
 * `rank` data field). Values are exactly the specification's.
 */
export type CustomerRank = "Gold" | "Silver" | "Bronze";

/**
 * Kind of coupon that can be issued to a customer (specification: the `type` field of the
 * `IssueCoupon` command). Values are exactly the specification's.
 */
export type CouponType = "Premium" | "Standard";

/**
 * Outcome of an attempt to take payment (specification: the `paymentResult` query, same values).
 */
export type PaymentOutcome = "succeeded" | "failed";

/**
 * A calendar date in the shop's business calendar, with no time of day and no time zone.
 *
 * - `year`  – full year, e.g. `2026`.
 * - `month` – month of the year, **1-based**: `1` = January … `12` = December.
 * - `day`   – day of the month, 1-based: `1` … `31`.
 *
 * The specification's `isMonthEnd` query is derived from this value: it is month-end exactly
 * when `day` is the last calendar day of `month` in `year` (leap years included). For example
 * `{ year: 2026, month: 1, day: 31 }` is month-end and `{ year: 2026, month: 1, day: 15 }` is not.
 */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * What the customer asks for when placing an order (the input of the specification's
 * `PlaceOrder` action).
 *
 * - `listPrice`    – list price of the order in whole yen (specification: `listPrice`; an integer
 *                    from 0 to 1,000,000). Remembered by the order as its price (`price`).
 * - `customerRank` – the customer's membership rank (specification: `customerRank`). Remembered
 *                    by the order as its rank (`rank`).
 */
export interface OrderPlacement {
  readonly listPrice: number;
  readonly customerRank: CustomerRank;
}

/**
 * Content of the receipt sent after a successful payment (the payload of the specification's
 * `SendReceipt` command).
 *
 * - `amount`          – the amount actually charged, in whole yen (specification: `amount`).
 * - `discountPercent` – the campaign discount that was applied, as a whole-number percentage
 *                       such as `5` for 5 % (specification: `discountPercent`).
 */
export interface Receipt {
  readonly amount: number;
  readonly discountPercent: number;
}

/**
 * Result of evaluating the checkout campaign for an order (one row of the specification's
 * `CampaignRules` decision table).
 *
 * - `discountPercent` – percentage taken off the price (specification column `discountPercent`).
 * - `coupon`          – the type of coupon to issue to the customer, or `null` when the campaign
 *                       issues none (specification column `effects`: an `IssueCoupon` command with
 *                       that `type`, or an empty list).
 */
export interface CampaignOutcome {
  readonly discountPercent: number;
  readonly coupon: CouponType | null;
}
