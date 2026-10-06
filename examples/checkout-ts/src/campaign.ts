export type MemberRank = "Gold" | "Silver" | "Bronze";
export type CouponType = "Premium" | "Standard";

export type CampaignBenefit = {
  discountRate: number;
  coupons: CouponType[];
};

/** True when `date` is the last day of its month (UTC calendar). */
export function isMonthEnd(date: Date): boolean {
  const nextDay = new Date(date.getTime());
  nextDay.setUTCDate(date.getUTCDate() + 1);
  return nextDay.getUTCMonth() !== date.getUTCMonth();
}

/** Campaign benefit applied to a successful checkout. */
export function campaignBenefit(rank: MemberRank, purchasedOn: Date): CampaignBenefit {
  if (rank === "Gold" && isMonthEnd(purchasedOn)) {
    return { discountRate: 0.2, coupons: ["Premium"] };
  }
  if (rank === "Silver") {
    return { discountRate: 0.05, coupons: [] };
  }
  return { discountRate: 0, coupons: [] };
}
