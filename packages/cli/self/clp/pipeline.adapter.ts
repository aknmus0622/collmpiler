import type { TargetSystemAdapter } from "./pipeline.adapter.contract.ts";
import { Pipeline } from "../src/pipeline.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let pipeline: Pipeline | undefined;

function current(): Pipeline {
  if (!pipeline) throw new Error("adapter: setupIsolation was not called");
  return pipeline;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    pipeline = new Pipeline(
      {
        hasProductionCode: () => ports.queries.hasProductionCode(),
        boundaryChanged: () => ports.queries.boundaryChanged(),
        hasAdapter: () => ports.queries.hasAdapter(),
      },
      {
        startSession: (start) =>
          ports.effects.StartSession({ attempt: start.attempt, phase: start.phase, round: start.round }),
        gradeCurrentCode: (round) => ports.effects.GradeCurrentCode({ round }),
        discardCode: () => ports.effects.DiscardCode({}),
      },
    );
  },
  async teardownIsolation() {
    pipeline = undefined;
  },
  async executeCommand(command) {
    const p = current();
    switch (command.name) {
      case "Start":
        p.start({ attemptsPerPhase: command.input.attemptsPerPhase, rounds: command.input.rounds });
        return;
      case "DesignChecked":
        p.designChecked(command.input.passed);
        return;
      case "WiringChecked":
        p.wiringChecked(command.input.passed);
        return;
      case "ImplementationChecked":
        p.implementationChecked(command.input.passed);
        return;
      case "CurrentCodeGraded":
        p.currentCodeGraded(command.input.passed);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return current().state;
  },
};
