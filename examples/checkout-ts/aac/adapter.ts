import type { Ports, TargetSystemAdapter } from "./adapter.contract.ts";
import { Order, OrderActionNotAllowedError } from "../src/index.ts";
import type { CalendarDate, OrderDependencies } from "../src/index.ts";

// Dates handed to the production code in place of the harness's `isMonthEnd` flag, as prescribed by
// the doc comment of `BusinessCalendar` in ../src/ports.ts.
const MONTH_END_DAY: CalendarDate = { year: 2026, month: 1, day: 31 };
const ORDINARY_DAY: CalendarDate = { year: 2026, month: 1, day: 15 };

function dependenciesFor(ports: Ports): OrderDependencies {
  return {
    calendar: {
      today: () => (ports.queries.isMonthEnd() ? { ...MONTH_END_DAY } : { ...ORDINARY_DAY }),
    },
    payments: {
      isActive: () => ports.queries.paymentModuleActive(),
      // `charge` is the `paymentResult` query itself; the amount has no counterpart in `ports`.
      charge: (_amountYen) => ports.queries.paymentResult(),
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
      issue: (type) => ports.commands.IssueCoupon({ type }),
    },
  };
}

let order: Order | undefined;

function currentOrder(): Order {
  if (order === undefined) {
    throw new Error("adapter: no system under test; setupIsolation has not been called");
  }
  return order;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(dependenciesFor(ports));
  },
  async teardownIsolation() {
    order = undefined;
  },
  async executeAction(action) {
    const target = currentOrder();
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
        default: {
          const unknown: never = action;
          throw new Error(`adapter: unknown action ${JSON.stringify(unknown)}`);
        }
      }
    } catch (error) {
      // The production code reports a refused action by throwing; the contract has no result for
      // that, so a refusal is simply an action that changed nothing. Any other error propagates.
      if (error instanceof OrderActionNotAllowedError) return;
      throw error;
    }
  },
  async getCurrentState() {
    // `OrderStatus` uses the specification's state names unchanged.
    return currentOrder().status();
  },
};
