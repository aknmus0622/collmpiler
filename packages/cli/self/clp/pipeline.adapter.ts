import type { Command, StateName, TargetSystemAdapter } from "./pipeline.adapter.contract.ts";
import { Pipeline } from "../src/pipeline/pipeline.ts";
import type { PipelineState } from "../src/pipeline/types.ts";

const STATE_NAMES: Record<PipelineState, StateName> = {
  idle: "IDLE",
  design: "DESIGN",
  wiring: "WIRING",
  grading: "GRADING",
  implementation: "IMPLEMENTATION",
  done: "DONE",
  failed: "FAILED",
};

let pipeline: Pipeline | undefined = undefined;

function current(): Pipeline {
  if (pipeline === undefined) throw new Error("the adapter has no system: setupIsolation was not called");
  return pipeline;
}

function execute(target: Pipeline, command: Command): void {
  switch (command.name) {
    case "Start":
      return target.start({ attemptsPerPhase: command.input.attemptsPerPhase, rounds: command.input.rounds });
    case "DesignChecked":
      return target.designChecked(command.input.passed);
    case "WiringChecked":
      return target.wiringChecked(command.input.passed);
    case "CurrentCodeGraded":
      return target.currentCodeGraded(command.input.passed);
    case "ImplementationChecked":
      return target.implementationChecked(command.input.passed);
    default: {
      const unknown: never = command;
      throw new Error(`the adapter does not know the command ${JSON.stringify(unknown)}`);
    }
  }
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    pipeline = new Pipeline(
      {
        hasProductionCode: () => ports.queries.hasProductionCode(),
        boundaryChanged: () => ports.queries.boundaryChanged(),
        hasAdapter: () => ports.queries.hasAdapter(),
        discardCode: () => ports.effects.DiscardCode({}),
      },
      { startSession: (phase, round, attempt) => ports.effects.StartSession({ attempt, phase, round }) },
      { gradeCurrentCode: (round) => ports.effects.GradeCurrentCode({ round }) },
    );
  },
  async teardownIsolation() {
    pipeline = undefined;
  },
  async executeCommand(command) {
    execute(current(), command);
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
