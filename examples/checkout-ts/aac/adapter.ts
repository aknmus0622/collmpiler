import type { TargetSystemAdapter } from "./adapter.contract.ts";
import { Order } from "../src/order.ts";

let order: Order | null = null;

function current(): Order {
  if (order === null) throw new Error("setupIsolation has not been called");
  return order;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    order = new Order(ports);
  },
  async teardownIsolation() {
    order = null;
  },
  async executeAction(action, input) {
    current().execute(action, input);
  },
  async getCurrentState() {
    return current().currentState();
  },
};
