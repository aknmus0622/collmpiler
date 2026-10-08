import type { Command, StateName, TargetSystemAdapter } from "./payload-check.adapter.contract.ts";
import { PayloadCheck } from "../src/payload-check/payload-check.ts";
import type { ConstantValue, PayloadCheckState } from "../src/payload-check/types.ts";

const STATE_NAMES: Record<PayloadCheckState, StateName> = {
  "outside": "OUTSIDE",
  "in-effect": "IN_EFFECT",
  "in-unknown-effect": "IN_UNKNOWN_EFFECT",
  "in-field": "IN_FIELD",
  "in-settled-field": "IN_SETTLED_FIELD",
};

type ConstantInput = Extract<Command, { name: "Constant" }>["input"];

function toConstantValue(input: ConstantInput): ConstantValue {
  switch (input.kind) {
    case "boolean":
      return { kind: "boolean" };
    case "integer":
      return { kind: "integer", value: input.number };
    case "number":
      return { kind: "number", value: input.number };
    case "string":
      return { kind: "string", text: input.text };
  }
}

let system: PayloadCheck | undefined;

function current(): PayloadCheck {
  if (system === undefined) {
    throw new Error("adapter: setupIsolation has not been called");
  }
  return system;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    const { queries, effects } = ports;
    system = new PayloadCheck(
      {
        declaresEffect: (effect) => queries.effectDeclared({ name: effect }),
        declaresField: (effect, field) => queries.fieldDeclared({ effect, field }),
        fieldType: (effect, field) => queries.fieldKind({ effect, field }),
        minimum: (effect, field) =>
          queries.hasMinimum({ effect, field }) ? queries.minimum({ effect, field }) : undefined,
        maximum: (effect, field) =>
          queries.hasMaximum({ effect, field }) ? queries.maximum({ effect, field }) : undefined,
        isMember: (effect, field, value) => queries.memberOf({ effect, field, value }),
      },
      {
        givesField: (effect, field) => queries.fieldGiven({ effect, field }),
      },
      {
        report: (diagnostic) =>
          effects.ReportDiagnostic({
            code: diagnostic.code,
            effect: diagnostic.effect,
            field: diagnostic.field,
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
      case "Constant":
        return check.constant(toConstantValue(command.input));
      case "DeclaredField":
        return check.declaredField(command.input.name);
      case "EnterEffect":
        return check.enterEffect(command.input.name);
      case "GivenField":
        return check.givenField(command.input.name);
      case "LeaveEffect":
        return check.leaveEffect();
      case "Typed":
        return check.typed(command.input.type);
      case "Unresolved":
        return check.unresolved();
    }
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
