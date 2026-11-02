import type { TargetSystemAdapter } from "./gate-rules.adapter.contract.ts";
import {
  decideChangedFile,
  decidePartFile,
  decideRemoved,
  decideSandboxFile,
  decideSite,
  decideTests,
  decideWiring,
} from "../src/gate-rules.ts";

// The production code is a set of stateless functions: there is nothing to construct, connect or discard,
// and the contract's `Ports` is empty. Query inputs already have the shape of the production facts.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "ChangedFile":
        return decideChangedFile(query.input);
      case "PartFile":
        return decidePartFile(query.input);
      case "Removed":
        return decideRemoved(query.input);
      case "SandboxFile":
        return decideSandboxFile(query.input);
      case "Site":
        return decideSite(query.input);
      case "Tests":
        return decideTests(query.input);
      case "Wiring":
        return decideWiring(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
