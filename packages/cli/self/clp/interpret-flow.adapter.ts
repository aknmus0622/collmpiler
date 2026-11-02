import type { Command, Ports, TargetSystemAdapter } from "./interpret-flow.adapter.contract.ts";
import { InterpretFlow } from "../src/interpret-flow.ts";
import type { InterpretDriver } from "../src/interpret-flow.ts";

/** Forwards each driver method to the harness's stand-in of the same name. */
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
    startSession: ({ attempt, mode, session }) => driver.StartSession({ attempt, mode, session }),
  };
}

let flow: InterpretFlow | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    flow = new InterpretFlow(driverFor(ports));
  },
  async teardownIsolation() {
    flow = undefined;
  },
  async executeCommand(command: Command) {
    if (flow === undefined) {
      throw new Error("executeCommand called without setupIsolation");
    }
    switch (command.name) {
      case "Compared":
        return flow.compared(command.input.ok);
      case "Consider":
        return flow.consider(command.input.hasCurrent);
      case "ConsiderAccepting":
        return flow.considerAccepting(command.input);
      case "CurrentChecked":
        return flow.currentChecked(command.input.passed);
      case "DraftChecked":
        return flow.draftChecked(command.input.passed);
      case "EndRound":
        return flow.endRound();
      case "NoMoreComponents":
        return flow.noMoreComponents();
      case "SessionChecked":
        return flow.sessionChecked(command.input);
      case "Start":
        return flow.start(command.input);
      case "StartAccepting":
        return flow.startAccepting();
      default:
        throw new Error(`unknown command: ${JSON.stringify(command satisfies never)}`);
    }
  },
};
