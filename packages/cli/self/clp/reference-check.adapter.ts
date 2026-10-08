import type { StateName, TargetSystemAdapter } from "./reference-check.adapter.contract.ts";
import { ReferenceCheck } from "../src/reference-check.ts";

let check: ReferenceCheck | null = null;

function current(): ReferenceCheck {
  if (check === null) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return check;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    check = new ReferenceCheck({
      declarations: {
        isStateDeclared: (state) => ports.queries.stateDeclared({ name: state }),
        isEffectDeclared: (name) => ports.queries.effectDeclared({ name }),
      },
      diagnostics: {
        report: (diagnostic) =>
          ports.effects.ReportDiagnostic({
            caseName: diagnostic.caseName,
            code: diagnostic.code,
            command: diagnostic.command,
            subject: diagnostic.subject,
          }),
      },
    });
  },
  async teardownIsolation() {
    check = null;
  },
  async executeCommand(command) {
    const system = current();
    switch (command.name) {
      case "AllowFrom":
        return system.allowFrom(command.input.state);
      case "Begin":
        return system.begin();
      case "EnterCase":
        return system.enterCase(command.input.name);
      case "EnterCommand":
        return system.enterCommand(command.input.name);
      case "Finish":
        return system.finish();
      case "GoTo":
        return system.goTo(command.input.state);
      case "LeaveCommand":
        return system.leaveCommand();
      case "UseEffect":
        return system.useEffect(command.input.name);
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    // The production state names are exactly the contract's state names.
    const state: StateName = current().state;
    return state;
  },
};
