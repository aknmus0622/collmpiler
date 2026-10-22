import type { Command, Ports, Query, QueryOutput, TargetSystemAdapter } from "./fines.adapter.contract.ts";
import { Fines } from "../src/fines/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: Fines | undefined;

function current(): Fines {
  if (system === undefined) throw new Error("adapter: setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports: Ports) {
    // Fines has no dependencies on the outside world, so there is nothing to connect.
    system = new Fines();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    switch (command.name) {
      case "Charge":
        current().charge(command.input.member, command.input.days);
        return;
      case "Pay":
        current().pay(command.input.member);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Owed":
        return current().owed(query.input.member);
      default: {
        const unknown: never = query.name;
        throw new Error(`adapter: unknown query ${JSON.stringify(unknown)}`);
      }
    }
  },
};
