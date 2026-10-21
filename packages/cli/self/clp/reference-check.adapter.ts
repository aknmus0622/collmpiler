import type { TargetSystemAdapter } from "./reference-check.adapter.contract.ts";
import { ReferenceCheck } from "../src/reference-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: ReferenceCheck | undefined;

function current(): ReferenceCheck {
  if (!system) throw new Error("adapter: setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new ReferenceCheck(
      { isDeclared: (name) => ports.queries.stateDeclared({ name }) },
      { isDeclared: (name) => ports.queries.effectDeclared({ name }) },
      {
        reportDiagnostic: (d) =>
          ports.effects.ReportDiagnostic({
            caseName: d.caseName,
            code: d.code,
            command: d.command,
            subject: d.subject,
          }),
      },
    );
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "Begin":
        return s.begin();
      case "EnterCommand":
        return s.enterCommand(command.input.name);
      case "AllowFrom":
        return s.allowFrom(command.input.state);
      case "EnterCase":
        return s.enterCase(command.input.name);
      case "GoTo":
        return s.goTo(command.input.state);
      case "UseEffect":
        return s.useEffect(command.input.name);
      case "LeaveCommand":
        return s.leaveCommand();
      case "Finish":
        return s.finish();
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    // Production state names are identical to the spec's StateName values.
    return current().state;
  },
};
