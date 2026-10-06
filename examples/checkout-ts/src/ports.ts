/**
 * The order component's dependencies, described in its own terms. All of them are supplied from
 * outside (see `OrderDependencies` and the `Order` constructor); the component never reaches for
 * globals.
 *
 * Every method here is synchronous. The answers may differ from one action to the next, so the
 * component asks each time it needs a value and never caches an answer.
 */
import type { CalendarDate, CouponType, PaymentOutcome, Receipt } from "./types.ts";

/**
 * The shop's business calendar.
 */
export interface Clock {
  /**
   * Returns today's date in the shop's business calendar.
   *
   * Asked once during every permitted `Order.checkout()`, before payment is attempted, to decide
   * whether the month-end campaign applies. This replaces the specification's `isMonthEnd`
   * query: `isMonthEnd` is true exactly when the returned date is the last calendar day of its
   * month (see `CalendarDate` and `isMonthEnd` in `rules.ts`). To answer "month-end" return e.g.
   * `{ year: 2026, month: 1, day: 31 }`; to answer "not month-end" return e.g.
   * `{ year: 2026, month: 1, day: 15 }`.
   */
  today(): CalendarDate;
}

/**
 * The external payment module.
 */
export interface PaymentGateway {
  /**
   * Tells whether the external payment module is currently active (specification: the
   * `paymentModuleActive` query). Asked at the start of every `Order.checkout()`; checkout is
   * only permitted while this returns `true`.
   */
  isActive(): boolean;

  /**
   * Attempts to take payment for the order and reports how it went (specification: the
   * `paymentResult` query; the return values are the specification's). Called exactly once per
   * permitted `Order.checkout()`, before any notification is sent. This call is *not* one of the
   * specification's commands.
   *
   * @param amount the amount to charge in whole yen: the order's price after the campaign
   *               discount (the same figure that appears as `amount` on the receipt when the
   *               payment succeeds).
   */
  charge(amount: number): PaymentOutcome;

  /**
   * Returns the customer's money for a cancelled order (specification: the `Refund` command, no
   * payload). Called during `Order.cancel()` only when the order had already been paid.
   */
  refund(): void;
}

/**
 * The channel through which the customer is told what happened to their order.
 */
export interface CustomerNotifier {
  /**
   * Confirms to the customer that the order was placed (specification: the
   * `SendOrderConfirmation` command, no payload). Called during `Order.place()`.
   */
  sendOrderConfirmation(): void;

  /**
   * Sends the receipt for a successful payment (specification: the `SendReceipt` command; the
   * `receipt` argument carries its payload fields `amount` and `discountPercent` under the same
   * names). Called during `Order.checkout()` when payment succeeded.
   */
  sendReceipt(receipt: Receipt): void;

  /**
   * Tells the customer that payment failed (specification: the `NotifyPaymentFailure` command,
   * no payload). Called during `Order.checkout()` when payment did not succeed.
   */
  notifyPaymentFailure(): void;

  /**
   * Tells the customer that the order has been shipped (specification: the `SendShippingNotice`
   * command; the `priority` argument is its payload field `priority` — `true` for priority
   * shipping, `false` for standard shipping). Called during `Order.ship()`.
   */
  sendShippingNotice(priority: boolean): void;
}

/**
 * The service that grants coupons to customers.
 */
export interface CouponIssuer {
  /**
   * Issues a coupon of the given type to the customer (specification: the `IssueCoupon` command;
   * the `type` argument is its payload field `type`). Called during `Order.checkout()`, after the
   * receipt has been sent, only when the campaign that applied grants a coupon.
   */
  issueCoupon(type: CouponType): void;
}

/**
 * Everything an `Order` needs from its environment.
 *
 * The specification's commands are spread over these collaborators. Their relative order matters
 * (it is the order in which the methods are called), so an observer that needs the
 * specification's command sequence should record calls to `payments.refund`, to every `notifier`
 * method and to `coupons.issueCoupon` in one shared, ordered log. Calls to `clock.today`,
 * `payments.isActive` and `payments.charge` are queries, not commands.
 *
 * - `clock`    – the business calendar (source of the specification's `isMonthEnd`).
 * - `payments` – the external payment module (source of `paymentModuleActive` and
 *                `paymentResult`; target of `Refund`).
 * - `notifier` – the customer notification channel (target of `SendOrderConfirmation`,
 *                `SendReceipt`, `NotifyPaymentFailure` and `SendShippingNotice`).
 * - `coupons`  – the coupon service (target of `IssueCoupon`).
 */
export interface OrderDependencies {
  readonly clock: Clock;
  readonly payments: PaymentGateway;
  readonly notifier: CustomerNotifier;
  readonly coupons: CouponIssuer;
}
