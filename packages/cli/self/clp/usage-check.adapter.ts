import type { TargetSystemAdapter } from "./usage-check.adapter.contract.ts";
import { checkDeclared } from "../src/usage-check.ts";

// `usage-check` is one pure function: there is nothing to construct, connect or discard,
// and the contract has no commands.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Declared":
        return checkDeclared(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
