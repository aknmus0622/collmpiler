import type { Command, CommandOutput, Ports, StateName, TargetSystemAdapter } from "./gate-rules.adapter.contract.ts";
import {
  changedFileVerdict,
  partFileVerdict,
  removedVerdict,
  sandboxFileVerdict,
  siteIsBroken,
  testsVerdict,
  wiringVerdict,
} from "../src/gate-rules.ts";

// The production component is a set of pure functions with no dependencies and no
// state of its own (always in the specification state `READY`), so there is nothing
// to build, connect to `ports`, or discard beyond the reference to the ports.
let currentPorts: Ports | undefined;

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    currentPorts = ports;
  },
  async teardownIsolation() {
    currentPorts = undefined;
  },
  async executeCommand(command: Command): Promise<CommandOutput[keyof CommandOutput] | void> {
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
        return siteIsBroken(command.input);
      case "Tests":
        return testsVerdict(command.input);
      case "Wiring":
        return wiringVerdict(command.input);
    }
  },
  async getCurrentState(): Promise<StateName> {
    return "READY";
  },
};
