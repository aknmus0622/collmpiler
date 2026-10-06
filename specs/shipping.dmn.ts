import type { DecisionTable } from "@aac/core";

export type ShippingOutputs = { priority: boolean };

export const ShippingRules = {
  "ゴールド会員、または1万円以上の注文の場合": { priority: true },
  "default": { priority: false }
} as const satisfies DecisionTable<ShippingOutputs>;
