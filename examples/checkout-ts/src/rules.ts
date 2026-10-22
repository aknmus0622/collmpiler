/**
 * Business decisions of the order, as pure functions. They read nothing but their arguments and
 * talk to no dependency; {@link Order} gathers the inputs and acts on the answers.
 */

import type { Campaign, CouponType, CustomerRank, ShippingPlan } from "./types.ts";

/**
 * Evaluates the campaign rules (specification decision table `campaign`).
 * @param rank rank stored on the order (specification `order.rank`).
 * @param isMonthEnd the calendar's answer (specification `calendar.IsMonthEnd`).
 */
export function decideCampaign(rank: CustomerRank, isMonthEnd: boolean): Campaign {
  if (rank === "Gold" && isMonthEnd) {
    return { coupon: "Premium", discountPercent: 20, grantsCoupon: true };
  }
  if (rank === "Silver") {
    return { coupon: null, discountPercent: 5, grantsCoupon: false };
  }
  return { coupon: null, discountPercent: 0, grantsCoupon: false };
}

/**
 * Computes the amount charged at checkout, in whole yen (specification: the value assigned to `amountPaid`
 * and sent as the receipt `amount` in event `Checkout.paid`).
 * @param price list price stored on the order (specification `order.price`).
 * @param discountPercent discount from {@link decideCampaign}.
 */
export function chargedAmount(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

/**
 * Picks the coupon to give out after a successful checkout, if any (specification: the `when` and `type`
 * of the `customer.Coupon` call in event `Checkout.paid`).
 * @param campaign result of {@link decideCampaign}.
 * @returns the coupon to issue, or `null` for none.
 */
export function couponToIssue(campaign: Campaign): CouponType | null {
  return campaign.grantsCoupon && campaign.coupon !== null ? campaign.coupon : null;
}

/**
 * Evaluates the shipping rules (specification decision table `shipping`).
 * @param rank rank stored on the order (specification `order.rank`).
 * @param price list price stored on the order (specification `order.price`).
 */
export function decideShipping(rank: CustomerRank, price: number): ShippingPlan {
  return { priority: rank === "Gold" || price >= 10000 };
}
