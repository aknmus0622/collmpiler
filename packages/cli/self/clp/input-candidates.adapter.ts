import type { StateName, TargetSystemAdapter } from "./input-candidates.adapter.contract.ts";
import { InputCandidates } from "../src/input-candidates/input-candidates.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The component has no dependencies, so `ports` (empty queries and effects) has nothing to connect to.
let system: InputCandidates | null = null;

function current(): InputCandidates {
  if (system === null) throw new Error("the system is not set up");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    system = new InputCandidates();
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    const target = current();
    switch (command.name) {
      case "Around":
        target.around(command.input.around);
        return;
      case "BeginAmong":
        target.beginAmong(command.input.pick);
        return;
      case "BeginNumbers":
        target.beginNumbers(command.input.integer, command.input.min, command.input.max);
        return;
      case "BeginStrings":
        target.beginStrings();
        return;
      case "DecideAmong":
        return target.decideAmong();
      case "DecideNumbers": {
        const answer = target.decideNumbers();
        return { limits: [...answer.limits], thresholds: [...answer.thresholds] };
      }
      case "DecideStrings": {
        const answer = target.decideStrings();
        return { known: [...answer.known], lengths: [...answer.lengths] };
      }
      case "Item":
        target.item(command.input.usable);
        return;
      case "LengthNumber":
        target.lengthNumber(command.input.number);
        return;
      case "Text":
        target.text(command.input.text);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The component has no states of its own; the specification's only state is READY.
    current();
    return "READY";
  },
};
