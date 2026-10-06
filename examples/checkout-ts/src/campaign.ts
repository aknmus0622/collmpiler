import type { CouponType, CustomerRank } from "./types.ts";

export type CampaignOutcome = {
  discountPercent: number;
  coupons: CouponType[];
};

/** Decides the discount and the coupons granted for a successful payment. */
export function campaignFor(rank: CustomerRank, monthEnd: boolean): CampaignOutcome {
  if (rank === "Gold" && monthEnd) {
    return { discountPercent: 20, coupons: ["Premium"] };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupons: [] };
  }
  return { discountPercent: 0, coupons: [] };
}

/** Price after discount, fractions of a yen rounded down. */
export function billingAmount(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}
