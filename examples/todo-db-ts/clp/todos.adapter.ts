import type { Ports, TargetSystemAdapter } from "./todos.adapter.contract.ts";
import { Store } from "../src/store.ts";
import { Todos } from "../src/todos.ts";
import type { IdSource } from "../src/todos.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let ports: Ports | undefined;
let store: Store | undefined;
let todos: Todos | undefined;

function start(p: Ports): void {
  const ids: IdSource = { newId: () => p.ids.NewId() };
  store = Store.open(p.storage);
  todos = new Todos(store, ids);
}

function stop(): void {
  store?.close();
  store = undefined;
  todos = undefined;
}

function system(): { store: Store; todos: Todos } {
  if (!store || !todos) throw new Error("adapter: the system is not set up");
  return { store, todos };
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(p) {
    stop();
    ports = p;
    start(p);
  },
  async teardownIsolation() {
    stop();
    ports = undefined;
  },
  async executeCommand(command) {
    const { todos } = system();
    switch (command.name) {
      case "Add":
        return todos.add(command.input.title);
      case "Complete":
        return todos.complete(command.input.id);
      case "Remove":
        return todos.remove(command.input.id);
    }
  },
  async executeQuery(query) {
    const { store, todos } = system();
    switch (query.name) {
      case "List":
        return todos.list(query.input.only);
      case "store.Entries":
        return store.entries();
    }
  },
  async restartSystem() {
    if (!ports) throw new Error("adapter: the system is not set up");
    stop();
    start(ports);
  },
};
