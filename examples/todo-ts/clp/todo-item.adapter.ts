import type { TargetSystemAdapter } from "./todo-item.adapter.contract.ts";
import { Todo } from "../src/todoItem.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

// The component has no dependencies, so `ports` has nothing to connect. The constructor needs a
// title; the specification's commands for this component never look at it.
const TITLE = "item";

let system: Todo | undefined;

function current(): Todo {
  if (system === undefined) {
    throw new Error("setupIsolation has not been called");
  }
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new Todo(TITLE);
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Complete":
        return current().complete();
    }
  },
  async getCurrentState() {
    return current().state;
  },
};
