import type { Command, Query, QueryOutput, TargetSystemAdapter } from "./type-check.adapter.contract.ts";
import { checkPromise, checkRow } from "../src/type-check.ts";

// The production code is stateless and has no dependencies, so there is nothing to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {},
  async teardownIsolation() {},
  async executeCommand(command: Command) {
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Promise":
        return checkPromise(query.input);
      case "Row":
        return checkRow(query.input);
    }
  },
};
