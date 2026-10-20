import type { TargetSystemAdapter } from "./observation-compare.adapter.contract.ts";
import { ObservationCompare } from "../src/observation-compare/observation-compare.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: ObservationCompare | undefined;

function current(): ObservationCompare {
  if (!system) throw new Error("setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // The production code has no dependencies, so there is nothing in `ports` to connect.
    system = new ObservationCompare();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "Begin":
        return s.begin(command.input.answers, command.input.answered);
      case "Expected":
        return s.expected(command.input.leaf);
      case "Actual":
        return s.actual(command.input.leaf);
      case "Decide":
        return s.decide();
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    current();
    // The specification's only state is READY; the production code has no state to read.
    return "READY";
  },
};
