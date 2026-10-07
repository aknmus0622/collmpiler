import type { TargetSystemAdapter } from "./payload-check.adapter.contract.ts";
import { PayloadCheck } from "../src/payload-check.ts";

let check: PayloadCheck | null = null;

function current(): PayloadCheck {
  if (check === null) {
    throw new Error("setupIsolation has not been called");
  }
  return check;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    check = new PayloadCheck({
      declarations: {
        isEffectDeclared: (name) => ports.queries.effectDeclared({ name }),
        isFieldDeclared: (effect, field) => ports.queries.fieldDeclared({ effect, field }),
        fieldKind: (effect, field) => ports.queries.fieldKind({ effect, field }),
      },
      payloads: {
        isFieldGiven: (effect, field) => ports.queries.fieldGiven({ effect, field }),
      },
      diagnostics: {
        report: (diagnostic) =>
          ports.effects.ReportDiagnostic({
            code: diagnostic.code,
            effect: diagnostic.effect,
            field: diagnostic.field,
          }),
      },
    });
  },
  async teardownIsolation() {
    check = null;
  },
  async executeCommand(command) {
    const target = current();
    switch (command.name) {
      case "EnterEffect":
        target.enterEffect(command.input.name);
        break;
      case "GivenField":
        target.givenField(command.input.field, command.input.kind);
        break;
      case "DeclaredField":
        target.declaredField(command.input.field);
        break;
      case "LeaveEffect":
        target.leaveEffect();
        break;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return current().state;
  },
};
