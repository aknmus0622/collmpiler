import type { TargetSystemAdapter } from "./adapter.contract.ts";
import { Order } from "../src/order.ts";

let order: Order | undefined;

function current(): Order {
  if (order === undefined) throw new Error("setupIsolation has not been called");
  return order;
}

// Translates between the harness ports and the dependencies the production code defines.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order({
      payments: {
        isAvailable: () => ports.queries.paymentModuleActive(),
        charge: () => (ports.outcomes.Checkout() === "PaymentSuccess" ? "charged" : "declined"),
        refund: () => ports.commands.Refund({}),
      },
      calendar: {
        isMonthEnd: () => ports.queries.isMonthEnd(),
      },
      notifier: {
        orderConfirmed: () => ports.commands.SendOrderConfirmation({}),
        paymentFailed: () => ports.commands.NotifyPaymentFailure({}),
        receipt: (discount) => ports.commands.SendReceipt({ discount }),
        shippingNotice: (priority) => ports.commands.SendShippingNotice({ priority }),
      },
      coupons: {
        issue: (type) => ports.commands.IssueCoupon({ type }),
      },
    });
  },
  async teardownIsolation() {
    order = undefined;
  },
  async executeAction(action) {
    const target = current();
    switch (action.name) {
      case "PlaceOrder":
        target.place(action.input.customerRank);
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
