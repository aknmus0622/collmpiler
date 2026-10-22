/**
 * Value types shared by the order component, its business rules and its dependencies.
 */

/**
 * Where an order is in its lifecycle (specification: state field `order.status`, answered by the `Status` query).
 * The values are the specification's own:
 * - `"DRAFT"`: a newly created order that has not been placed yet.
 * - `"PENDING"`: placed (specification command `PlaceOrder`) and not yet paid.
 * - `"PAID"`: checked out successfully (specification command `Checkout`, event `Checkout.paid`).
 * - `"SHIPPED"`: sent out (specification command `Ship`).
 * - `"CANCELLED"`: cancelled (specification command `Cancel`).
 */
export type OrderStatus = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/** Membership rank supplied when the order is placed (specification: `order.rank`, `PlaceOrder.customerRank`). */
export type CustomerRank = "Gold" | "Silver" | "Bronze";

/** Kind of coupon handed to a customer (specification: `customer.Coupon.type`). */
export type CouponType = "Premium" | "Standard";

/** Outcome reported by the payment module for this order's payment (specification: `payment.Result`). */
export type PaymentResult = "succeeded" | "failed";

/**
 * Answer to a cancellation request (specification: output of `order.Cancel`).
 * - `"cancelled"`: this request cancelled the order.
 * - `"not-cancellable"`: this request changed nothing.
 */
export type CancelOutcome = "cancelled" | "not-cancellable";

/**
 * Result of the campaign rules evaluated at checkout (specification: result of decision table `campaign`;
 * field names match).
 */
export interface Campaign {
  /** Coupon named by the campaign, or `null` when it names none. */
  readonly coupon: CouponType | null;
  /** Discount in whole percent. */
  readonly discountPercent: number;
  /** Flag saying whether the campaign hands out a coupon. */
  readonly grantsCoupon: boolean;
}

/** Result of the shipping rules evaluated when shipping (specification: result of decision table `shipping`). */
export interface ShippingPlan {
  /** Flag for a priority shipment. */
  readonly priority: boolean;
}
