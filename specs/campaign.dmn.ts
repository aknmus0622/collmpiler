import type { DecisionTable } from "@aac/core";
import type { DomainCommand } from "./order.model.ts";

// 割引率は整数のパーセントで持つ（小数だと金額の計算に誤差が出る）
export type CampaignOutputs = { discountPercent: number; effects: DomainCommand[] };

// 【真の源泉】
// as const: キーを厳密な文字列リテラルとして推論させ、Layer 2でのInferred Dictionaryを実現する。
// satisfies: as constの推論を保ちつつ、defaultの記述漏れや型エラーを厳格にチェックする。
export const CampaignRules = {
  "ゴールド会員であり、かつ月末の場合": {
    discountPercent: 20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "シルバー会員の場合": { discountPercent: 5, effects: [] },
  "default": { discountPercent: 0, effects: [] } // 必須フォールバック
} as const satisfies DecisionTable<CampaignOutputs>;
