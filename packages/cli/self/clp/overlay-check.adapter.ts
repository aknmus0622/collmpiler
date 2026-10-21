import type { Command, StateName, TargetSystemAdapter } from "./overlay-check.adapter.contract.ts";
import { OverlayCheck } from "../src/overlay-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: OverlayCheck | null = null;

function current(): OverlayCheck {
  if (system === null) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new OverlayCheck({
      problem: (code) => ports.effects.Problem({ code }),
    });
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command: Command) {
    const check = current();
    switch (command.name) {
      case "Asks":
        check.asks(command.input.count);
        return;
      case "Branching":
        check.branching({
          layer1Cases: command.input.layer1Cases,
          interpretationCases: command.input.interpretationCases,
          flat: command.input.flat,
          layer1Outcome: command.input.layer1Outcome,
          layer1GoTo: command.input.layer1GoTo,
        });
        return;
      case "Call":
        check.call(command.input.exists, command.input.keyedPart, command.input.keyGiven);
        return;
      case "Entry":
        check.entry(command.input.listed, command.input.closed, command.input.inLayer1);
        return;
      case "Key":
        check.key(command.input.known);
        return;
      case "Slot":
        check.slot(command.input.known, command.input.layer1, command.input.interpretation);
        return;
      case "Stamp":
        check.stamp(command.input.recorded, command.input.current);
        return;
      case "State":
        check.state(command.input.described);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // OverlayCheck has no states of its own; it is always in the specification's single state.
    current();
    return "READY";
  },
};
