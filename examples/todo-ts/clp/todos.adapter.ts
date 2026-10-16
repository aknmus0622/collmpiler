import type { TargetSystemAdapter } from "./todos.adapter.contract.ts";
import { TodoList } from "../src/index.ts";
import type { IdSource } from "../src/index.ts";

let list: TodoList | undefined;

function system(): TodoList {
  if (!list) throw new Error("adapter: setupIsolation was not called");
  return list;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    const ids: IdSource = { nextId: () => ports.queries.newId() };
    list = new TodoList(ids);
  },
  async teardownIsolation() {
    list = undefined;
  },
  async executeCommand(command) {
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
  async getCurrentState() {
    // The production list has no states of its own; it is always in the specification's READY state.
    system();
    return "READY";
  },
};
