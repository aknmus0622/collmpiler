import type { CalendarDate, CampaignTerms, CustomerRank } from "./types.ts";

/**
 * Pure business decisions of the order component. Nothing here talks to a dependency or keeps
 * state; {@link Order} calls these with values it has remembered or just asked for.
 */

/** List price, in whole yen, from which an order ships with priority whatever the rank. */
const PRIORITY_SHIPPING_MIN_PRICE = 10000;

/**
 * Whether the given date counts as a month-end. This is how the specification's `isMonthEnd`
 * query is derived from {@link BusinessCalendar.today}.
 */
export function isMonthEnd(date: CalendarDate): boolean {
  // Day 0 of the following month (0-based index `date.month`) is the last day of this month.
  const lastDay = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
  return date.day === lastDay;
}

/**
 * The specification's `campaign` decision table: the campaign terms for one order.
 *
 * @param rank the customer's rank (specification data `rank`).
 * @param monthEnd whether it is month-end (specification query `isMonthEnd`).
 * @returns the columns of the row that applies. The `coupon` column is given only by a row that
 *   grants a coupon; in the other rows no coupon is issued, so its kind decides nothing.
 */
export function campaignTermsFor(rank: CustomerRank, monthEnd: boolean): CampaignTerms {
  if (rank === "Gold" && monthEnd) {
    return { discountPercent: 20, coupon: "Premium", grantsCoupon: true };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, grantsCoupon: false };
  }
  return { discountPercent: 0, grantsCoupon: false };
}

/**
 * The specification's `amountCharged` formula.
 *
 * @param price the order's list price in whole yen (specification data `price`).
 * @param discountPercent the campaign discount as a whole percentage.
 * @returns the amount to charge, in whole yen.
 */
export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

/**
 * The specification's `shipping` decision table.
 *
 * @param rank the customer's rank (specification data `rank`).
 * @param price the order's list price in whole yen (specification data `price`).
 * @returns the table's `priority` column for the row that applies.
 */
export function shipsWithPriority(rank: CustomerRank, price: number): boolean {
  if (rank === "Gold" || price >= PRIORITY_SHIPPING_MIN_PRICE) {
    return true;
  }
  return false;
}
