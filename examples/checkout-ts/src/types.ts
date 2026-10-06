export type OrderState = "PENDING" | "PAID";
export type MemberRank = "Gold" | "Silver" | "Bronze";
export type OrderData = { isMonthEnd: boolean; paymentModuleActive: boolean; rank: MemberRank };
export type Command =
  | { action: "IssueCoupon"; payload: { type: "Premium" | "Standard" } }
  | { action: "SendReceipt"; payload: { discount: number } };
export type OrderAction = "Checkout";
export type PaymentResult = "PaymentSuccess";
