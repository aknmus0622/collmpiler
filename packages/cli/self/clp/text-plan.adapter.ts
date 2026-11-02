import type { TargetSystemAdapter } from "./text-plan.adapter.contract.ts";
import { decideNotes, decideSections, writeType } from "../src/text-plan.ts";

// `text-plan` is stateless and has no dependencies, so there is nothing to build, connect or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`text-plan has no commands: ${JSON.stringify(command)}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Notes":
        return decideNotes(query.input);
      case "Sections":
        return decideSections(query.input);
      case "TypeText":
        return writeType(query.input);
    }
  },
};
