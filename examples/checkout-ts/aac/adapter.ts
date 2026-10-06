import type { Ports, TargetSystemAdapter } from "./adapter.contract.ts";
import { Order } from "../src/index.ts";
import type { CalendarDate, OrderDependencies } from "../src/index.ts";

// The production clock reports a date rather than a month-end flag (see `Clock.today`).
const MONTH_END: CalendarDate = { year: 2026, month: 1, day: 31 };
const NOT_MONTH_END: CalendarDate = { year: 2026, month: 1, day: 15 };

function dependenciesFor(ports: Ports): OrderDependencies {
  return {
    clock: {
      today: () => (ports.queries.isMonthEnd() ? MONTH_END : NOT_MONTH_END),
    },
    payments: {
      isActive: () => ports.queries.paymentModuleActive(),
      charge: () => ports.queries.paymentResult(),
      refund: () => ports.commands.Refund({}),
    },
    notifier: {
      sendOrderConfirmation: () => ports.commands.SendOrderConfirmation({}),
      sendReceipt: (receipt) =>
        ports.commands.SendReceipt({ amount: receipt.amount, discountPercent: receipt.discountPercent }),
      notifyPaymentFailure: () => ports.commands.NotifyPaymentFailure({}),
      sendShippingNotice: (priority) => ports.commands.SendShippingNotice({ priority }),
    },
    coupons: {
      issueCoupon: (type) => ports.commands.IssueCoupon({ type }),
    },
  };
}

let order: Order | null = null;

function currentOrder(): Order {
  if (order === null) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return order;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(dependenciesFor(ports));
  },
  async teardownIsolation() {
    order = null;
  },
  async executeAction(action) {
    const target = currentOrder();
    switch (action.name) {
      case "PlaceOrder":
        target.place({ listPrice: action.input.listPrice, customerRank: action.input.customerRank });
        return;
      case "Checkout":
        target.checkout();
        return;
      case "Ship":
        target.ship();
        return;
      case "Cancel":
        target.cancel();
        return;
      default: {
        const unknown: never = action;
        throw new Error(`adapter: unknown action ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    // `OrderStatus` uses the specification's state names verbatim.
    return currentOrder().status;
  },
};
