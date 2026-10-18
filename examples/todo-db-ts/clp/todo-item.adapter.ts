import type { StateName, TargetSystemAdapter } from "./todo-item.adapter.contract.ts";
import { TodoItem } from "../src/todo-item.ts";
import type { TodoItemStatus } from "../src/todo-item.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

const STATE_NAMES: Record<TodoItemStatus, StateName> = {
  open: "OPEN",
  done: "DONE",
};

let item: TodoItem | undefined;

function currentItem(): TodoItem {
  if (item === undefined) {
    throw new Error("the system is not set up");
  }
  return item;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    // The item has no queries or effects; the contract's ports are empty. The specification's commands
    // take no title, so any title will do.
    item = new TodoItem("");
  },
  async teardownIsolation() {
    item = undefined;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Complete":
        return currentItem().complete();
      default: {
        const unknown: never = command.name;
        throw new Error(`unknown command: ${String(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    const status = currentItem().status;
    const name = STATE_NAMES[status];
    if (name === undefined) {
      throw new Error(`unknown production state: ${String(status)}`);
    }
    return name;
  },
};
