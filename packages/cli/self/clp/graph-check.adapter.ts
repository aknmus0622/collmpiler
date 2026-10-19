import type { Command, Ports, StateName, TargetSystemAdapter } from "./graph-check.adapter.contract.ts";
import { GraphCheck } from "../src/graph-check/graph-check.ts";
import type { GraphCheckState } from "../src/graph-check/types.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

const STATE_NAMES: Record<GraphCheckState, StateName> = {
  idle: "IDLE",
  reaching: "REACHING",
  judging: "JUDGING",
};

let system: GraphCheck | undefined;

function current(): GraphCheck {
  if (system === undefined) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    system = new GraphCheck(
      { declaresState: (state) => ports.queries.stateDeclared({ name: state }) },
      {
        report: (finding) =>
          ports.effects.Report({ code: finding.code, severity: finding.severity, subject: finding.subject }),
      },
      {
        runRound: () => ports.effects.RunRound({}),
        reachingDone: () => ports.effects.ReachingDone({}),
      },
    );
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    const check = current();
    switch (command.name) {
      case "Begin":
        return check.begin(command.input.init, command.input.strict, command.input.finalsDeclared);
      case "Edge":
        return check.edge(command.input.from, command.input.to);
      case "RoundEnd":
        return check.roundEnd();
      case "CheckState":
        return check.checkState(command.input.name);
      case "BeginCommand":
        return check.beginCommand(command.input.name);
      case "From":
        return check.from(command.input.state);
      case "EndCommand":
        return check.endCommand();
      case "BeginExits":
        return check.beginExits(command.input.state, command.input.final);
      case "Exit":
        return check.exit(command.input.from, command.input.to);
      case "EndExits":
        return check.endExits();
      case "Vocabulary":
        return check.vocabulary({
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
    const state = current().state;
    const name = STATE_NAMES[state];
    if (name === undefined) throw new Error(`adapter: unknown production state ${JSON.stringify(state)}`);
    return name;
  },
};
