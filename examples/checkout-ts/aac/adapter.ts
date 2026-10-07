import type { TargetSystemAdapter } from "./adapter.contract.ts";
import { Order, OrderCommandRejected } from "../src/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let order: Order | undefined;

function current(): Order {
  if (order === undefined) throw new Error("adapter: setupIsolation has not been called");
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order({
      clock: {
        // The production code derives `isMonthEnd` from a date: a last day of a month for true,
        // a mid-month day for false (see Clock.today in src/ports.ts).
        today: () =>
          ports.queries.isMonthEnd()
            ? { year: 2026, month: 1, day: 31 }
            : { year: 2026, month: 1, day: 15 },
      },
      paymentGateway: {
        isActive: () => ports.queries.paymentModuleActive(),
        charge: () => ports.queries.paymentResult(),
        refund: () => ports.effects.Refund({}),
      },
      notifier: {
        sendOrderConfirmation: () => ports.effects.SendOrderConfirmation({}),
        sendReceipt: (receipt) =>
          ports.effects.SendReceipt({
            amount: receipt.amountYen,
            discountPercent: receipt.discountPercent,
          }),
        notifyPaymentFailure: () => ports.effects.NotifyPaymentFailure({}),
        sendShippingNotice: (priority) => ports.effects.SendShippingNotice({ priority }),
      },
      couponIssuer: {
        issueCoupon: (type) => ports.effects.IssueCoupon({ type }),
      },
    });
  },
  async teardownIsolation() {
    order = undefined;
  },
  async executeCommand(command) {
    const target = current();
    try {
      switch (command.name) {
        case "PlaceOrder":
          target.place(command.input.customerRank, command.input.listPrice);
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
          const unknown: never = command;
          throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
        }
      }
    } catch (error) {
      // A rejected command leaves the order unchanged and performs no effect; the harness
      // observes that through the state and the recorded effects. Anything else propagates.
      if (error instanceof OrderCommandRejected) return;
      throw error;
    }
  },
  async getCurrentState() {
    // The production state names are the contract's StateName values, unchanged.
    return current().state;
  },
};
