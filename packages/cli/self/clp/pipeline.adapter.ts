import type { Command, Ports, Query, QueryOutput, TargetSystemAdapter } from "./pipeline.adapter.contract.ts";
import { Pipeline } from "../src/pipeline.ts";
import type { OutputDirectory, PipelineDriver } from "../src/pipeline.ts";

let system: Pipeline | undefined;

function connectOutput(ports: Ports): OutputDirectory {
  const output = ports.output;
  return {
    boundaryChanged: () => output.BoundaryChanged(),
    hasAdapter: () => output.HasAdapter(),
    hasProductionCode: () => output.HasProductionCode(),
  };
}

function connectDriver(ports: Ports): PipelineDriver {
  const driver = ports["pipeline-driver"];
  return {
    discardCode: () => driver.DiscardCode({}),
    gradeCurrentCode: (round) => driver.GradeCurrentCode({ round }),
    startSession: ({ attempt, phase, round }) => driver.StartSession({ attempt, phase, round }),
  };
}

function running(): Pipeline {
  if (system === undefined) {
    throw new Error("adapter: no system; setupIsolation has not been called");
  }
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports): Promise<void> {
    system = new Pipeline(connectOutput(ports), connectDriver(ports));
  },
  async teardownIsolation(): Promise<void> {
    system = undefined;
  },
  async executeCommand(command: Command): Promise<void> {
    const pipeline = running();
    switch (command.name) {
      case "Start":
        pipeline.start({
          attemptsPerPhase: command.input.attemptsPerPhase,
          rounds: command.input.rounds,
        });
        return;
      case "DesignChecked":
        pipeline.designChecked(command.input.passed);
        return;
      case "WiringChecked":
        pipeline.wiringChecked(command.input.passed);
        return;
      case "ImplementationChecked":
        pipeline.implementationChecked(command.input.passed);
        return;
      case "CurrentCodeGraded":
        pipeline.currentCodeGraded(command.input.passed);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    const pipeline = running();
    switch (query.name) {
      case "Status":
        return pipeline.status();
      default: {
        const unknown: never = query.name;
        throw new Error(`adapter: unknown query ${JSON.stringify(unknown)}`);
      }
    }
  },
};
