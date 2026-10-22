import type { TargetSystemAdapter } from "./syntax-check.adapter.contract.ts";
import { wordVerdict } from "../src/syntax-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The syntax check has no state and no dependencies: there is nothing to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Word":
        return wordVerdict(query.input.word);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
