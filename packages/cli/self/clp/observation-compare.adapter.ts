import type { TargetSystemAdapter } from "./observation-compare.adapter.contract.ts";
import { ObservationCompare } from "../src/observation-compare.ts";

let system: ObservationCompare | undefined;

function current(): ObservationCompare {
  if (system === undefined) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return system;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  // `ports` is empty in this contract: the production code has no dependencies.
  async setupIsolation() {
    system = new ObservationCompare();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Actual":
        current().actual(command.input.leaf);
        return;
      case "Begin":
        current().begin({
          answered: command.input.answered,
          answers: command.input.answers,
        });
        return;
      case "Expected":
        current().expected(command.input.leaf);
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
