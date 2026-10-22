import type { Command, Query, QueryOutput, TargetSystemAdapter } from "./gate-rules.adapter.contract.ts";
import {
  changedFileVerdict,
  partFileVerdict,
  removedVerdict,
  sandboxFileVerdict,
  siteBroken,
  testsVerdict,
  wiringVerdict,
} from "../src/gate-rules.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The component has no state and no dependencies: there is nothing to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command: Command) {
    throw new Error(`unknown command: ${(command as { name: string }).name}`);
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "ChangedFile":
        return changedFileVerdict({ ...query.input });
      case "PartFile":
        return partFileVerdict({ ...query.input });
      case "Removed":
        return removedVerdict({ ...query.input });
      case "SandboxFile":
        return sandboxFileVerdict({ ...query.input });
      case "Site":
        return siteBroken({ ...query.input });
      case "Tests":
        return testsVerdict({ ...query.input });
      case "Wiring":
        return wiringVerdict({ ...query.input });
      default:
        throw new Error(`unknown query: ${(query as { name: string }).name}`);
    }
  },
};
