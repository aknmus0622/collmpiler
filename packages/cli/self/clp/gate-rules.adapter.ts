import type { StateName, TargetSystemAdapter } from "./gate-rules.adapter.contract.ts";
import {
  changedFileVerdict,
  partFileVerdict,
  removedVerdict,
  sandboxFileVerdict,
  siteBroken,
  testsVerdict,
  wiringVerdict,
} from "../src/gate-rules/gate-rules.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The gate rules are pure functions with no state and no dependencies, so there is no system to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    switch (command.name) {
      case "ChangedFile":
        return changedFileVerdict(command.input);
      case "PartFile":
        return partFileVerdict(command.input);
      case "Removed":
        return removedVerdict(command.input);
      case "SandboxFile":
        return sandboxFileVerdict(command.input);
      case "Site":
        return siteBroken(command.input);
      case "Tests":
        return testsVerdict(command.input);
      case "Wiring":
        return wiringVerdict(command.input);
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production code has no state of its own; it is always in the specification's single state.
    return "READY";
  },
};
