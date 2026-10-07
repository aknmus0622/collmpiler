import type { CalendarDate, CouponType, PaymentOutcome, Receipt } from "./types.ts";

/**
 * The shop's business calendar. Supplies the specification's `isMonthEnd` query in a richer form:
 * the order asks for today's date and works out by itself (see `isMonthEnd` in `policies.ts`)
 * whether that date is a month-end.
 *
 * To make the specification's `isMonthEnd` answer `true`, return the last calendar day of a month
 * (for example 31 January); to make it `false`, return any other day (for example 15 January).
 */
export interface BusinessCalendar {
  /**
   * Today's date. Asked during {@link Order.checkout}, each time it is needed; the answer is never
   * kept from one action to the next.
   */
  today(): CalendarDate;
}

/**
 * The external payment module. Supplies the specification's `paymentModuleActive` and
 * `paymentResult` queries and carries out its `Refund` command.
 */
export interface PaymentGateway {
  /**
   * Whether the payment module can currently be used (specification query `paymentModuleActive`).
   * Asked at the start of {@link Order.checkout}, every time.
   */
  isActive(): boolean;

  /**
   * Attempts to take one payment and reports how it went (specification query `paymentResult`).
   * Called at most once per {@link Order.checkout}, and only when the checkout is allowed.
   * This call is the query itself, not one of the specification's commands.
   *
   * @param amountYen the amount to take, in whole yen (the specification's `amountCharged`).
   */
  charge(amountYen: number): PaymentOutcome;

  /**
   * Gives the customer their money back for this order (specification command `Refund`, which has
   * no payload). Called by {@link Order.cancel}.
   */
  refund(): void;
}

/**
 * Sends messages to the customer of the order. Each method carries out one of the specification's
 * commands.
 */
export interface CustomerNotifier {
  /** Specification command `SendOrderConfirmation` (no payload). Called by {@link Order.place}. */
  sendOrderConfirmation(): void;

  /** Specification command `SendReceipt`. Called by {@link Order.checkout}. */
  sendReceipt(receipt: Receipt): void;

  /** Specification command `NotifyPaymentFailure` (no payload). Called by {@link Order.checkout}. */
  notifyPaymentFailure(): void;

  /**
   * Specification command `SendShippingNotice`. Called by {@link Order.ship}.
   *
   * @param priority the command's `priority` field: whether the order ships with priority.
   */
  sendShippingNotice(priority: boolean): void;
}

/**
 * Issues coupons to the customer of the order.
 */
export interface CouponIssuer {
  /**
   * Specification command `IssueCoupon`. Called by {@link Order.checkout}, after the receipt has
   * been sent.
   *
   * @param type the command's `type` field.
   */
  issue(type: CouponType): void;
}

/**
 * Everything an {@link Order} needs from its environment.
 */
export interface OrderDependencies {
  calendar: BusinessCalendar;
  payments: PaymentGateway;
  notifier: CustomerNotifier;
  coupons: CouponIssuer;
}
