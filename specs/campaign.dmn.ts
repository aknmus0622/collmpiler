import type { DecisionTable } from "@aac/core";
import type { DomainCommand } from "./order.model.ts";

// The discount is a whole-number percentage (fractions would make the amount calculation inexact).
export type CampaignOutputs = { discountPercent: number; effects: DomainCommand[] };

// Each key is a condition written in natural language; `default` is mandatory.
export const CampaignRules = {
  "The customer is a Gold member and it is month-end": {
    discountPercent: 20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "The customer is a Silver member": { discountPercent: 5, effects: [] },
  "default": { discountPercent: 0, effects: [] }
} as const satisfies DecisionTable<CampaignOutputs>;
