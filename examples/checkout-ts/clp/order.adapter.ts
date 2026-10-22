import type { Command, Ports, Query, TargetSystemAdapter } from "./order.adapter.contract.ts";
import { Order } from "../src/index.ts";
import type { OrderDependencies } from "../src/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let order: Order | null = null;

function dependenciesFor(ports: Ports): OrderDependencies {
  return {
    calendar: {
      isMonthEnd: () => ports.calendar.IsMonthEnd(),
    },
    payment: {
      isActive: () => ports.payment.Active(),
      result: () => ports.payment.Result(),
    },
    customer: {
      sendOrderConfirmation: () => ports.customer.OrderConfirmation({}),
      sendReceipt: (amount, discountPercent) => ports.customer.Receipt({ amount, discountPercent }),
      issueCoupon: (type) => ports.customer.Coupon({ type }),
      sendPaymentFailure: () => ports.customer.PaymentFailure({}),
      sendShippingNotice: (priority) => ports.customer.ShippingNotice({ priority }),
    },
    refunds: {
      refund: (amount) => ports.refunds.Refund({ amount }),
    },
  };
}

function current(): Order {
  if (order === null) throw new Error("adapter: setupIsolation has not been called");
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(dependenciesFor(ports));
  },
  async teardownIsolation() {
    order = null;
  },
  async executeCommand(command: Command) {
    const o = current();
    switch (command.name) {
      case "PlaceOrder":
        return o.placeOrder(command.input.customerRank, command.input.listPrice);
      case "Checkout":
        return o.checkout();
      case "Ship":
        return o.ship();
      case "Cancel":
        return o.cancel();
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async executeQuery(query: Query) {
    const o = current();
    switch (query.name) {
      case "Status":
        return o.status();
      default: {
        const unknown: never = query.name;
        throw new Error(`adapter: unknown query ${JSON.stringify(unknown)}`);
      }
    }
  },
};
