import type { CouponType } from "./policies.ts";

export type PaymentResult = "charged" | "declined";

export interface PaymentGateway {
  isAvailable(): boolean;
  charge(): PaymentResult;
  refund(): void;
}

export interface Calendar {
  isMonthEnd(): boolean;
}

export interface CustomerNotifier {
  orderConfirmed(): void;
  paymentFailed(): void;
  receipt(discount: number): void;
  shippingNotice(priority: boolean): void;
}

export interface CouponIssuer {
  issue(type: CouponType): void;
}
