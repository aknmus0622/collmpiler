import type { TargetSystemAdapter } from "./overlay-check.adapter.contract.ts";
import { decideEntry } from "../src/overlay-check.ts";

// `overlay-check` is stateless and has no dependencies: there is nothing to build, connect or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`the contract defines no commands: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Entry":
        return decideEntry(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
