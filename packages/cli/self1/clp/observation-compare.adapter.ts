import type { TargetSystemAdapter } from "./observation-compare.adapter.contract.ts";
import { ObservationCompare } from "../src/observation-compare.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: ObservationCompare | undefined;

function current(): ObservationCompare {
  if (system === undefined) throw new Error("adapter: setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    system = new ObservationCompare();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Begin":
        current().begin(command.input.answered, command.input.answers);
        return;
      case "Expected":
        current().expected(command.input.leaf);
        return;
      case "Actual":
        current().actual(command.input.leaf);
        return;
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Decide":
        return current().decide();
    }
  },
};
