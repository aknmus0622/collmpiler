export type CustomerRank = "Gold" | "Silver" | "Bronze";

export const PREMIUM_COUPON = "Premium";
export type CouponType = typeof PREMIUM_COUPON;

export type CampaignResult = { discount: number; coupons: CouponType[] };

export function campaignFor(rank: CustomerRank, isMonthEnd: boolean): CampaignResult {
  if (rank === "Gold" && isMonthEnd) {
    return { discount: 0.2, coupons: [PREMIUM_COUPON] };
  }
  if (rank === "Silver") {
    return { discount: 0.05, coupons: [] };
  }
  return { discount: 0, coupons: [] };
}

export function refundOnCancel(alreadyPaid: boolean): boolean {
  if (alreadyPaid) {
    return true;
  }
  return false;
}

export function priorityShipping(rank: CustomerRank): boolean {
  if (rank === "Gold") {
    return true;
  }
  return false;
}
