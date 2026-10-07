import type { CalendarDate, CouponType, PaymentOutcome, Receipt, ShippingNotice } from "./types.ts";

/**
 * The business calendar: tells the order what day it is.
 *
 * This replaces the specification's `isMonthEnd` query. The specification's answer `true` corresponds to
 * `today()` returning the last day of a calendar month (for example 31 January), and `false` to any other
 * day (for example 15 January).
 */
export interface BusinessCalendar {
  /**
   * Returns the current calendar day. Asked during {@link Order.checkout} each time it runs; the answer
   * is never cached between actions.
   */
  today(): CalendarDate;
}

/**
 * The external payment module.
 *
 * It answers two of the specification's queries (`paymentModuleActive`, `paymentResult`) and receives
 * one of its commands (`Refund`).
 */
export interface PaymentGateway {
  /**
   * Whether the payment module can currently take payments. Corresponds to the specification's
   * `paymentModuleActive` query. Asked during {@link Order.checkout}, before any payment is attempted.
   */
  isActive(): boolean;

  /**
   * Attempts to collect a payment for the order and reports how it went. The return value corresponds
   * to the specification's `paymentResult` query; the call itself is not one of the specification's
   * commands. Called at most once per {@link Order.checkout}.
   *
   * @param amount the amount to collect, in whole yen (the same amount that would appear on the receipt).
   */
  charge(amount: number): PaymentOutcome;

  /**
   * Gives the customer their money back for this order. Corresponds to the specification's `Refund`
   * command (no payload). May be called during {@link Order.cancel}.
   */
  refund(): void;
}

/**
 * Sends messages about the order to the customer. Each method corresponds to one command of the
 * specification.
 */
export interface CustomerNotifier {
  /**
   * Confirms that the order was received. Corresponds to `SendOrderConfirmation` (no payload).
   * Called during {@link Order.placeOrder}.
   */
  sendOrderConfirmation(): void;

  /**
   * Sends the receipt for a collected payment. Corresponds to `SendReceipt`; the fields of `receipt`
   * are the command's payload. May be called during {@link Order.checkout}.
   */
  sendReceipt(receipt: Receipt): void;

  /**
   * Tells the customer that the payment could not be collected. Corresponds to `NotifyPaymentFailure`
   * (no payload). May be called during {@link Order.checkout}.
   */
  notifyPaymentFailure(): void;

  /**
   * Tells the customer that the order is on its way. Corresponds to `SendShippingNotice`; the fields of
   * `notice` are the command's payload. Called during {@link Order.ship}.
   */
  sendShippingNotice(notice: ShippingNotice): void;
}

/** Issues coupons to the customer who owns the order. */
export interface CouponIssuer {
  /**
   * Issues one coupon. Corresponds to the specification's `IssueCoupon` command; `type` is the
   * command's `type` payload field. May be called during {@link Order.checkout}.
   */
  issueCoupon(type: CouponType): void;
}

/** Everything an {@link Order} needs from its environment. */
export interface OrderDependencies {
  /** Source of the current business day. */
  readonly calendar: BusinessCalendar;
  /** The external payment module. */
  readonly payments: PaymentGateway;
  /** Channel for messages to the customer. */
  readonly notifier: CustomerNotifier;
  /** Service that issues coupons. */
  readonly coupons: CouponIssuer;
}
