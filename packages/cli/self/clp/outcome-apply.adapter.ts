import type { TargetSystemAdapter } from "./outcome-apply.adapter.contract.ts";
import { decideCall } from "../src/outcome-apply.ts";

// The production code is one stateless function: there is nothing to build, connect or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands, so `command` is `never`.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Call":
        return decideCall(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
