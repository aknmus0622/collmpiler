import type { TargetSystemAdapter } from "./outcome-apply.adapter.contract.ts";
import { outcomeApply } from "../src/outcome-apply.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The production component is stateless with no dependencies, so there is no system to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${(command as { name: string }).name}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Call":
        return outcomeApply({
          external: query.input.external,
          guard: query.input.guard,
          touched: query.input.touched,
        });
      default:
        throw new Error(`unknown query: ${(query as { name: string }).name}`);
    }
  },
};
