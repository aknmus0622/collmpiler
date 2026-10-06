import type { CustomerRank } from "./types.ts";

const PRIORITY_PRICE_THRESHOLD = 10000;

/** Gold members and orders at or above the threshold ship with priority. */
export function isPriorityShipment(rank: CustomerRank, price: number): boolean {
  if (rank === "Gold" || price >= PRIORITY_PRICE_THRESHOLD) {
    return true;
  }
  return false;
}
