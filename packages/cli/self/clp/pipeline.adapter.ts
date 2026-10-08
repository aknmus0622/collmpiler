import type { Command, TargetSystemAdapter } from "./pipeline.adapter.contract.ts";
import { Pipeline } from "../src/pipeline.ts";
import type { PipelineDependencies } from "../src/ports.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let pipeline: Pipeline | null = null;

function current(): Pipeline {
  if (pipeline === null) {
    throw new Error("adapter used outside a trial: setupIsolation has not been called");
  }
  return pipeline;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    const dependencies: PipelineDependencies = {
      workspace: {
        hasProductionCode: () => ports.queries.hasProductionCode(),
        boundaryChangedSincePreviousRun: () => ports.queries.boundaryChanged(),
        hasAdapter: () => ports.queries.hasAdapter(),
        discardCode: () => ports.effects.DiscardCode({}),
      },
      sessions: {
        startSession: (session) =>
          ports.effects.StartSession({
            attempt: session.attempt,
            phase: session.phase,
            round: session.round,
          }),
      },
      grader: {
        gradeCurrentCode: (round) => ports.effects.GradeCurrentCode({ round }),
      },
    };
    pipeline = new Pipeline(dependencies);
  },
  async teardownIsolation() {
    pipeline = null;
  },
  async executeCommand(command: Command) {
    const target = current();
    switch (command.name) {
      case "Start":
        target.start({
          rounds: command.input.rounds,
          attemptsPerPhase: command.input.attemptsPerPhase,
        });
        return;
      case "DesignChecked":
        target.designChecked(command.input.passed);
        return;
      case "WiringChecked":
        target.wiringChecked(command.input.passed);
        return;
      case "ImplementationChecked":
        target.implementationChecked(command.input.passed);
        return;
      case "CurrentCodeGraded":
        target.currentCodeGraded(command.input.passed);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    // The production state names are exactly the contract's StateName values.
    return current().state;
  },
};
