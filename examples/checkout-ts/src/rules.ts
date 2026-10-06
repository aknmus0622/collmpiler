// Pure business rules for orders. Nothing here talks to the outside world.

export type MemberRank = "Gold" | "Silver" | "Bronze";
export type CouponType = "Premium" | "Standard";

export type Campaign = {
  discountPercent: number;
  /** Coupon granted with the purchase, if the campaign includes one. */
  coupon: CouponType | null;
};

export function campaignFor(rank: MemberRank, isMonthEnd: boolean): Campaign {
  if (rank === "Gold" && isMonthEnd) {
    return { discountPercent: 20, coupon: "Premium" };
  }
  if (rank === "Silver") {
    return { discountPercent: 5, coupon: null };
  }
  return { discountPercent: 0, coupon: null };
}

/** Price after discount, rounded down to a whole yen. */
export function amountCharged(price: number, discountPercent: number): number {
  return Math.floor((price * (100 - discountPercent)) / 100);
}

export function isPriorityShipment(rank: MemberRank, price: number): boolean {
  if (rank === "Gold" || price >= 10000) {
    return true;
  }
  return false;
}
