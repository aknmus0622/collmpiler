import type { CommandsOf, DomainModel } from "@aac/core";

const Rank = ["Gold", "Silver", "Bronze"] as const;
// 金額は円の整数で扱う。around は、その前後を PBT が重点的に生成するしきい値
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

// 注文という部品の境界。状態・データ・アクション・依存の唯一の源泉で、型はここから導出する。
export const OrderModel = {
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // 注文が覚えているデータ（初期状態では未設定）
  data: {
    rank: Rank,
    price: Yen,
  },
  // アクションと、その入力
  actions: {
    PlaceOrder: { customerRank: Rank, listPrice: Yen },
    Checkout: {},
    Ship: {},
    Cancel: {},
  },
  // 依存への問い合わせ（時計・設定・外部サービスの応答など、部品が外に尋ねる値）
  queries: {
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },
  // 依存への指示（仕様として許可される副作用）
  commands: {
    SendOrderConfirmation: {},
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: { priority: "boolean" },
    Refund: {},
  },
  // 計算。名前に式と丸め方を書く。中身は Layer 2 で結び付ける
  formulas: {
    "請求金額（価格 ×（100 − 割引率）÷ 100、1円未満切り捨て）": "integer",
  },
  // 不変条件。どのアクションの後でも成り立つべき性質
  invariants: [
    "下書き以外の注文には、会員ランクと価格が設定されている",
  ],
} as const satisfies DomainModel;

export type DomainCommand = CommandsOf<typeof OrderModel>;
