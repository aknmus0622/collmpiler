import type { CommandsOf, DomainModel } from "@aac/core";

const Rank = ["Gold", "Silver", "Bronze"] as const;

// 注文という部品の境界。状態・データ・アクション・依存の唯一の源泉で、型はここから導出する。
export const OrderModel = {
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // 注文が覚えているデータ（初期状態では未設定）
  data: {
    rank: Rank,
  },
  // アクションと、その入力
  actions: {
    PlaceOrder: { customerRank: Rank },
    Checkout: {},
    Ship: {},
    Cancel: {},
  },
  // 依存への問い合わせ（時計・設定など、部品が外に尋ねる値）
  queries: {
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
  },
  // 依存への指示（仕様として許可される副作用）
  commands: {
    SendOrderConfirmation: {},
    SendReceipt: { discount: "number" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: { priority: "boolean" },
    Refund: {},
  },
} as const satisfies DomainModel;

export type DomainCommand = CommandsOf<typeof OrderModel>;
