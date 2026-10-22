import type { TargetSystemAdapter } from "./usage-check.adapter.contract.ts";
import { declaredUsage } from "../src/usage-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// usage-check has no state and no dependencies, so there is nothing to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Declared":
        return declaredUsage({
          kind: query.input.kind,
          read: query.input.read,
          written: query.input.written,
        });
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
