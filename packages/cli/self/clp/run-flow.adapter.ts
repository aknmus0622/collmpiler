import type { Command, Ports, TargetSystemAdapter } from "./run-flow.adapter.contract.ts";
import { RunFlow } from "../src/run-flow.ts";
import type { RunDriver } from "../src/run-flow.ts";

function driverFor(ports: Ports): RunDriver {
  const driver = ports["run-driver"];
  return {
    accept: () => driver.Accept({}),
    apply: () => driver.Apply({}),
    askQuestion: () => driver.AskQuestion({}),
    askSplit: () => driver.AskSplit({}),
    checkLayer1: () => driver.CheckLayer1({}),
    confirmSupplements: () => driver.ConfirmSupplements({}),
    decline: () => driver.Decline({}),
    finish: (reason) => driver.Finish({ reason }),
    interpret: () => driver.Interpret({}),
    markReviewed: () => driver.MarkReviewed({}),
    nextCandidate: () => driver.NextCandidate({}),
    nextQuestion: () => driver.NextQuestion({}),
    placeSupplements: () => driver.PlaceSupplements({}),
    propose: () => driver.Propose({}),
    questionsDone: () => driver.QuestionsDone({}),
    readQuestions: () => driver.ReadQuestions({}),
    startInterpreting: () => driver.StartInterpreting({}),
    writeSplit: () => driver.WriteSplit({}),
    writeSupplements: () => driver.WriteSupplements({}),
  };
}

let flow: RunFlow | undefined;

function dispatch(system: RunFlow, command: Command): void {
  switch (command.name) {
    case "Accepted":
      return system.accepted(command.input.ok);
    case "Applied":
      return system.applied(command.input.outcome);
    case "Candidate":
      return system.candidate();
    case "Interpreted":
      return system.interpreted(command.input.outcome);
    case "Layer1Checked":
      return system.layer1Checked(command.input.ok);
    case "NoMoreCandidates":
      return system.noMoreCandidates();
    case "NoMoreQuestions":
      return system.noMoreQuestions();
    case "Proposed":
      return system.proposed(command.input.outcome);
    case "Question":
      return system.question();
    case "QuestionAnswered":
      return system.questionAnswered(command.input.answer);
    case "SplitAnswered":
      return system.splitAnswered(command.input.answer);
    case "Start":
      return system.start(command.input.rounds, command.input.yes);
    case "SupplementsConfirmed":
      return system.supplementsConfirmed(command.input.yes);
    case "SupplementsPlaced":
      return system.supplementsPlaced(command.input.placed);
  }
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    flow = new RunFlow(driverFor(ports));
  },
  async teardownIsolation() {
    flow = undefined;
  },
  async executeCommand(command) {
    if (flow === undefined) {
      throw new Error("setupIsolation has not been called");
    }
    dispatch(flow, command);
  },
};
