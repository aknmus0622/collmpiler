import { applyDecision, bindSpecification } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import { CancelRules } from "./cancel.dmn.ts";
import { ShippingRules } from "./shipping.dmn.ts";
import { OrderModel } from "./order.model.ts";

// Layer 1 に自然言語で書いた名前に、評価関数を結び付ける。同じ文は、どこに書かれても同じ意味になる。
export const Specification = bindSpecification(OrderModel, {
  // ここに渡した決定表の行は、結び付けの漏れがコンパイルエラーになる
  tables: { CampaignRules, CancelRules, ShippingRules },

  // 条件: 決定表の行、事前条件 (where)、case の分かれ方。
  // 同時に複数が成立した場合は RuleConflictError (Hit Policy: Unique)
  conditions: {
    "ゴールド会員であり、かつ月末の場合": (state) => state.rank === "Gold" && state.isMonthEnd,
    "シルバー会員の場合": (state) => state.rank === "Silver",
    "決済済みの注文の場合": (state) => state.status === "PAID",
    "ゴールド会員、または1万円以上の注文の場合": (state) => state.rank === "Gold" || (state.price ?? 0) >= 10_000,
    "外部決済モジュールが有効な場合": (state) => state.paymentModuleActive,
    "決済に成功した場合": (state) => state.paymentResult === "succeeded"
  },

  // 計算
  formulas: {
    "請求金額（価格 ×（100 − 割引率）÷ 100、1円未満切り捨て）": (state) =>
      Math.floor(((state.price ?? 0) * (100 - applyDecision(CampaignRules, state).discountPercent)) / 100)
  },

  // 不変条件: 仕様自身の矛盾を見つけるためのもの
  invariants: {
    "下書き以外の注文には、会員ランクと価格が設定されている": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined)
  }
});
