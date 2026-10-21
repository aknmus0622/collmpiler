import type { StateName, TargetSystemAdapter } from "./leaf-check.adapter.contract.ts";
import { LeafCheck } from "../src/leaf-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: LeafCheck | null = null;

function current(): LeafCheck {
  if (system === null) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new LeafCheck(
      {
        isRequired: (kind, field) => ports.queries.required({ field, kind }),
        isOutcome: (kind, field) => ports.queries.outcome({ field, kind }),
        mustHaveEntries: (group) => ports.queries.nonEmpty({ group }),
        isRequiredCase: (name) => ports.queries.requiredCase({ name }),
      },
      {
        report: (code) => ports.effects.Report({ code }),
      },
    );
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    const check = current();
    switch (command.name) {
      case "Begin":
        check.begin({ states: command.input.states, init: command.input.init, commands: command.input.commands });
        return;
      case "ProseGroup":
        check.proseGroup(command.input.group, command.input.entries);
        return;
      case "EntryField":
        check.entryField(command.input.field, command.input.kind, command.input.present);
        return;
      case "BeginCommand":
        check.beginCommand(command.input.cases, command.input.hasOtherwise);
        return;
      case "BeginCase":
        check.beginCase(command.input.described, command.input.nothing);
        return;
      case "Written":
        check.written(command.input.field);
        return;
      case "EndCase":
        check.endCase();
        return;
      case "Calculation":
        check.calculation(command.input.hasMeaning);
        return;
      case "Invariant":
        check.invariant(command.input.hasMeaning);
        return;
      case "Sentence":
        check.sentence(command.input.composite, command.input.hasMeaning);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // LeafCheck has no states of its own: it is always in the specification's single state READY.
    current();
    return "READY";
  },
};
