/**
 * Public entry point of the order component.
 *
 * - `Order` (with `OrderActionError`) – the component itself; start here.
 * - `OrderDependencies` and the `Clock`, `PaymentGateway`, `CustomerNotifier` and `CouponIssuer`
 *   interfaces – what an `Order` needs from its environment.
 * - The functions from `rules.ts` – the pure business decisions, usable on their own.
 */
export { Order, OrderActionError } from "./order.ts";
export { amountCharged, campaignFor, isMonthEnd, isPriorityShipment, refundDueOnCancel } from "./rules.ts";
export type { Clock, CouponIssuer, CustomerNotifier, OrderDependencies, PaymentGateway } from "./ports.ts";
export type {
  CalendarDate,
  CampaignOutcome,
  CouponType,
  CustomerRank,
  OrderPlacement,
  OrderStatus,
  PaymentOutcome,
  Receipt,
} from "./types.ts";
