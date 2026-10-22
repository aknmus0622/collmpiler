import type { Ports, TargetSystemAdapter } from "./pipeline.adapter.contract.ts";
import { Pipeline, type OutputDirectory, type PipelineDriver } from "../src/pipeline.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let pipeline: Pipeline | undefined;

function system(): Pipeline {
  if (!pipeline) throw new Error("adapter: setupIsolation was not called");
  return pipeline;
}

function outputDirectory(ports: Ports): OutputDirectory {
  return {
    hasProductionCode: () => ports.output.HasProductionCode(),
    boundaryChanged: () => ports.output.BoundaryChanged(),
    hasAdapter: () => ports.output.HasAdapter(),
  };
}

function pipelineDriver(ports: Ports): PipelineDriver {
  return {
    startSession: (round, attempt, phase) => ports["pipeline-driver"].StartSession({ attempt, phase, round }),
    gradeCurrentCode: (round) => ports["pipeline-driver"].GradeCurrentCode({ round }),
    discardCode: () => ports["pipeline-driver"].DiscardCode({}),
  };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    pipeline = new Pipeline(outputDirectory(ports), pipelineDriver(ports));
  },
  async teardownIsolation() {
    pipeline = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Start":
        system().start({ attemptsPerPhase: command.input.attemptsPerPhase, rounds: command.input.rounds });
        return;
      case "DesignChecked":
        system().designChecked(command.input.passed);
        return;
      case "WiringChecked":
        system().wiringChecked(command.input.passed);
        return;
      case "ImplementationChecked":
        system().implementationChecked(command.input.passed);
        return;
      case "CurrentCodeGraded":
        system().currentCodeGraded(command.input.passed);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Status":
        return system().status();
      default: {
        const unknown: never = query.name;
        throw new Error(`adapter: unknown query ${JSON.stringify(unknown)}`);
      }
    }
  },
};
