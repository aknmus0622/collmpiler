import type { TargetSystemAdapter } from "./graph-check.adapter.contract.ts";
import { GraphCheck } from "../src/graph-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: GraphCheck | undefined;

function current(): GraphCheck {
  if (!system) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new GraphCheck(
      { isDeclared: (name) => ports.queries.stateDeclared({ name }) },
      {
        runRound: () => ports.effects.RunRound({}),
        reachingDone: () => ports.effects.ReachingDone({}),
        report: (finding) =>
          ports.effects.Report({ code: finding.code, severity: finding.severity, subject: finding.subject }),
      },
    );
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "Begin":
        return s.begin({
          init: command.input.init,
          strict: command.input.strict,
          finalsDeclared: command.input.finalsDeclared,
        });
      case "Edge":
        return s.edge(command.input.from, command.input.to);
      case "RoundEnd":
        return s.roundEnd();
      case "CheckState":
        return s.checkState(command.input.name);
      case "BeginCommand":
        return s.beginCommand(command.input.name);
      case "From":
        return s.from(command.input.state);
      case "EndCommand":
        return s.endCommand();
      case "BeginExits":
        return s.beginExits(command.input.state, command.input.final);
      case "Exit":
        return s.exit(command.input.from, command.input.to);
      case "EndExits":
        return s.endExits();
      case "Vocabulary":
        return s.vocabulary({
          group: command.input.group,
          name: command.input.name,
          used: command.input.used,
          listed: command.input.listed,
          takesInput: command.input.takesInput,
        });
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return current().state;
  },
};
