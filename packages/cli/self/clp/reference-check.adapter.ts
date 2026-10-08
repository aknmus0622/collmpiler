import type { StateName, TargetSystemAdapter } from "./reference-check.adapter.contract.ts";
import { ReferenceCheck } from "../src/reference-check/reference-check.ts";
import type { ReferenceCheckState } from "../src/reference-check/types.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

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
  if (system === undefined) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return system;
}

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
  async executeCommand(command) {
    const check = current();
    switch (command.name) {
      case "AllowFrom":
        check.allowFrom(command.input.state);
        break;
      case "Begin":
        check.begin();
        break;
      case "EnterCase":
        check.enterCase(command.input.name);
        break;
      case "EnterCommand":
        check.enterCommand(command.input.name);
        break;
      case "Finish":
        check.finish();
        break;
      case "GoTo":
        check.goTo(command.input.state);
        break;
      case "LeaveCommand":
        check.leaveCommand();
        break;
      case "UseEffect":
        check.useEffect(command.input.name);
        break;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    const state = current().state;
    const name = STATE_NAMES[state];
    if (name === undefined) {
      throw new Error(`adapter: unknown production state ${JSON.stringify(state)}`);
    }
    return name;
  },
};
