import type { CalendarDate, CampaignTerms, MemberRank } from "./types.ts";

/**
 * Pure business decisions of the order component. Nothing here touches a dependency or the
 * order's state; `Order` calls these and acts on the results.
 */

/** Orders of at least this many yen ship with priority, whatever the customer's rank. */
const PRIORITY_SHIPPING_MIN_PRICE = 10000;

/** Tells whether `date` is the last day of its month (the specification's notion of month-end). */
export function isMonthEnd(date: CalendarDate): boolean {
  // The day after a month's last day falls in another month; month lengths and leap years
  // are left to the platform's calendar arithmetic.
  const nextDay = new Date(0);
  nextDay.setUTCFullYear(date.year, date.month - 1, date.day + 1);
  return nextDay.getUTCMonth() !== date.month - 1;
}

/**
 * The specification's `campaign` decision table.
 * `rank` is the customer's remembered rank and `today` is the current business date.
 */
export function decideCampaign(rank: MemberRank, today: CalendarDate): CampaignTerms {
  if (rank === "Gold" && isMonthEnd(today)) {
    return { discountPercent: 20, coupon: "Premium" };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupon: null };
  }
  return { discountPercent: 0, coupon: null };
}

/**
 * The specification's `amountCharged` calculation.
 * `price` is the order's remembered price in whole yen and `discountPercent` is the campaign
 * discount; the result is in whole yen.
 */
export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

/**
 * The specification's `shipping` decision table; the result is its `priority` column.
 * `rank` and `price` are the order's remembered rank and price (whole yen).
 */
export function isPriorityShipping(rank: MemberRank, price: number): boolean {
  return rank === "Gold" || price >= PRIORITY_SHIPPING_MIN_PRICE;
}
