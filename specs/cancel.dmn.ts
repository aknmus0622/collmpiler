import type { DecisionTable } from "@aac/core";
import type { DomainCommand } from "./order.model.ts";

export type CancelOutputs = { effects: DomainCommand[] };

export const CancelRules = {
  "The order has been paid": { effects: [{ action: "Refund", payload: {} }] },
  "default": { effects: [] }
} as const satisfies DecisionTable<CancelOutputs>;
