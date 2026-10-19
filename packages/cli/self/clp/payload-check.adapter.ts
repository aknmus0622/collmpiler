import type { Command, StateName, TargetSystemAdapter } from "./payload-check.adapter.contract.ts";
import { PayloadCheck } from "../src/payload-check/payload-check.ts";
import type { ConstantValue, PayloadCheckState } from "../src/payload-check/types.ts";

const STATE_NAMES: Record<PayloadCheckState, StateName> = {
  "outside": "OUTSIDE",
  "inactive": "INACTIVE",
  "active": "ACTIVE",
  "checking": "CHECKING",
  "settled": "SETTLED",
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
        declaresField: (field) => queries.fieldDeclared({ field }),
        fieldType: (field) => queries.fieldKind({ field }),
        isOptional: (field) => queries.fieldOptional({ field }),
        minimum: (field) => (queries.hasMinimum({ field }) ? queries.minimum({ field }) : undefined),
        maximum: (field) => (queries.hasMaximum({ field }) ? queries.maximum({ field }) : undefined),
        isMember: (field, value) => queries.memberOf({ field, value }),
      },
      {
        givesField: (field) => queries.fieldGiven({ field }),
      },
      {
        report: (diagnostic) =>
          effects.Report({
            code: diagnostic.code,
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
      case "EnterSlot":
        return check.enterSlot(command.input);
      case "GivenField":
        return check.givenField(command.input.name);
      case "Judged":
        return check.judged(command.input.fits);
      case "LeaveSlot":
        return check.leaveSlot();
      case "Null":
        return check.nullValue();
      case "Source":
        return check.source(command.input.kind);
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
