import type { TargetSystemAdapter, Ports } from "./store.adapter.contract.ts";
import { Store } from "../src/store.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let ports: Ports | undefined;
let store: Store | undefined;

function current(): Store {
  if (store === undefined) throw new Error("adapter: no system is set up");
  return store;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(p) {
    ports = p;
    store = Store.open(p.storage);
  },
  async teardownIsolation() {
    const old = store;
    store = undefined;
    ports = undefined;
    old?.close();
  },
  async executeCommand(command) {
    switch (command.name) {
      case "Put":
        current().put(command.input.key, command.input.data);
        return;
      case "Delete":
        return current().delete(command.input.key);
    }
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Entries":
        return current().entries();
    }
  },
  async restartSystem() {
    if (ports === undefined) throw new Error("adapter: no system is set up");
    const old = store;
    store = undefined;
    old?.close();
    store = Store.open(ports.storage);
  },
};
