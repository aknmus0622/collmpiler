import type { Ports, Query, QueryOutput, TargetSystemAdapter } from "./text-plan.adapter.contract.ts";
import { contractSections, queryNotes, typeText } from "../src/text-plan.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The text plan has no state and no dependencies: there is nothing to build or discard.
let ports: Ports | null = null;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(given) {
    ports = given;
  },
  async teardownIsolation() {
    ports = null;
  },
  async executeCommand(command) {
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Notes":
        return queryNotes(query.input.promise, query.input.mayFail);
      case "Sections":
        return contractSections(query.input);
      case "TypeText":
        return typeText(query.input);
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
