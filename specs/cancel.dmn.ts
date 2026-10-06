import type { DecisionTable } from "@aac/core";
import type { DomainCommand } from "./order.model.ts";

export type CancelOutputs = { effects: DomainCommand[] };

export const CancelRules = {
  "決済済みの注文の場合": { effects: [{ action: "Refund", payload: {} }] },
  "default": { effects: [] }
} as const satisfies DecisionTable<CancelOutputs>;
