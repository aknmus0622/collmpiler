import type { Command, StateName, TargetSystemAdapter } from "./reference-check.adapter.contract.ts";
import { ReferenceCheck } from "../src/reference-check/reference-check.ts";
import type { ReferenceCheckState } from "../src/reference-check/types.ts";

const STATE_NAMES: Record<ReferenceCheckState, StateName> = {
  "idle": "IDLE",
  "between-commands": "BETWEEN_COMMANDS",
  "in-command": "IN_COMMAND",
  "in-case": "IN_CASE",
  "accepted": "ACCEPTED",
  "rejected": "REJECTED",
};

let system: ReferenceCheck | undefined;

function current(): ReferenceCheck {
  if (system === undefined) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new ReferenceCheck(
      {
        declaresState: (state) => ports.queries.stateDeclared({ name: state }),
        declaresEffect: (effect) => ports.queries.effectDeclared({ name: effect }),
      },
      {
        report: (diagnostic) =>
          ports.effects.ReportDiagnostic({
            caseName: diagnostic.caseName,
            code: diagnostic.code,
            command: diagnostic.command,
            subject: diagnostic.subject,
          }),
      },
    );
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    const target = current();
    switch (command.name) {
      case "AllowFrom":
        return target.allowFrom(command.input.state);
      case "Begin":
        return target.begin();
      case "EnterCase":
        return target.enterCase(command.input.name);
      case "EnterCommand":
        return target.enterCommand(command.input.name);
      case "Finish":
        return target.finish();
      case "GoTo":
        return target.goTo(command.input.state);
      case "LeaveCommand":
        return target.leaveCommand();
      case "UseEffect":
        return target.useEffect(command.input.name);
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
