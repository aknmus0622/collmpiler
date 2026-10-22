import type { Command, Ports, TargetSystemAdapter } from "./mutation-verdict.adapter.contract.ts";
import { MutationVerdict, type MutationRuns } from "../src/mutation-verdict.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: MutationVerdict | undefined;

function runsFor(ports: Ports): MutationRuns {
  return {
    runTrials(extra) {
      ports.runs.RunTrials({ extra });
    },
    report(severity, verdict) {
      ports.runs.Report({ severity, verdict });
    },
  };
}

function current(): MutationVerdict {
  if (!system) throw new Error("setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new MutationVerdict(runsFor(ports));
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    switch (command.name) {
      case "Begin":
        current().begin(command.input.kind);
        return;
      case "Tried":
        current().tried({
          changed: command.input.changed,
          enablementDiffers: command.input.enablementDiffers,
        });
        return;
    }
  },
};
