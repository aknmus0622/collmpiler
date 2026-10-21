import type { Command, Ports, StateName, TargetSystemAdapter } from "./payload-check.adapter.contract.ts";
import { PayloadCheck } from "../src/payload-check.ts";
import type { PayloadCheckListener, SlotDeclaration } from "../src/payload-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: PayloadCheck | null = null;

function current(): PayloadCheck {
  if (system === null) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

function declarationFor(ports: Ports): SlotDeclaration {
  return {
    declaresField: (field) => ports.queries.fieldDeclared({ field }),
    givesField: (field) => ports.queries.fieldGiven({ field }),
    fieldKind: (field) => ports.queries.fieldKind({ field }),
    isOptional: (field) => ports.queries.fieldOptional({ field }),
    hasMinimum: (field) => ports.queries.hasMinimum({ field }),
    minimum: (field) => ports.queries.minimum({ field }),
    hasMaximum: (field) => ports.queries.hasMaximum({ field }),
    maximum: (field) => ports.queries.maximum({ field }),
    isMember: (field, value) => ports.queries.memberOf({ field, value }),
  };
}

function listenerFor(ports: Ports): PayloadCheckListener {
  return {
    report: (finding) => ports.effects.Report({ code: finding.code, field: finding.field }),
  };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new PayloadCheck(declarationFor(ports), listenerFor(ports));
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command: Command) {
    const check = current();
    switch (command.name) {
      case "EnterSlot":
        return check.enterSlot(command.input);
      case "DeclaredField":
        return check.declaredField(command.input.name);
      case "GivenField":
        return check.givenField(command.input.name);
      case "Source":
        return check.source(command.input.kind);
      case "Constant":
        return check.constant(command.input);
      case "Typed":
        return check.typed(command.input.type);
      case "Judged":
        return check.judged(command.input.fits);
      case "Null":
        return check.nullValue();
      case "Unresolved":
        return check.unresolved();
      case "LeaveSlot":
        return check.leaveSlot();
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // Production state names are identical to the specification's.
    return current().state;
  },
};
