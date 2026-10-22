import type { TargetSystemAdapter } from "./step-choice.adapter.contract.ts";
import { StepChoice } from "../src/step-choice.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: StepChoice | undefined;

function current(): StepChoice {
  if (!system) throw new Error("setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new StepChoice({
      holds: (name) => ports.oracle.Holds({ name }),
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "BeginCases":
        current().beginCases();
        return;
      case "Case":
        current().considerCase(command.input.name);
        return;
      default:
        throw new Error(`unknown command: ${(command as { name: string }).name}`);
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Decision": {
        const d = current().decision();
        return { chosen: d.chosen, conflict: d.conflict, otherwise: d.otherwise };
      }
      default:
        throw new Error(`unknown query: ${(query as { name: string }).name}`);
    }
  },
};
