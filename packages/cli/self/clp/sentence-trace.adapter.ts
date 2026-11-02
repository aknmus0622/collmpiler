import type { TargetSystemAdapter } from "./sentence-trace.adapter.contract.ts";
import {
  decideEmbedded,
  decideKey,
  decideSentence,
  decideTarget,
} from "../src/sentence-trace.ts";

// The production component is a set of stateless functions with no dependencies, so there is nothing to
// construct or discard, and the contract's `Ports` is empty.
export const adapter: TargetSystemAdapter = {
  async setupIsolation() {},
  async teardownIsolation() {},
  async executeCommand(command) {
    // The contract defines no commands (`Command` is `never`).
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Embedded":
        return decideEmbedded(query.input);
      case "Key":
        return decideKey(query.input.inDescription);
      case "Sentence":
        return decideSentence(query.input);
      case "Target":
        return decideTarget(query.input.exists);
    }
  },
};
