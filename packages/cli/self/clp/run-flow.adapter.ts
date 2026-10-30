import type { TargetSystemAdapter } from "./run-flow.adapter.contract.ts";
import { RunFlow } from "../src/run-flow.ts";

let flow: RunFlow | undefined;

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    const driver = ports["run-driver"];
    flow = new RunFlow({
      checkLayer1: () => driver.CheckLayer1({}),
      nextCandidate: () => driver.NextCandidate({}),
      propose: () => driver.Propose({}),
      askSplit: () => driver.AskSplit({}),
      writeSplit: () => driver.WriteSplit({}),
      decline: () => driver.Decline({}),
      startInterpreting: () => driver.StartInterpreting({}),
      interpret: () => driver.Interpret({}),
      readQuestions: () => driver.ReadQuestions({}),
      nextQuestion: () => driver.NextQuestion({}),
      askQuestion: () => driver.AskQuestion({}),
      markReviewed: () => driver.MarkReviewed({}),
      placeSupplements: () => driver.PlaceSupplements({}),
      confirmSupplements: () => driver.ConfirmSupplements({}),
      writeSupplements: () => driver.WriteSupplements({}),
      questionsDone: () => driver.QuestionsDone({}),
      accept: () => driver.Accept({}),
      apply: () => driver.Apply({}),
      finish: (reason) => driver.Finish({ reason }),
    });
  },
  async teardownIsolation() {
    flow = undefined;
  },
  async executeCommand(command) {
    const system = flow!;
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
  },
};
