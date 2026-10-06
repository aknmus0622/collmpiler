import type { TargetSystemAdapter } from "./adapter.contract.ts";
import { Order } from "../src/order.ts";

// The harness answers "is it month end?" as a flag; production code asks a clock for today's date.
const A_MONTH_END = new Date(Date.UTC(2024, 0, 31));
const A_MID_MONTH_DAY = new Date(Date.UTC(2024, 0, 15));

let order: Order | undefined;

function current(): Order {
  if (!order) throw new Error("setupIsolation has not been called");
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order({
      clock: {
        today: () => (ports.queries.isMonthEnd() ? A_MONTH_END : A_MID_MONTH_DAY),
      },
      payments: {
        isAvailable: () => ports.queries.paymentModuleActive(),
        charge: () => (ports.outcomes.Checkout() === "PaymentSuccess" ? "succeeded" : "failed"),
        refund: () => ports.commands.Refund({}),
      },
      notifier: {
        sendReceipt: (discountRate) => ports.commands.SendReceipt({ discount: discountRate }),
        notifyPaymentFailure: () => ports.commands.NotifyPaymentFailure({}),
        sendShippingNotice: () => ports.commands.SendShippingNotice({}),
      },
      coupons: {
        issue: (type) => ports.commands.IssueCoupon({ type }),
      },
    });
  },
  async teardownIsolation() {
    order = undefined;
  },
  async executeAction(action, input) {
    const target = current();
    switch (action) {
      case "Checkout":
        target.checkout(input.rank);
        break;
      case "Cancel":
        target.cancel();
        break;
      case "Ship":
        target.ship();
        break;
    }
  },
  async getCurrentState() {
    return current().status;
  },
};
