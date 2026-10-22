import type { QueryOutput, TargetSystemAdapter } from "./promise-keeper.adapter.contract.ts";
import { FreshAnswer, increasingAnswer, restartOutcome } from "../src/promise-keeper.ts";

let system: FreshAnswer | null = null;

function current(): FreshAnswer {
  if (system === null) throw new Error("adapter: setupIsolation was not called");
  return system;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    system = new FreshAnswer();
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "BeginFreshNumber":
        current().beginNumber(command.input.drawn);
        return;
      case "BeginFreshText":
        current().beginText(command.input.drawn);
        return;
      case "UsedNumber":
        current().usedNumber(command.input.answered);
        return;
      case "UsedText":
        current().usedText(command.input.answered);
        return;
      default:
        throw new Error(`adapter: unknown command ${(command as { name: string }).name}`);
    }
  },
  async executeQuery(query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Fresh":
        return current().fresh();
      case "Increasing":
        return increasingAnswer(query.input);
      case "Restart":
        return restartOutcome(query.input.durable);
      default:
        throw new Error(`adapter: unknown query ${(query as { name: string }).name}`);
    }
  },
};
