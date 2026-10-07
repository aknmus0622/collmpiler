import type { Action, Ports, StateName, TargetSystemAdapter } from "./adapter.contract.ts";
import { Order } from "../src/index.ts";
import type { CalendarDate, OrderDependencies } from "../src/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

// The calendar days the production code documents as standing for the `isMonthEnd` answers.
const MONTH_END_DAY: CalendarDate = { year: 2026, month: 1, day: 31 };
const ORDINARY_DAY: CalendarDate = { year: 2026, month: 1, day: 15 };

function dependenciesFor(ports: Ports): OrderDependencies {
  return {
    calendar: {
      today: () => (ports.queries.isMonthEnd() ? MONTH_END_DAY : ORDINARY_DAY),
    },
    payments: {
      isActive: () => ports.queries.paymentModuleActive(),
      charge: (_amount) => ports.queries.paymentResult(),
      refund: () => ports.commands.Refund({}),
    },
    notifier: {
      sendOrderConfirmation: () => ports.commands.SendOrderConfirmation({}),
      sendReceipt: (receipt) =>
        ports.commands.SendReceipt({ amount: receipt.amount, discountPercent: receipt.discountPercent }),
      notifyPaymentFailure: () => ports.commands.NotifyPaymentFailure({}),
      sendShippingNotice: (notice) => ports.commands.SendShippingNotice({ priority: notice.priority }),
    },
    coupons: {
      issueCoupon: (type) => ports.commands.IssueCoupon({ type }),
    },
  };
}

let order: Order | undefined;

function currentOrder(): Order {
  if (order === undefined) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(dependenciesFor(ports));
  },
  async teardownIsolation() {
    order = undefined;
  },
  async executeAction(action: Action) {
    const target = currentOrder();
    switch (action.name) {
      case "PlaceOrder":
        target.placeOrder(action.input.listPrice, action.input.customerRank);
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
  async getCurrentState(): Promise<StateName> {
    // OrderStatus uses the specification's state names unchanged.
    return currentOrder().status;
  },
};
