import type { CommandsOf, DomainModel, StatesOf } from "@aac/core";

// 注文という部品の境界。状態・入力・依存の唯一の源泉で、型はここから導出する。
export const OrderModel = {
  initial: "PENDING",
  states: ["PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // アクションの入力
  input: {
    rank: ["Gold", "Silver", "Bronze"],
  },
  // 依存への問い合わせ（時計・設定など、部品が外に尋ねる値）
  queries: {
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
  },
  // 依存への指示（仕様として許可される副作用）
  commands: {
    SendReceipt: { discount: "number" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: {},
    Refund: {},
  },
} as const satisfies DomainModel;

export type OrderStates = StatesOf<typeof OrderModel>;
export type DomainCommand = CommandsOf<typeof OrderModel>;
