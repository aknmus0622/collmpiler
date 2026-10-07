import type { CalendarDate, CouponType, PaymentResult, Receipt } from "./types.ts";

/**
 * Source of the current business date.
 *
 * Replaces the specification's `isMonthEnd` query: instead of a flag, the order asks for today's
 * date and works out for itself whether that date is the last day of its month. To answer
 * `isMonthEnd = true`, return a date that is the last day of its month (for example 31 January);
 * to answer `false`, return any other date (for example 15 January).
 */
export interface Calendar {
  /** Returns today's date. Asked each time the date is needed; the answer is never cached. */
  today(): CalendarDate;
}

/**
 * The external payment module.
 *
 * Covers the specification's `paymentModuleActive` and `paymentResult` queries and its `Refund`
 * effect.
 */
export interface PaymentGateway {
  /**
   * Whether the payment module is currently active (specification query `paymentModuleActive`).
   * Asked during checkout, each time it is needed.
   */
  isActive(): boolean;

  /**
   * Attempts to collect `amount` whole yen for the order and reports the outcome (specification
   * query `paymentResult`). Called once per checkout. The call itself is not one of the
   * specification's effects; only its return value matters there.
   */
  charge(amount: number): PaymentResult;

  /** Returns the customer's payment for the order (specification effect `Refund`, no payload). */
  refund(): void;
}

/** Sends messages about the order to the customer. Each method is one specification effect. */
export interface CustomerNotifier {
  /** Specification effect `SendOrderConfirmation` (no payload). */
  sendOrderConfirmation(): void;

  /** Specification effect `SendReceipt`; `receipt` carries its `amount` and `discountPercent`. */
  sendReceipt(receipt: Receipt): void;

  /** Specification effect `NotifyPaymentFailure` (no payload). */
  notifyPaymentFailure(): void;

  /** Specification effect `SendShippingNotice`; `priority` is its `priority` payload field. */
  sendShippingNotice(priority: boolean): void;
}

/** Issues coupons to the customer. */
export interface CouponIssuer {
  /** Specification effect `IssueCoupon`; `type` is its `type` payload field. */
  issue(type: CouponType): void;
}

/** Everything an order needs from its environment. Supplied once, when the order is created. */
export interface OrderDependencies {
  readonly calendar: Calendar;
  readonly payments: PaymentGateway;
  readonly notifier: CustomerNotifier;
  readonly coupons: CouponIssuer;
}
