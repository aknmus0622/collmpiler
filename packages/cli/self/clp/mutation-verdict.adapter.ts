import type { Command, Ports, TargetSystemAdapter } from "./mutation-verdict.adapter.contract.ts";
import { MutationVerdict } from "../src/mutation-verdict.ts";
import type { MutationFinding, MutationRuns, MutationSeverity } from "../src/mutation-verdict.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: MutationVerdict | undefined;

function runsOn(ports: Ports): MutationRuns {
  return {
    runTrials(extra: number): void {
      ports.runs.RunTrials({ extra });
    },
    report(severity: MutationSeverity, verdict: MutationFinding): void {
      ports.runs.Report({ severity, verdict });
    },
  };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new MutationVerdict(runsOn(ports));
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    if (system === undefined) {
      throw new Error("executeCommand called without setupIsolation");
    }
    switch (command.name) {
      case "Begin":
        system.begin(command.input.kind);
        return;
      case "Tried":
        system.tried({
          changed: command.input.changed,
          enablementDiffers: command.input.enablementDiffers,
        });
        return;
    }
  },
};
