import type { Ports, TargetSystemAdapter } from "./adapter.contract.ts";
import { Order, OrderOperationError } from "../src/order.ts";
import type { OrderDependencies } from "../src/order.ts";

// Dates the clock reports for the harness's month-end flag: the last day of a month, and the day before it.
const MONTH_END = new Date(Date.UTC(2024, 0, 31));
const NOT_MONTH_END = new Date(Date.UTC(2024, 0, 30));

function connect(ports: Ports): OrderDependencies {
  return {
    clock: {
      today: () => (ports.queries.isMonthEnd() ? MONTH_END : NOT_MONTH_END),
    },
    payments: {
      isAvailable: () => ports.queries.paymentModuleActive(),
      charge: () => ports.queries.paymentResult(),
      refund: () => ports.commands.Refund({}),
    },
    notifier: {
      orderConfirmed: () => ports.commands.SendOrderConfirmation({}),
      receipt: (amount, discountPercent) => ports.commands.SendReceipt({ amount, discountPercent }),
      paymentFailed: () => ports.commands.NotifyPaymentFailure({}),
      shipped: (priority) => ports.commands.SendShippingNotice({ priority }),
    },
    coupons: {
      issue: (type) => ports.commands.IssueCoupon({ type }),
    },
  };
}

let order: Order | null = null;

function current(): Order {
  if (order === null) throw new Error("setupIsolation has not been called");
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(connect(ports));
  },
  async teardownIsolation() {
    order = null;
  },
  async executeAction(action) {
    const target = current();
    try {
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
    } catch (error) {
      // An operation the order rejects leaves it untouched; the harness has no channel for rejections.
      if (!(error instanceof OrderOperationError)) throw error;
    }
  },
  async getCurrentState() {
    return current().status;
  },
};
