import type { Command, Ports, StateName, TargetSystemAdapter } from "./interpret-flow.adapter.contract.ts";
import { InterpretFlow } from "../src/interpret-flow/interpret-flow.ts";
import type { InterpretFlowState } from "../src/interpret-flow/types.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

const stateNames: Record<InterpretFlowState, StateName> = {
  idle: "IDLE",
  choosing: "CHOOSING",
  checking: "CHECKING",
  sessions: "SESSIONS",
  done: "DONE",
  accepting: "ACCEPTING",
  verifying: "VERIFYING",
  accepted: "ACCEPTED",
};

let flow: InterpretFlow | undefined;

function build(ports: Ports): InterpretFlow {
  const { effects } = ports;
  return new InterpretFlow(
    {
      considerNext: () => effects.ConsiderNext({}),
      nextToAccept: () => effects.NextToAccept({}),
      retryRefused: () => effects.RetryRefused({}),
    },
    {
      checkCurrent: () => effects.CheckCurrent({}),
      checkDraft: () => effects.CheckDraft({}),
    },
    {
      startSession: (session, attempt, mode) => effects.StartSession({ attempt, mode, session }),
      compare: (session) => effects.Compare({ session }),
      recordUncompared: (session) => effects.RecordUncompared({ session }),
    },
    {
      accept: () => effects.Accept({}),
      refuse: (reason) => effects.RefuseAccepting({ reason }),
    },
    {
      finish: (status) => effects.Finish({ status }),
      acceptingDone: () => effects.AcceptingDone({}),
    },
  );
}

function current(): InterpretFlow {
  if (flow === undefined) throw new Error("the system is not set up");
  return flow;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    flow = build(ports);
  },
  async teardownIsolation() {
    flow = undefined;
  },
  async executeCommand(command: Command) {
    const f = current();
    switch (command.name) {
      case "Start":
        f.start({ sessions: command.input.sessions, attemptsPerSession: command.input.maxAttempts });
        return;
      case "Consider":
        f.consider(command.input.hasCurrent);
        return;
      case "NoMoreComponents":
        f.noMoreComponents();
        return;
      case "CurrentChecked":
        f.currentChecked(command.input.passed);
        return;
      case "SessionChecked":
        f.sessionChecked(command.input.outcome, command.input.hasModel);
        return;
      case "Compared":
        f.compared(command.input.ok);
        return;
      case "StartAccepting":
        f.startAccepting();
        return;
      case "ConsiderAccepting":
        f.considerAccepting({
          hasDraft: command.input.hasDraft,
          hasInterpretation: command.input.hasInterpretation,
          openReviews: command.input.openReviews,
          stampCurrent: command.input.stampCurrent,
        });
        return;
      case "DraftChecked":
        f.draftChecked(command.input.passed);
        return;
      case "EndRound":
        f.endRound();
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    const state = current().state;
    const name = stateNames[state];
    if (name === undefined) throw new Error(`unknown state: ${String(state)}`);
    return name;
  },
};
