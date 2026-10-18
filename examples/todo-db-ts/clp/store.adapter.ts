import type { Ports, StateName, TargetSystemAdapter } from "./store.adapter.contract.ts";
import { Store, type JsonValue } from "../src/store.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let ports: Ports | undefined;
let store: Store | undefined;

function currentStore(): Store {
  if (store === undefined) throw new Error("adapter: the system is not set up");
  return store;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(p) {
    ports = p;
    store = undefined;
    store = Store.open(p.storage);
  },
  async teardownIsolation() {
    const s = store;
    store = undefined;
    ports = undefined;
    s?.close();
  },
  async executeCommand(command) {
    const s = currentStore();
    switch (command.name) {
      case "Put":
        s.put(command.input.key, command.input.value as JsonValue);
        return;
      case "Delete":
        return s.delete(command.input.key);
      case "Entries":
        return s.entries();
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production store has a single state, documented as specification state `READY`.
    currentStore();
    return "READY";
  },
  async restartSystem() {
    if (ports === undefined) throw new Error("adapter: the system is not set up");
    const old = store;
    store = undefined;
    old?.close();
    store = Store.open(ports.storage);
  },
};
