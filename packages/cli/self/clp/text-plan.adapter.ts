import type { Command, StateName, TargetSystemAdapter } from "./text-plan.adapter.contract.ts";
import { TextPlan } from "../src/text-plan/text-plan.ts";
import type { TextPlanState, TypeShape } from "../src/text-plan/types.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let system: TextPlan | undefined;

function current(): TextPlan {
  if (!system) throw new Error("the system is not set up");
  return system;
}

const stateNames: Record<TextPlanState, StateName> = {
  ready: "READY",
};

type TypeTextInput = Extract<Command, { name: "TypeText" }>["input"];

/** Translates the spec's `TypeText` input into the production `TypeShape`, keeping only the inputs that apply. */
function toTypeShape(input: TypeTextInput): TypeShape {
  switch (input.kind) {
    case "value":
    case "string":
    case "number":
      return { kind: input.kind };
    case "one-of":
      return { kind: "one-of", variants: input.entries.map(({ name, text }) => ({ name, text })) };
    case "optional":
    case "list":
      return { kind: input.kind, inner: input.inner };
    case "record":
      return {
        kind: "record",
        fields: input.entries.map(({ name, optional, text }) => ({ name, optional, text })),
      };
    case "enum":
      return { kind: "enum", members: input.members };
    case "primitive":
      return { kind: "primitive", name: input.name };
  }
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // The text plan has no dependencies, so there is nothing in `ports` to connect.
    system = new TextPlan();
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const plan = current();
    switch (command.name) {
      case "ContractSections":
        return plan.contractSections(command.input);
      case "QueryNotes":
        return plan.queryNotes(command.input.promise, command.input.mayFail);
      case "RequestSections":
        return plan.requestSections(command.input);
      case "TypeText":
        return plan.typeText(toTypeShape(command.input));
    }
  },
  async getCurrentState() {
    return stateNames[current().state];
  },
};
