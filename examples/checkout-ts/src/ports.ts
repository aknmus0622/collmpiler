/**
 * The dependencies of the order component. Each is supplied from outside when an `Order`
 * (order.ts) is constructed.
 *
 * None of the answers is cached by the component: every command asks again when it needs a
 * value. A command may ask a question zero, one, or several times, so implementations must be
 * prepared to answer whenever asked and must not treat a question as a side effect.
 */
import type { CalendarDate, CouponType, PaymentResult, Receipt } from "./types.ts";

/**
 * Source of the current business date.
 */
export interface Clock {
  /**
   * Returns today's calendar date. Asked during checkout.
   *
   * This replaces the specification's `isMonthEnd` query: the component derives that answer
   * itself from the returned date (see `isMonthEnd` in rules.ts). To make the specification's
   * `isMonthEnd` true, return a date that is the last day of its month (e.g. 2026-01-31); to
   * make it false, return any other date (e.g. 2026-01-15).
   */
  today(): CalendarDate;
}

/**
 * The external payment module.
 */
export interface PaymentGateway {
  /**
   * Tells whether the payment module is currently available.
   * Corresponds to the specification's `paymentModuleActive` query. Asked during checkout.
   */
  isActive(): boolean;

  /**
   * Attempts to charge the customer and reports the outcome.
   * The return value corresponds to the specification's `paymentResult` query. Called during
   * checkout; the call itself is not one of the specification's effects.
   *
   * @param amountYen the amount to charge, in whole yen.
   */
  charge(amountYen: number): PaymentResult;

  /**
   * Returns the money taken for this order to the customer.
   * Corresponds to the specification's `Refund` effect (no payload). May be called while
   * cancelling.
   */
  refund(): void;
}

/**
 * Sends messages to the customer.
 */
export interface CustomerNotifier {
  /**
   * Corresponds to the specification's `SendOrderConfirmation` effect (no payload).
   * May be called while placing an order.
   */
  sendOrderConfirmation(): void;

  /**
   * Corresponds to the specification's `SendReceipt` effect. May be called during checkout.
   *
   * @param receipt `receipt.amountYen` is the effect's `amount`, `receipt.discountPercent` is
   *   the effect's `discountPercent`.
   */
  sendReceipt(receipt: Receipt): void;

  /**
   * Corresponds to the specification's `NotifyPaymentFailure` effect (no payload).
   * May be called during checkout.
   */
  notifyPaymentFailure(): void;

  /**
   * Corresponds to the specification's `SendShippingNotice` effect. May be called while
   * shipping.
   *
   * @param priority the effect's `priority` payload field.
   */
  sendShippingNotice(priority: boolean): void;
}

/**
 * Issues coupons to the customer.
 */
export interface CouponIssuer {
  /**
   * Corresponds to the specification's `IssueCoupon` effect. May be called during checkout.
   *
   * @param type the effect's `type` payload field.
   */
  issueCoupon(type: CouponType): void;
}

/**
 * Everything an order needs from its environment.
 */
export interface OrderDependencies {
  readonly clock: Clock;
  readonly paymentGateway: PaymentGateway;
  readonly notifier: CustomerNotifier;
  readonly couponIssuer: CouponIssuer;
}
