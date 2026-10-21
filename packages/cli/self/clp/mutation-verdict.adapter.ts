import type { StateName, TargetSystemAdapter } from "./mutation-verdict.adapter.contract.ts";
import { MutationVerdict } from "../src/mutation-verdict.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: MutationVerdict | null = null;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new MutationVerdict({
      runTrials(extra) {
        ports.effects.RunTrials({ extra });
      },
      report(verdict, severity) {
        ports.effects.Report({ severity, verdict });
      },
    });
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Begin":
        system!.begin(command.input.kind);
        return;
      case "Tried":
        system!.tried({
          changed: command.input.changed,
          enablementDiffers: command.input.enablementDiffers,
        });
        return;
    }
  },
  async getCurrentState(): Promise<StateName> {
    return system!.state;
  },
};
