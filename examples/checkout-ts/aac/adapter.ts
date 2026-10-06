import type { TargetSystemAdapter } from "./adapter.contract.ts";
import { OrderSystem } from "../src/checkout.ts";

// ../src/ の本番コードを import し、各メソッドから呼び出す。業務ロジックはここに書かない。
const system = new OrderSystem();

export const adapter: TargetSystemAdapter = {
  async setupIsolation() {
    system.reset();
  },
  async teardownIsolation() {
    system.reset();
  },
  async givenState(state, data) {
    system.load(state, data);
  },
  async executeAction(action, outcome) {
    system.execute(action, outcome);
  },
  async getCurrentState() {
    return system.currentState();
  },
  async getFiredCommands() {
    return system.firedCommands();
  },
};
