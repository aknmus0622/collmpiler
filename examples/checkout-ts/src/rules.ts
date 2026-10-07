/**
 * The business decisions of the order component, as pure functions. They touch no dependency
 * and remember nothing; `Order` (order.ts) gathers their inputs and acts on their results.
 */
import type { CalendarDate, CampaignTerms, CouponType, CustomerRank } from "./types.ts";

/** Orders at or above this list price ship with priority, whatever the customer's rank. */
const PRIORITY_SHIPPING_MIN_PRICE_YEN = 10000;

/**
 * Tells whether a date is the last day of its calendar month.
 * Produces the value the specification obtains from its `isMonthEnd` query.
 *
 * @param date the date to examine.
 */
export function isMonthEnd(date: CalendarDate): boolean {
  // The day after a month-end falls in a different month.
  const nextDay = new Date(0);
  nextDay.setUTCFullYear(date.year, date.month - 1, date.day + 1);
  return nextDay.getUTCMonth() !== date.month - 1;
}

/**
 * Selects the campaign terms for a checkout.
 * Implements the specification's `campaign` decision table.
 *
 * @param rank the rank remembered by the order (specification data field `rank`).
 * @param monthEnd whether today is month-end (specification query `isMonthEnd`).
 */
export function campaignFor(rank: CustomerRank, monthEnd: boolean): CampaignTerms {
  if (rank === "Gold" && monthEnd) {
    return campaignTerms(20, "Premium");
  }
  if (rank === "Silver") {
    return campaignTerms(5, "Standard");
  }
  return campaignTerms(0, "Standard");
}

/** A campaign grants a coupon exactly when it names one above the standard type. */
function campaignTerms(discountPercent: number, coupon: CouponType): CampaignTerms {
  return { discountPercent, grantsCoupon: coupon !== "Standard", coupon };
}

/**
 * Computes the amount to charge, in whole yen.
 * Implements the specification's `amountCharged` calculation.
 *
 * @param priceYen the list price remembered by the order (specification data field `price`).
 * @param discountPercent the discount in whole percent, as chosen by {@link campaignFor}.
 */
export function amountCharged(priceYen: number, discountPercent: number): number {
  return Math.floor((priceYen * (100 - discountPercent)) / 100);
}

/**
 * Decides whether an order ships with priority.
 * Implements the `priority` column of the specification's `shipping` decision table.
 *
 * @param rank the rank remembered by the order (specification data field `rank`).
 * @param priceYen the list price remembered by the order (specification data field `price`).
 */
export function isPriorityShipping(rank: CustomerRank, priceYen: number): boolean {
  return rank === "Gold" || priceYen >= PRIORITY_SHIPPING_MIN_PRICE_YEN;
}
