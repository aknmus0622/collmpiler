import type { Command, Ports, StateName, TargetSystemAdapter } from "./tree-check.adapter.contract.ts";
import { TreeCheck } from "../src/tree-check.ts";
import type { ParentStates, TreeCheckListener, TreeGrammar } from "../src/tree-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: TreeCheck | null = null;

function current(): TreeCheck {
  if (system === null) throw new Error("setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    const grammar: TreeGrammar = {
      mayContain: (parentKind, slot) => ports.queries.allowed({ parent: parentKind, slot }),
      limitOf: (parentKind, slot) => ports.queries.limit({ parent: parentKind, slot }),
    };
    const states: ParentStates = {
      hasStateNamed: (name) => ports.queries.stateNamed({ name }),
    };
    const listener: TreeCheckListener = {
      report: (index, code) => ports.effects.Report({ code, index }),
      descend: (index) => ports.effects.Descend({ index }),
    };
    system = new TreeCheck(grammar, states, listener);
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command: Command) {
    const check = current();
    switch (command.name) {
      case "BeginParent":
        check.beginParent(command.input.kind);
        return;
      case "Child":
        check.child({
          index: command.input.index,
          slot: command.input.slot,
          named: command.input.named,
          identity: command.input.identity,
        });
        return;
      case "EndParent":
        check.endParent({
          isComponent: command.input.isComponent,
          hasInit: command.input.hasInit,
          init: command.input.init,
          initIndex: command.input.initIndex,
          stateCount: command.input.stateCount,
        });
        return;
      case "Stray":
        check.stray(command.input.index, command.input.form);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // TreeCheck has no states of its own; it is always in the specification's single state READY.
    current();
    return "READY";
  },
};
