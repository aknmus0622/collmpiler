import type { Command, StateName, TargetSystemAdapter } from "./overlay-check.adapter.contract.ts";
import { OverlayCheck } from "../src/overlay-check/overlay-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: OverlayCheck | undefined;

function current(): OverlayCheck {
  if (!system) throw new Error("adapter: setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new OverlayCheck({
      problem: (problem) => ports.effects.Problem({ code: problem.code }),
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    const check = current();
    switch (command.name) {
      case "Asks":
        return check.asks(command.input.count);
      case "Branching":
        return check.branching(command.input);
      case "Call":
        return check.call(command.input);
      case "Entry":
        return check.entry(command.input);
      case "Key":
        return check.key(command.input.known);
      case "Slot":
        return check.slot(command.input);
      case "Stamp":
        return check.stamp(command.input);
      case "State":
        return check.state(command.input.described);
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production check has a single state and does not expose it; it is always the specification's READY.
    current();
    return "READY";
  },
};
