/**
 * Business decisions of the order component, as pure functions: no dependencies, no state, the
 * same answer for the same arguments. `Order` consults these and does the talking to the
 * outside world itself.
 */
import type { CalendarDate, CampaignOutcome, CustomerRank, OrderStatus } from "./types.ts";

/** Orders priced at or above this many yen ship with priority, whatever the customer's rank. */
const PRIORITY_SHIPMENT_MIN_PRICE = 10000;

/** Days in each month of a non-leap year, January first. */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Tells whether `date` is month-end, i.e. the last calendar day of its month, taking leap years
 * into account (specification: the meaning of the `isMonthEnd` query).
 *
 * @param date a calendar date with a 1-based `month` and a 1-based `day`.
 * @returns `true` when `date.day` is the last day of `date.month` in `date.year`.
 */
export function isMonthEnd(date: CalendarDate): boolean {
  return date.day === daysInMonth(date.year, date.month);
}

/**
 * Decides which checkout campaign applies to an order (specification: the `CampaignRules`
 * decision table).
 *
 * @param rank the customer's membership rank remembered by the order (`rank`).
 * @param monthEnd whether today is month-end (specification: `isMonthEnd`).
 * @returns the discount percentage to apply and the coupon to issue, if any.
 */
export function campaignFor(rank: CustomerRank, monthEnd: boolean): CampaignOutcome {
  if (rank === "Gold" && monthEnd) {
    return { discountPercent: 20, coupon: "Premium" };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupon: null };
  }
  return { discountPercent: 0, coupon: null };
}

/**
 * Computes the amount to charge for an order (specification: the formula "Amount charged:
 * price × (100 − discount percent) ÷ 100, rounded down to a whole yen").
 *
 * @param price the order's price in whole yen (`price`).
 * @param discountPercent the campaign discount as a percentage, e.g. `5` for 5 %.
 * @returns the amount charged, in whole yen.
 */
export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

/**
 * Decides whether cancelling an order in the given state requires a refund (specification: the
 * `CancelRules` decision table; `true` corresponds to the row "The order has been paid", whose
 * effect is the `Refund` command, and `false` to the default row with no effect).
 *
 * @param status the order's state at the moment it is cancelled, before the cancellation.
 * @returns `true` when the customer must be refunded.
 */
export function refundDueOnCancel(status: OrderStatus): boolean {
  return status === "PAID";
}

/**
 * Decides whether an order is shipped with priority (specification: the `ShippingRules` decision
 * table, column `priority`).
 *
 * @param rank the customer's membership rank remembered by the order (`rank`).
 * @param price the order's price in whole yen remembered by the order (`price`) — the list
 *              price, not the discounted amount charged.
 * @returns `true` for priority shipping, `false` for standard shipping.
 */
export function isPriorityShipment(rank: CustomerRank, price: number): boolean {
  return rank === "Gold" || price >= PRIORITY_SHIPMENT_MIN_PRICE;
}
