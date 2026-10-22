import type { TargetSystemAdapter } from "./fill-check.adapter.contract.ts";
import { fillCheck } from "../src/fill-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The fill check is a pure function with no state and no dependencies, so there is nothing to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Fragment":
        return fillCheck({
          kind: query.input.kind,
          inline: query.input.inline,
          entry: query.input.entry,
          byInterpretation: query.input.byInterpretation,
        });
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
