import type { CouponType } from "./rules.ts";

export type PaymentOutcome = "succeeded" | "failed";

export interface PaymentGateway {
  isAvailable(): boolean;
  charge(): PaymentOutcome;
  refund(): void;
}

export interface BusinessCalendar {
  isMonthEnd(): boolean;
}

export interface CustomerNotifier {
  orderConfirmed(): void;
  receipt(amount: number, discountPercent: number): void;
  paymentFailed(): void;
  shippingNotice(priority: boolean): void;
}

export interface CouponIssuer {
  issue(type: CouponType): void;
}

export type OrderDependencies = {
  payments: PaymentGateway;
  calendar: BusinessCalendar;
  notifier: CustomerNotifier;
  coupons: CouponIssuer;
};
