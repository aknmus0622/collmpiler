import type { TargetSystemAdapter } from "./step-choice.adapter.contract.ts";
import { StepChoice } from "../src/step-choice/step-choice.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: StepChoice | undefined;

function current(): StepChoice {
  if (system === undefined) throw new Error("setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new StepChoice({
      holds: (condition) => ports.queries.holds({ condition }),
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "BeginCases":
        s.beginCases();
        return;
      case "BeginStep":
        s.beginStep(command.input.state);
        return;
      case "Case":
        s.addCase(command.input.name);
        return;
      case "Choose": {
        const { forced, pick, strict } = command.input;
        const answer = s.choose(forced, pick, strict);
        return { chosen: answer.chosen, refused: answer.refused };
      }
      case "Consider":
        s.consider(command.input.command, command.input.everywhere);
        return;
      case "Considered":
        s.considered();
        return;
      case "DecideCase": {
        const answer = s.decideCase();
        return { chosen: answer.chosen, conflict: [...answer.conflict] };
      }
      case "From":
        s.from(command.input.state);
        return;
      case "OnlyIf":
        s.onlyIf(command.input.condition);
        return;
      case "PathValue":
        s.pathValue(command.input.value);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    // The component has no states of its own; the specification's only state is READY.
    current();
    return "READY";
  },
};
