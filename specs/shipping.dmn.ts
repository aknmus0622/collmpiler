import type { DecisionTable } from "@aac/core";

export type ShippingOutputs = { priority: boolean };

export const ShippingRules = {
  "The customer is a Gold member, or the order is 10,000 yen or more": { priority: true },
  "default": { priority: false }
} as const satisfies DecisionTable<ShippingOutputs>;
