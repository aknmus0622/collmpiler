import type { QueryOutput, TargetSystemAdapter } from "./type-check.adapter.contract.ts";
import { promiseProblems, rowProblems } from "../src/type-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The type-check component has no state and no dependencies: there is nothing to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands.
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Promise":
        return promiseProblems(query.input);
      case "Row":
        return rowProblems(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
