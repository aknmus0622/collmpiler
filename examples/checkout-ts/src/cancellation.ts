import type { OrderStatus } from "./types.ts";

/** A cancelled order is refunded only when it has already been paid for. */
export function requiresRefund(status: OrderStatus): boolean {
  return status === "PAID";
}
