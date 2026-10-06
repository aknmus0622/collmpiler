import type { TargetSystemAdapter } from "./adapter.contract.ts";
import { Order } from "../src/order.ts";

let order: Order | null = null;

function current(): Order {
  if (order === null) throw new Error("setupIsolation has not been called");
  return order;
}

// Translates between the harness ports and the dependencies the production code defines.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order({
      payments: {
        isAvailable: () => ports.queries.paymentModuleActive(),
        charge: () => ports.queries.paymentResult(),
        refund: () => ports.commands.Refund({}),
      },
      calendar: {
        isMonthEnd: () => ports.queries.isMonthEnd(),
      },
      notifier: {
        orderConfirmed: () => ports.commands.SendOrderConfirmation({}),
        receipt: (amount, discountPercent) => ports.commands.SendReceipt({ amount, discountPercent }),
        paymentFailed: () => ports.commands.NotifyPaymentFailure({}),
        shippingNotice: (priority) => ports.commands.SendShippingNotice({ priority }),
      },
      coupons: {
        issue: (type) => ports.commands.IssueCoupon({ type }),
      },
    });
  },
  async teardownIsolation() {
    order = null;
  },
  async executeAction(action) {
    const target = current();
    switch (action.name) {
      case "PlaceOrder":
        target.place(action.input.customerRank, action.input.listPrice);
        break;
      case "Checkout":
        target.checkout();
        break;
      case "Ship":
        target.ship();
        break;
      case "Cancel":
        target.cancel();
        break;
    }
  },
  async getCurrentState() {
    return current().status;
  },
};
