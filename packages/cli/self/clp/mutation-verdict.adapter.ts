import type { StateName, TargetSystemAdapter } from "./mutation-verdict.adapter.contract.ts";
import { MutationVerdict } from "../src/mutation-verdict/mutation-verdict.ts";
import type { MutationVerdictState } from "../src/mutation-verdict/types.ts";

const STATE_NAMES: Record<MutationVerdictState, StateName> = {
  idle: "IDLE",
  trying: "TRYING",
};

let system: MutationVerdict | undefined;

function current(): MutationVerdict {
  if (system === undefined) throw new Error("setupIsolation has not been called");
  return system;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new MutationVerdict(
      { runTrials: (extra) => ports.effects.RunTrials({ extra }) },
      { report: (report) => ports.effects.Report({ severity: report.severity, verdict: report.verdict }) },
    );
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Begin":
        current().begin(command.input.kind);
        return;
      case "Tried":
        current().tried({ changed: command.input.changed, enablementDiffers: command.input.enablementDiffers });
        return;
    }
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
