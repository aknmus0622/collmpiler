import type { TargetSystemAdapter } from "./checker-verdict.adapter.contract.ts";
import { classifyCheckerResult } from "../src/checker-verdict.ts";

// The production code is a stateless function with no dependencies: there is nothing to build, connect to
// `ports` or discard, so the lifecycle methods have nothing to do.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands, so `command` has type `never`.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Verdict":
        return classifyCheckerResult(query.input.kind, query.input.status);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
