import type { TargetSystemAdapter } from "./fit-check.adapter.contract.ts";
import { decideFit } from "../src/fit-check.ts";

// The production `fit-check` component is a stateless function with no dependencies, and `Ports` is empty,
// so there is nothing to build, connect or discard. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands, so this cannot be reached by a well-formed trial.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Fits":
        return decideFit(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
