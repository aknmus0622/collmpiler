import type { Command, OrderData } from "./types.ts";

export type Campaign = { discount: number; effects: Command[] };

// Hit policy is unique: member ranks are mutually exclusive, so at most one row matches.
export function resolveCampaign(data: OrderData): Campaign {
  if (data.rank === "Gold" && data.isMonthEnd) {
    return { discount: 0.2, effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }] };
  }
  if (data.rank === "Silver") {
    return { discount: 0.05, effects: [] };
  }
  return { discount: 0, effects: [] };
}
