import type { Command, TargetSystemAdapter } from "./payload-check.adapter.contract.ts";
import { PayloadCheck } from "../src/payload-check.ts";
import type { ConstantValue } from "../src/payload-check-types.ts";

let check: PayloadCheck | null = null;

function current(): PayloadCheck {
  if (check === null) {
    throw new Error("setupIsolation has not been called");
  }
  return check;
}

// The production code takes a constant as one value that carries only what goes with its kind.
function constantValue(input: Extract<Command, { name: "Constant" }>["input"]): ConstantValue {
  switch (input.kind) {
    case "boolean":
      return { kind: "boolean" };
    case "integer":
      return { kind: "integer", value: input.number };
    case "number":
      return { kind: "number", value: input.number };
    case "string":
      return { kind: "string", value: input.text };
  }
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    check = new PayloadCheck({
      declarations: {
        isEffectDeclared: (name) => ports.queries.effectDeclared({ name }),
        isFieldDeclared: (effect, field) => ports.queries.fieldDeclared({ effect, field }),
        fieldKind: (effect, field) => ports.queries.fieldKind({ effect, field }),
        // The production code asks for the bound itself; `null` stands for "has none".
        fieldMinimum: (effect, field) =>
          ports.queries.hasMinimum({ effect, field }) ? ports.queries.minimum({ effect, field }) : null,
        fieldMaximum: (effect, field) =>
          ports.queries.hasMaximum({ effect, field }) ? ports.queries.maximum({ effect, field }) : null,
        isInFieldSet: (effect, field, value) => ports.queries.memberOf({ effect, field, value }),
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
        target.givenField(command.input.name);
        break;
      case "Constant":
        target.constant(constantValue(command.input));
        break;
      case "Typed":
        target.typed(command.input.type);
        break;
      case "Unresolved":
        target.unresolved();
        break;
      case "DeclaredField":
        target.declaredField(command.input.name);
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
