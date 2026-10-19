import type { Ports, StateName, TargetSystemAdapter } from "./leaf-check.adapter.contract.ts";
import { LeafCheck } from "../src/leaf-check/leaf-check.ts";
import type { LeafFindingSink, LeafGrammar } from "../src/leaf-check/types.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: LeafCheck | undefined;

function current(): LeafCheck {
  if (system === undefined) throw new Error("the system is not set up");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    const grammar: LeafGrammar = {
      isRequired: (kind, field) => ports.queries.required({ field, kind }),
      isOutcome: (kind, field) => ports.queries.outcome({ field, kind }),
      requiresCase: (name) => ports.queries.requiredCase({ name }),
      mustHaveEntries: (group) => ports.queries.nonEmpty({ group }),
    };
    const findings: LeafFindingSink = {
      report: (finding) => ports.effects.Report({ code: finding.code }),
    };
    system = new LeafCheck(grammar, findings);
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const check = current();
    switch (command.name) {
      case "Begin":
        check.begin(command.input);
        return;
      case "BeginCommand":
        check.beginCommand(command.input);
        return;
      case "BeginCase":
        check.beginCase(command.input.described);
        return;
      case "Written":
        check.written(command.input.field);
        return;
      case "EndCase":
        check.endCase();
        return;
      case "EntryField":
        check.entryField(command.input);
        return;
      case "ProseGroup":
        check.proseGroup(command.input);
        return;
      case "Calculation":
        check.calculation(command.input.hasMeaning);
        return;
      case "Invariant":
        check.invariant(command.input.hasMeaning);
        return;
      case "Sentence":
        check.sentence(command.input);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${(unknown as { name: string }).name}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The leaf check has a single state (the specification's `READY`) and exposes none.
    current();
    return "READY";
  },
};
