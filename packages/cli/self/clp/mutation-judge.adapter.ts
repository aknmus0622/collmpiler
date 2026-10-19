import type { Command, Ports, StateName, TargetSystemAdapter } from "./mutation-judge.adapter.contract.ts";
import { MutationJudge } from "../src/mutation-judge/mutation-judge.ts";
import type { MutationGateFindings, MutationJudgeState } from "../src/mutation-judge/types.ts";

const STATE_NAMES: Record<MutationJudgeState, StateName> = {
  values: "VALUES",
  inValue: "IN_VALUE",
  mutants: "MUTANTS",
  done: "DONE",
};

let system: MutationJudge | undefined;

function current(): MutationJudge {
  if (!system) throw new Error("setupIsolation has not been called");
  return system;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    const findings: MutationGateFindings = {
      survived: () => ports.effects.Survived({}),
      inAdapter: () => ports.effects.InAdapter({}),
      ineffective: () => ports.effects.Ineffective({}),
    };
    system = new MutationJudge(findings);
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    const judge = current();
    switch (command.name) {
      case "BeginValue":
        judge.beginValue(command.input.numeric, command.input.inAdapter);
        return;
      case "Site":
        judge.site(command.input.killed);
        return;
      case "EndValue":
        judge.endValue();
        return;
      case "Mutant":
        judge.mutant(command.input.killed);
        return;
      case "Finish":
        judge.finish(command.input.shared);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    const state = current().state;
    const name = STATE_NAMES[state];
    if (!name) throw new Error(`unknown state: ${String(state)}`);
    return name;
  },
};
