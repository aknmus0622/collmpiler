import type { CalendarDate, CampaignOffer, CustomerRank, OrderStatus } from "./types.ts";

/*
 * Business decisions of the order component, as pure functions: they read only their arguments and
 * touch no dependency. The rules themselves are defined by the specification.
 */

/** Whether `year` has a 29 February in the Gregorian calendar. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Number of days in the given month (1 to 12) of the given year. */
function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/**
 * Answers the specification's `isMonthEnd` question for a calendar day.
 *
 * @param date the day to examine.
 */
export function isMonthEnd(date: CalendarDate): boolean {
  return date.day === daysInMonth(date.year, date.month);
}

/**
 * Selects the campaign offer for a checkout. Implements the specification's `CampaignRules` table.
 *
 * @param rank the customer's membership rank (the remembered `rank`).
 * @param today the current business day, as given by the calendar.
 */
export function selectCampaignOffer(rank: CustomerRank, today: CalendarDate): CampaignOffer {
  if (rank === "Gold" && isMonthEnd(today)) {
    return { discountPercent: 20, coupons: ["Premium"] };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupons: [] };
  }
  return { discountPercent: 0, coupons: [] };
}

/**
 * Computes the amount to charge, in whole yen. Implements the specification's "Amount charged" formula.
 *
 * @param price the order's price in whole yen (the remembered `price`).
 * @param discountPercent the discount to apply, in percent.
 */
export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

/**
 * Decides whether cancelling an order requires a refund. Implements the specification's `CancelRules`
 * table: `true` means its `effects` contain one `Refund`, `false` means they are empty.
 *
 * @param status the order's status at the moment it is cancelled.
 */
export function cancellationRequiresRefund(status: OrderStatus): boolean {
  return status === "PAID";
}

/**
 * Decides whether an order is shipped with priority. Implements the specification's `ShippingRules`
 * table; the result is its `priority` column.
 *
 * @param rank the customer's membership rank (the remembered `rank`).
 * @param price the order's price in whole yen (the remembered `price`).
 */
export function isPriorityShipment(rank: CustomerRank, price: number): boolean {
  return rank === "Gold" || price >= 10000;
}
