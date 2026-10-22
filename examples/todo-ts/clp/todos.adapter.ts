import type { TargetSystemAdapter } from "./todos.adapter.contract.ts";
import type { IdSource } from "../src/id-source.ts";
import { TodoList } from "../src/todo-list.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: TodoList | null = null;

function current(): TodoList {
  if (system === null) throw new Error("adapter: setupIsolation was not called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    const ids: IdSource = { newId: () => ports.ids.NewId() };
    system = new TodoList(ids);
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Add":
        return current().add(command.input.title);
      case "Complete":
        return current().complete(command.input.id);
      case "Remove":
        return current().remove(command.input.id);
      default:
        throw new Error(`adapter: unknown command ${(command as { name: string }).name}`);
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "List":
        return current().list(query.input.only);
      default:
        throw new Error(`adapter: unknown query ${(query as { name: string }).name}`);
    }
  },
};
