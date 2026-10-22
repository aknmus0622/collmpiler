/**
 * Interfaces for the outside world an order talks to. Each is implemented outside this component and
 * handed to {@link Order} when it is constructed.
 */

import type { CouponType, PaymentResult } from "./types.ts";

/** Date facts (specification component `calendar`). */
export interface Calendar {
  /**
   * Answers whether today counts as month-end (specification query `calendar.IsMonthEnd`). May be asked during checkout, when working out the campaign.
   */
  isMonthEnd(): boolean;
}

/** Gateway to the payment provider (specification component `payment`). */
export interface PaymentModule {
  /**
   * Answers whether the provider is available (specification query `payment.Active`). The order does not
   * ask this itself: callers only invoke {@link Order.checkout} in situations the specification allows.
   */
  isActive(): boolean;
  /**
   * Answers how the customer's payment for this order went (specification query `payment.Result`).
   * Asked once per checkout.
   */
  result(): PaymentResult;
}

/** Outgoing customer messaging (specification component `customer`). Each method is a one-way notification. */
export interface CustomerNotifier {
  /** Confirms placement to the customer (specification command `customer.OrderConfirmation`). Sent by {@link Order.placeOrder}. */
  sendOrderConfirmation(): void;
  /**
   * Sends a receipt (specification command `customer.Receipt`). Sent by {@link Order.checkout}.
   * @param amount amount charged, in whole yen (specification `amount`).
   * @param discountPercent discount applied, in whole percent (specification `discountPercent`).
   */
  sendReceipt(amount: number, discountPercent: number): void;
  /**
   * Gives the customer a coupon (specification command `customer.Coupon`). May be sent by
   * {@link Order.checkout}, after the receipt.
   * @param type kind of coupon (specification `type`).
   */
  issueCoupon(type: CouponType): void;
  /** Reports an unsuccessful payment (specification command `customer.PaymentFailure`). Sent by {@link Order.checkout}. */
  sendPaymentFailure(): void;
  /**
   * Reports dispatch (specification command `customer.ShippingNotice`). Sent by {@link Order.ship}.
   * @param priority priority-shipment flag (specification `priority`).
   */
  sendShippingNotice(priority: boolean): void;
}

/** Gateway for paying money back (specification component `refunds`). */
export interface RefundService {
  /**
   * Returns money to the customer (specification command `refunds.Refund`). May be requested by {@link Order.cancel}.
   * @param amount amount in whole yen (specification `amount`).
   */
  refund(amount: number): void;
}

/** Bundle of everything an {@link Order} needs from the outside world. */
export interface OrderDependencies {
  readonly calendar: Calendar;
  readonly payment: PaymentModule;
  readonly customer: CustomerNotifier;
  readonly refunds: RefundService;
}
