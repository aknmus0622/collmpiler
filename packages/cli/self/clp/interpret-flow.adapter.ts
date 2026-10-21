import type { Ports, StateName, TargetSystemAdapter } from "./interpret-flow.adapter.contract.ts";
import { InterpretFlow, type InterpretFlowListener } from "../src/interpret-flow.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let flow: InterpretFlow | undefined;

function listenerFor(ports: Ports): InterpretFlowListener {
  const effects = ports.effects;
  return {
    considerNext: () => effects.ConsiderNext({}),
    checkCurrent: () => effects.CheckCurrent({}),
    startSession: (start) => effects.StartSession({ attempt: start.attempt, mode: start.mode, session: start.session }),
    compare: (session) => effects.Compare({ session }),
    recordUncompared: (session) => effects.RecordUncompared({ session }),
    finish: (status) => effects.Finish({ status }),
    nextToAccept: () => effects.NextToAccept({}),
    checkDraft: () => effects.CheckDraft({}),
    accept: () => effects.Accept({}),
    refuseAccepting: (reason) => effects.RefuseAccepting({ reason }),
    retryRefused: () => effects.RetryRefused({}),
    acceptingDone: () => effects.AcceptingDone({}),
  };
}

function system(): InterpretFlow {
  if (!flow) throw new Error("setupIsolation was not called");
  return flow;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    flow = new InterpretFlow(listenerFor(ports));
  },
  async teardownIsolation() {
    flow = undefined;
  },
  async executeCommand(command) {
    const f = system();
    switch (command.name) {
      case "Start":
        return f.start({ sessions: command.input.sessions, maxAttempts: command.input.maxAttempts });
      case "Consider":
        return f.consider(command.input.hasCurrent);
      case "NoMoreComponents":
        return f.noMoreComponents();
      case "CurrentChecked":
        return f.currentChecked(command.input.passed);
      case "SessionChecked":
        return f.sessionChecked({ outcome: command.input.outcome, hasModel: command.input.hasModel });
      case "Compared":
        return f.compared(command.input.ok);
      case "StartAccepting":
        return f.startAccepting();
      case "ConsiderAccepting":
        return f.considerAccepting({
          hasDraft: command.input.hasDraft,
          hasInterpretation: command.input.hasInterpretation,
          openReviews: command.input.openReviews,
          stampCurrent: command.input.stampCurrent,
        });
      case "DraftChecked":
        return f.draftChecked(command.input.passed);
      case "EndRound":
        return f.endRound();
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    return system().state;
  },
};
