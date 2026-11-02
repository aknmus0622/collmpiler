import type { TargetSystemAdapter } from "./syntax-check.adapter.contract.ts";
import { checkWord } from "../src/syntax-check.ts";

// The production code is a stateless function with no dependencies: there is nothing to build, connect or
// discard, and the contract defines no commands.
export const adapter: TargetSystemAdapter = {
  async setupIsolation() {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Word":
        return checkWord(query.input.word);
    }
  },
};
