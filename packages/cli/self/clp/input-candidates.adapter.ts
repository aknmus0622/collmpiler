import type { TargetSystemAdapter } from "./input-candidates.adapter.contract.ts";
import { InputCandidates } from "../src/input-candidates.ts";

let system: InputCandidates | undefined;

// Forwards each call to the production code. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    system = new InputCandidates();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "BeginNumbers":
        return system!.beginNumbers(command.input);
      case "Around":
        return system!.around(command.input.around);
      case "BeginStrings":
        return system!.beginStrings();
      case "Text":
        return system!.text(command.input.text);
      case "LengthNumber":
        return system!.lengthNumber(command.input.number);
      case "BeginAmong":
        return system!.beginAmong(command.input.pick);
      case "Item":
        return system!.item(command.input.usable);
      default:
        throw new Error(`unknown command: ${JSON.stringify(command)}`);
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "DecideNumbers":
        return system!.decideNumbers();
      case "DecideStrings":
        return system!.decideStrings();
      case "DecideAmong":
        return system!.decideAmong();
      default:
        throw new Error(`unknown query: ${JSON.stringify(query)}`);
    }
  },
};
