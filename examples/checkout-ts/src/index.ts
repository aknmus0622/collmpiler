/** Public entry point of the order component. */

export { Order } from "./order.ts";
export { decideCampaign, chargedAmount, couponToIssue, decideShipping } from "./rules.ts";
export type {
  Calendar,
  PaymentModule,
  CustomerNotifier,
  RefundService,
  OrderDependencies,
} from "./dependencies.ts";
export type {
  OrderStatus,
  CustomerRank,
  CouponType,
  PaymentResult,
  CancelOutcome,
  Campaign,
  ShippingPlan,
} from "./types.ts";
