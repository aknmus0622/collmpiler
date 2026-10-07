import type { Command, Ports, TargetSystemAdapter } from "./order.adapter.contract.ts";
import { Order } from "../src/order.ts";
import type { OrderDependencies } from "../src/ports.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

// The production code asks for today's date instead of the `isMonthEnd` flag; these are the two
// dates its Calendar port documents as standing for `true` and `false`.
const MONTH_END_DATE = { year: 2025, month: 1, day: 31 };
const MID_MONTH_DATE = { year: 2025, month: 1, day: 15 };

function connect(ports: Ports): OrderDependencies {
  return {
    calendar: {
      today: () => (ports.queries.isMonthEnd() ? MONTH_END_DATE : MID_MONTH_DATE),
    },
    payments: {
      isActive: () => ports.queries.paymentModuleActive(),
      charge: () => ports.queries.paymentResult(),
      refund: () => ports.effects.Refund({}),
    },
    notifier: {
      sendOrderConfirmation: () => ports.effects.SendOrderConfirmation({}),
      sendReceipt: (receipt) =>
        ports.effects.SendReceipt({
          amount: receipt.amount,
          discountPercent: receipt.discountPercent,
        }),
      notifyPaymentFailure: () => ports.effects.NotifyPaymentFailure({}),
      sendShippingNotice: (priority) => ports.effects.SendShippingNotice({ priority }),
    },
    coupons: {
      issue: (type) => ports.effects.IssueCoupon({ type }),
    },
  };
}

let order: Order | null = null;

function current(): Order {
  if (order === null) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(connect(ports));
  },
  async teardownIsolation() {
    order = null;
  },
  async executeCommand(command: Command) {
    const target = current();
    switch (command.name) {
      case "PlaceOrder":
        target.placeOrder({
          customerRank: command.input.customerRank,
          listPrice: command.input.listPrice,
        });
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
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return current().status;
  },
};
