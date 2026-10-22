import type { Ports, Query, QueryOutput, TargetSystemAdapter } from "./fit-check.adapter.contract.ts";
import { fitCheck } from "../src/fit-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The fit-check component is stateless and has no dependencies: there is nothing to build or discard.
let ports: Ports | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(p) {
    ports = p;
  },
  async teardownIsolation() {
    ports = undefined;
  },
  async executeCommand(command) {
    // The contract defines no commands.
    throw new Error(`unknown command: ${(command as { name: string }).name}`);
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Fits": {
        const { given, target, base, subset, sameSort } = query.input;
        return fitCheck({ given, target, base, subset, sameSort });
      }
      default:
        throw new Error(`unknown query: ${(query as { name: string }).name}`);
    }
  },
};
