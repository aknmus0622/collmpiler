import type { TargetSystemAdapter } from "./promise-keeper.adapter.contract.ts";
import { PromiseKeeper } from "../src/promise-keeper.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: PromiseKeeper | undefined;

function current(): PromiseKeeper {
  if (!system) throw new Error("setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // The component has no dependencies and no effects; nothing to connect to the ports.
    system = new PromiseKeeper();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const keeper = current();
    switch (command.name) {
      case "BeginFreshNumber":
        return keeper.beginFreshNumber(command.input.drawn);
      case "BeginFreshText":
        return keeper.beginFreshText(command.input.drawn);
      case "Fresh":
        return keeper.fresh();
      case "Increasing":
        return keeper.increasing({
          previous: command.input.previous,
          drawn: command.input.drawn,
          delta: command.input.delta,
          max: command.input.max,
        });
      case "Restart":
        return keeper.restart(command.input.durable);
      case "UsedNumber":
        return keeper.usedNumber(command.input.value);
      case "UsedText":
        return keeper.usedText(command.input.value);
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    current();
    // The component has no states of its own; it is always in the specification state READY.
    return "READY";
  },
};
