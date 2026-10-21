import type { Command, Ports, StateName, TargetSystemAdapter } from "./input-candidates.adapter.contract.ts";
import { InputCandidates } from "../src/input-candidates.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: InputCandidates | null = null;

function current(): InputCandidates {
  if (system === null) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports: Ports) {
    // The component has no dependencies, queries or effects.
    system = new InputCandidates();
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command: Command) {
    const s = current();
    switch (command.name) {
      case "Around":
        return s.around(command.input.around);
      case "BeginAmong":
        return s.beginAmong(command.input.pick);
      case "BeginNumbers":
        return s.beginNumbers({
          integer: command.input.integer,
          min: command.input.min,
          max: command.input.max,
        });
      case "BeginStrings":
        return s.beginStrings();
      case "DecideAmong":
        return s.decideAmong();
      case "DecideNumbers":
        return s.decideNumbers();
      case "DecideStrings":
        return s.decideStrings();
      case "Item":
        return s.item(command.input.usable);
      case "LengthNumber":
        return s.lengthNumber(command.input.number);
      case "Text":
        return s.text(command.input.text);
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The component has no states of its own; it is always in the specification state READY.
    current();
    return "READY";
  },
};
