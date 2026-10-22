import type { Ports, TargetSystemAdapter } from "./mutation-judge.adapter.contract.ts";
import { MutationJudge, type MutationVerdictSink } from "../src/mutation-judge.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let judge: MutationJudge | undefined;

function verdictFor(ports: Ports): MutationVerdictSink {
  return {
    inAdapter: () => ports.verdict.InAdapter({}),
    ineffective: () => ports.verdict.Ineffective({}),
    survived: () => ports.verdict.Survived({}),
  };
}

function system(): MutationJudge {
  if (!judge) throw new Error("setupIsolation was not called");
  return judge;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    judge = new MutationJudge(verdictFor(ports));
  },
  async teardownIsolation() {
    judge = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "BeginValue":
        system().beginValue({ numeric: command.input.numeric, inAdapter: command.input.inAdapter });
        return;
      case "EndValue":
        system().endValue();
        return;
      case "Finish":
        system().finish(command.input.shared);
        return;
      case "Mutant":
        system().mutant(command.input.killed);
        return;
      case "Site":
        system().site(command.input.killed);
        return;
    }
  },
};
