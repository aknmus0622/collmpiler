import type { Command, Query, TargetSystemAdapter } from "./members.adapter.contract.ts";
import { Members } from "../src/members/index.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: Members | undefined;

function current(): Members {
  if (system === undefined) throw new Error("adapter: setupIsolation was not called");
  return system;
}

function unknown(name: never): never {
  throw new Error(`adapter: unknown operation ${String(name)}`);
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // The members component has no dependencies on the outside world (Ports is empty).
    system = new Members();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    const members = current();
    switch (command.name) {
      case "Register":
        return members.register(command.input.member);
      case "Extend":
        return members.extend(command.input.member);
      default:
        return unknown((command as { name: never }).name);
    }
  },
  async executeQuery(query: Query) {
    const members = current();
    switch (query.name) {
      case "IsMember":
        return members.isMember(query.input.member);
      case "IsExtended":
        return members.isExtended(query.input.member);
      default:
        return unknown((query as { name: never }).name);
    }
  },
};
