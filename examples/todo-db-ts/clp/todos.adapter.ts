import type { Command, CommandOutput, Ports, StateName, TargetSystemAdapter } from "./todos.adapter.contract.ts";
import { Todos } from "../src/todos.ts";
import type { IdSource } from "../src/todos.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

let ports: Ports | undefined;
let todos: Todos | undefined;

function idsFor(ports: Ports): IdSource {
  return { newId: () => ports.queries.newId() };
}

function start(ports: Ports): Todos {
  return Todos.open(ports.storage, idsFor(ports));
}

function system(): Todos {
  if (todos === undefined) {
    throw new Error("adapter: no system; setupIsolation was not called");
  }
  return todos;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(p) {
    ports = p;
    todos = start(p);
  },
  async teardownIsolation() {
    const current = todos;
    todos = undefined;
    ports = undefined;
    current?.close();
  },
  async executeCommand(command: Command): Promise<CommandOutput[keyof CommandOutput] | void> {
    switch (command.name) {
      case "Add":
        return system().add(command.input.title);
      case "Complete":
        return system().complete(command.input.id);
      case "List":
        return system().list(command.input.only);
      case "Remove":
        return system().remove(command.input.id);
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production list has a single state (specification `READY`) and exposes no accessor for it.
    system();
    return "READY";
  },
  async restartSystem() {
    if (ports === undefined) {
      throw new Error("adapter: no system; setupIsolation was not called");
    }
    const old = todos;
    todos = undefined;
    old?.close();
    todos = start(ports);
  },
};
