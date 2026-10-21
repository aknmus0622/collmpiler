import type { TargetSystemAdapter } from "./text-plan.adapter.contract.ts";
import { contractSections, queryNotes, requestSections, typeText } from "../src/text-plan.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The production component is stateless (always READY) and has no dependencies, so there is
// nothing to build or discard per trial.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    switch (command.name) {
      case "ContractSections":
        return contractSections(command.input);
      case "QueryNotes":
        return queryNotes(command.input);
      case "RequestSections":
        return requestSections(command.input);
      case "TypeText":
        return typeText(command.input);
    }
  },
  async getCurrentState() {
    return "READY";
  },
};
