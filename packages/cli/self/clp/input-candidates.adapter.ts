import type { TargetSystemAdapter } from "./input-candidates.adapter.contract.ts";
import { InputCandidates } from "../src/input-candidates.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: InputCandidates | null = null;

function current(): InputCandidates {
  if (system === null) throw new Error("the system is not set up");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // The component has no dependencies, so there is nothing in `ports` to connect.
    system = new InputCandidates();
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "Around":
        s.around(command.input.around);
        return;
      case "BeginAmong":
        s.beginAmong(command.input.pick);
        return;
      case "BeginNumbers":
        s.beginNumbers(command.input.integer, command.input.min, command.input.max);
        return;
      case "BeginStrings":
        s.beginStrings();
        return;
      case "Item":
        s.item(command.input.usable);
        return;
      case "LengthNumber":
        s.lengthNumber(command.input.number);
        return;
      case "Text":
        s.text(command.input.text);
        return;
      default:
        throw new Error(`unknown command: ${(command as { name: string }).name}`);
    }
  },
  async executeQuery(query) {
    const s = current();
    switch (query.name) {
      case "DecideAmong":
        return s.decideAmong();
      case "DecideNumbers": {
        const { limits, thresholds } = s.decideNumbers();
        return { limits, thresholds };
      }
      case "DecideStrings": {
        const { known, lengths } = s.decideStrings();
        return { known, lengths };
      }
      default:
        throw new Error(`unknown query: ${(query as { name: string }).name}`);
    }
  },
};
