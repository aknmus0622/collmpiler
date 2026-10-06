import { bindDecisionDetails, bindPreconditions } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";

// Layer 1のキーから推論（二重管理・ボイラープレートの排除）
type CampaignConditions = keyof typeof CampaignRules;

// 実行時に複数の true が出た場合は RuleConflictError (Hit Policy: Unique) を投げる
export const CampaignEvaluator = bindDecisionDetails<CampaignConditions>(CampaignRules, {
  "ゴールド会員であり、かつ月末の場合": (state) => state.rank === "Gold" && state.isMonthEnd,
  "シルバー会員の場合": (state) => state.rank === "Silver",
  "default": () => true
});

// behaviors の where に書いた事前条件の評価関数
export const Preconditions = bindPreconditions({
  "外部決済モジュールが有効な場合": (state) => state.paymentModuleActive
});
