import type { Ports, StateName, TargetSystemAdapter } from "./step-choice.adapter.contract.ts";
import { StepChoice } from "../src/step-choice.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: StepChoice | null = null;

function current(): StepChoice {
  if (system === null) throw new Error("adapter: setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    system = new StepChoice({
      holds: (condition) => ports.queries.holds({ condition }),
    });
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "BeginCases":
        return s.beginCases();
      case "BeginStep":
        return s.beginStep(command.input.state);
      case "Case":
        return s.caseNamed(command.input.name);
      case "Choose": {
        const { chosen, refused } = s.choose({
          forced: command.input.forced,
          pick: command.input.pick,
          strict: command.input.strict,
        });
        return { chosen, refused };
      }
      case "Consider":
        return s.consider(command.input.command, command.input.everywhere);
      case "Considered":
        return s.considered();
      case "DecideCase": {
        const { chosen, conflict } = s.decideCase();
        return { chosen, conflict };
      }
      case "From":
        return s.from(command.input.state);
      case "OnlyIf":
        return s.onlyIf(command.input.condition);
      case "PathValue":
        return s.pathValue(command.input.value);
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    current();
    // The component has no states of its own; it is always in the specification state READY.
    return "READY";
  },
};
