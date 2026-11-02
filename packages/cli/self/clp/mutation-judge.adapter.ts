import type { TargetSystemAdapter } from "./mutation-judge.adapter.contract.ts";
import { MutationJudge } from "../src/mutation-judge.ts";

let judge: MutationJudge | undefined;

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    judge = new MutationJudge({
      inAdapter: () => ports.verdict.InAdapter({}),
      ineffective: () => ports.verdict.Ineffective({}),
      survived: () => ports.verdict.Survived({}),
    });
  },
  async teardownIsolation() {
    judge = undefined;
  },
  async executeCommand(command) {
    if (judge === undefined) throw new Error("the system is not set up");
    switch (command.name) {
      case "BeginValue":
        judge.beginValue(command.input);
        return;
      case "EndValue":
        judge.endValue();
        return;
      case "Finish":
        judge.finish(command.input.shared);
        return;
      case "Mutant":
        judge.mutant(command.input.killed);
        return;
      case "Site":
        judge.site(command.input.killed);
        return;
    }
  },
};
