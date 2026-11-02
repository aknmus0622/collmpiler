import type { TargetSystemAdapter } from "./promise-keeper.adapter.contract.ts";
import { PromiseKeeper, increasingAnswer, restartOutcome } from "../src/promise-keeper.ts";

let system: PromiseKeeper | null = null;

function running(): PromiseKeeper {
  if (system === null) throw new Error("the system is not set up");
  return system;
}

// Forwards each call to the production code. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation() {
    // The contract's Ports is empty and PromiseKeeper has no dependencies, so there is nothing to connect.
    system = new PromiseKeeper();
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    const keeper = running();
    switch (command.name) {
      case "BeginFreshNumber":
        return keeper.beginFreshNumber(command.input.drawn);
      case "BeginFreshText":
        return keeper.beginFreshText(command.input.drawn);
      case "UsedNumber":
        return keeper.usedNumber(command.input.answered);
      case "UsedText":
        return keeper.usedText(command.input.answered);
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Fresh":
        return running().fresh();
      case "Increasing":
        return increasingAnswer(query.input);
      case "Restart":
        return restartOutcome(query.input.durable);
    }
  },
};
