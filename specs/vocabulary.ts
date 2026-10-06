import { bindDecisionDetails } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";

// Layer 1のキーから推論（二重管理・ボイラープレートの排除）
type CampaignConditions = keyof typeof CampaignRules;

// 実行時に複数の true が出た場合は RuleConflictError (Hit Policy: Unique) を投げる
export const CampaignEvaluator = bindDecisionDetails<CampaignConditions>(CampaignRules, {
  "ゴールド会員であり、かつ月末の場合": (state) => state.rank === "Gold" && state.isMonthEnd,
  "シルバー会員の場合": (state) => state.rank === "Silver",
  "default": () => true
});

// 仕様として許可される副作用（Command）の型定義
export type DomainCommand =
  | { action: "SendReceipt"; payload: { discount: number } }
  | { action: "IssueCoupon"; payload: { type: "Premium" | "Standard" } };

// SPEC.md では未定義。状態名 → その状態が持つデータ、として定義した。
type OrderData = { rank: "Gold" | "Silver" | "Bronze"; isMonthEnd: boolean };
export type OrderStates = { PENDING: OrderData; PAID: OrderData };
