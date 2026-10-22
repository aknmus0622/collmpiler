import type { Command, Ports, TargetSystemAdapter } from "./interpret-flow.adapter.contract.ts";
import { InterpretFlow, type InterpretDriver } from "../src/interpret-flow.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

function driverFor(ports: Ports): InterpretDriver {
  const driver = ports["interpret-driver"];
  return {
    accept: () => driver.Accept({}),
    acceptingDone: () => driver.AcceptingDone({}),
    checkCurrent: () => driver.CheckCurrent({}),
    checkDraft: () => driver.CheckDraft({}),
    compare: (session) => driver.Compare({ session }),
    considerNext: () => driver.ConsiderNext({}),
    finish: (status) => driver.Finish({ status }),
    nextToAccept: () => driver.NextToAccept({}),
    recordUncompared: (session) => driver.RecordUncompared({ session }),
    refuseAccepting: (reason) => driver.RefuseAccepting({ reason }),
    retryRefused: () => driver.RetryRefused({}),
    startSession: (session, attempt, mode) => driver.StartSession({ attempt, mode, session }),
  };
}

let flow: InterpretFlow | undefined;

function system(): InterpretFlow {
  if (!flow) throw new Error("the system is not set up");
  return flow;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    flow = new InterpretFlow(driverFor(ports));
  },
  async teardownIsolation() {
    flow = undefined;
  },
  async executeCommand(command: Command) {
    const f = system();
    switch (command.name) {
      case "Compared":
        return f.compared(command.input.ok);
      case "Consider":
        return f.consider(command.input.hasCurrent);
      case "ConsiderAccepting":
        return f.considerAccepting({
          hasDraft: command.input.hasDraft,
          hasInterpretation: command.input.hasInterpretation,
          openReviews: command.input.openReviews,
          stampCurrent: command.input.stampCurrent,
        });
      case "CurrentChecked":
        return f.currentChecked(command.input.passed);
      case "DraftChecked":
        return f.draftChecked(command.input.passed);
      case "EndRound":
        return f.endRound();
      case "NoMoreComponents":
        return f.noMoreComponents();
      case "SessionChecked":
        return f.sessionChecked({ hasModel: command.input.hasModel, outcome: command.input.outcome });
      case "Start":
        return f.start({ maxAttempts: command.input.maxAttempts, sessions: command.input.sessions });
      case "StartAccepting":
        return f.startAccepting();
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
};
