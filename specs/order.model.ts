import type { CommandsOf, DomainModel, StatesOf } from "@aac/core";

// 状態・データ・Command の唯一の源泉。型はここから導出する。
export const OrderModel = {
  initial: "PENDING",
  states: ["PENDING", "PAID"],
  data: {
    rank: ["Gold", "Silver", "Bronze"],
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
  },
  // 仕様として許可される副作用（Command）
  commands: {
    SendReceipt: { discount: "number" },
    IssueCoupon: { type: ["Premium", "Standard"] },
  },
} as const satisfies DomainModel;

export type OrderStates = StatesOf<typeof OrderModel>;
export type DomainCommand = CommandsOf<typeof OrderModel>;
