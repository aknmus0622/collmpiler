import type { TargetSystemAdapter } from "./checker-verdict.adapter.contract.ts";
import { checkerVerdict } from "../src/checker-verdict.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The production component is a stateless pure function with no dependencies, so there is no
// system instance to build or discard and no ports to connect.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands.
    const unknown: never = command;
    throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Verdict":
        return checkerVerdict(query.input.kind, query.input.status);
      default: {
        const unknown: never = query.name;
        throw new Error(`unknown query: ${String(unknown)}`);
      }
    }
  },
};
