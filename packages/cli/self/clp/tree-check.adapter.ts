import type { StateName, TargetSystemAdapter } from "./tree-check.adapter.contract.ts";
import { TreeCheck } from "../src/tree-check/tree-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: TreeCheck | undefined;

function current(): TreeCheck {
  if (!system) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new TreeCheck(
      {
        allowsSlot: (parent, slot) => ports.queries.allowed({ parent, slot }),
        slotLimit: (parent, slot) => ports.queries.limit({ parent, slot }),
      },
      {
        hasStateNamed: (name) => ports.queries.stateNamed({ name }),
      },
      {
        report: (finding) => ports.effects.Report({ code: finding.code, index: finding.index }),
      },
      {
        descend: (index) => ports.effects.Descend({ index }),
      },
    );
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const check = current();
    switch (command.name) {
      case "BeginParent":
        check.beginParent(command.input.kind);
        return;
      case "Child":
        check.child({ ...command.input });
        return;
      case "EndParent":
        check.endParent({ ...command.input });
        return;
      case "Stray":
        check.stray({ ...command.input });
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The tree check has a single state, the specification's READY; it exposes none.
    current();
    return "READY";
  },
};
