export type CustomerRank = "Gold" | "Silver" | "Bronze";

export type CouponType = "Premium" | "Standard";

export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

export type PaymentOutcome = "succeeded" | "failed";

/** External payment module. */
export interface PaymentGateway {
  isAvailable(): boolean;
  charge(amount: number): PaymentOutcome;
  refund(): void;
}

/** Messages sent to the customer. */
export interface CustomerNotifier {
  orderConfirmed(): void;
  receipt(amount: number, discountPercent: number): void;
  paymentFailed(): void;
  shipped(priority: boolean): void;
}

export interface CouponIssuer {
  issue(type: CouponType): void;
}
