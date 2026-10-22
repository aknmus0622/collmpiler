import type { Query, QueryOutput, TargetSystemAdapter } from "./sentence-trace.adapter.contract.ts";
import { checkEmbedded, checkKey, checkSentence, checkTarget } from "../src/sentence-trace.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The production component is stateless and has no dependencies, so there is no system instance to build.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${(command as { name?: unknown }).name}`);
  },
  async executeQuery(query: Query): Promise<QueryOutput[keyof QueryOutput]> {
    switch (query.name) {
      case "Embedded":
        return checkEmbedded(query.input);
      case "Key":
        return checkKey(query.input);
      case "Sentence":
        return checkSentence(query.input);
      case "Target":
        return checkTarget(query.input);
      default:
        throw new Error(`unknown query: ${(query as { name?: unknown }).name}`);
    }
  },
};
