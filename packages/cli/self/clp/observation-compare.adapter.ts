import type { TargetSystemAdapter } from "./observation-compare.adapter.contract.ts";
import { ObservationCompare } from "../src/observation-compare.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: ObservationCompare | undefined;

function current(): ObservationCompare {
  if (!system) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // ObservationCompare asks nothing of its environment and tells it nothing; no ports to connect.
    system = new ObservationCompare();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "Begin":
        s.begin({ answered: command.input.answered, answers: command.input.answers });
        return;
      case "Expected":
        s.expected(command.input.leaf);
        return;
      case "Actual":
        s.actual(command.input.leaf);
        return;
      case "Decide":
        return s.decide();
    }
  },
  async getCurrentState() {
    current();
    // The production code has no states of its own; the specification's only state is READY.
    return "READY";
  },
};
