import type { TargetSystemAdapter } from "./fill-check.adapter.contract.ts";
import { decideFragment } from "../src/fill-check.ts";

// `fill-check` is stateless and has no dependencies: there is nothing to build, connect or discard,
// so `ports` goes unused and setup and teardown are empty.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands, so this can only be reached by a contract mismatch.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Fragment":
        return decideFragment(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query.name satisfies never)}`);
    }
  },
};
