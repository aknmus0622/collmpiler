import type { Ports, StateName, TargetSystemAdapter } from "./mutation-judge.adapter.contract.ts";
import { MutationJudge, type MutationJudgeListener } from "../src/mutation-judge.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let judge: MutationJudge | undefined;

function listenerFor(ports: Ports): MutationJudgeListener {
  return {
    survived: () => ports.effects.Survived({}),
    inAdapter: () => ports.effects.InAdapter({}),
    ineffective: () => ports.effects.Ineffective({}),
  };
}

function current(): MutationJudge {
  if (!judge) throw new Error("setupIsolation has not been called");
  return judge;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    judge = new MutationJudge(listenerFor(ports));
  },
  async teardownIsolation() {
    judge = undefined;
  },
  async executeCommand(command) {
    const j = current();
    switch (command.name) {
      case "BeginValue":
        j.beginValue({ numeric: command.input.numeric, inAdapter: command.input.inAdapter });
        return;
      case "Site":
        j.site(command.input.killed);
        return;
      case "EndValue":
        j.endValue();
        return;
      case "Mutant":
        j.mutant(command.input.killed);
        return;
      case "Finish":
        j.finish(command.input.shared);
        return;
    }
  },
  async getCurrentState(): Promise<StateName> {
    // Production state names are identical to the spec's.
    return current().state;
  },
};
