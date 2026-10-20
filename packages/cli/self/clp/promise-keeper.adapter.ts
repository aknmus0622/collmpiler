import type { Command, Ports, StateName, TargetSystemAdapter } from "./promise-keeper.adapter.contract.ts";
import { PromiseKeeper } from "../src/promise-keeper/promise-keeper.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: PromiseKeeper | null = null;

function current(): PromiseKeeper {
  if (system === null) throw new Error("setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports: Ports) {
    // The promise keeper has no dependencies, so there is nothing in `ports` to connect.
    system = new PromiseKeeper();
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command: Command) {
    const keeper = current();
    switch (command.name) {
      case "BeginFreshNumber":
        keeper.beginFreshNumber(command.input.drawn);
        return;
      case "BeginFreshText":
        keeper.beginFreshText(command.input.drawn);
        return;
      case "UsedNumber":
        keeper.usedNumber(command.input.value);
        return;
      case "UsedText":
        keeper.usedText(command.input.value);
        return;
      case "Fresh":
        return keeper.fresh();
      case "Increasing":
        return keeper.increasing({
          drawn: command.input.drawn,
          previous: command.input.previous,
          delta: command.input.delta,
          max: command.input.max,
        });
      case "Restart":
        return keeper.restart(command.input.durable);
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    current();
    // The promise keeper has no states of its own; the specification's only state is READY.
    return "READY";
  },
};
