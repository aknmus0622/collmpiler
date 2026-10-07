/**
 * Public entry point of the order component.
 *
 * - `Order` (order.ts): the component itself; construct it with its dependencies, drive it
 *   with `place`, `checkout`, `ship` and `cancel`, and read `state` to observe it.
 * - ports.ts: the interfaces of the dependencies to supply.
 * - rules.ts: the pure business decisions the order relies on.
 * - types.ts: the value types shared by all of the above.
 */
export { Order, OrderCommandRejected } from "./order.ts";
export { amountCharged, campaignFor, isMonthEnd, isPriorityShipping } from "./rules.ts";
export type {
  Clock,
  CouponIssuer,
  CustomerNotifier,
  OrderDependencies,
  PaymentGateway,
} from "./ports.ts";
export type {
  CalendarDate,
  CampaignTerms,
  CouponType,
  CustomerRank,
  OrderState,
  PaymentResult,
  Receipt,
} from "./types.ts";
