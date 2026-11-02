import type { Command, Query, QueryOutput, TargetSystemAdapter } from "./step-choice.adapter.contract.ts";
import { StepChoice } from "../src/step-choice.ts";

let system: StepChoice | undefined;

function currentSystem(): StepChoice {
  if (system === undefined) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return system;
}

// Forwards each call to the production code. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new StepChoice({
      holds: (name) => ports.oracle.Holds({ name }),
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    switch (command.name) {
      case "BeginCases":
        currentSystem().beginCases();
        return;
      case "Case":
        currentSystem().case(command.input.name);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Decision":
        return currentSystem().decision();
      default: {
        const unknown: never = query.name;
        throw new Error(`adapter: unknown query ${JSON.stringify(unknown)}`);
      }
    }
  },
};
