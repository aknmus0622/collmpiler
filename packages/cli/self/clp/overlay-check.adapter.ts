import type { TargetSystemAdapter } from "./overlay-check.adapter.contract.ts";
import { overlayCheck } from "../src/overlay-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
// The overlay check is stateless and has no dependencies: there is no system to build or discard.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {},
  async teardownIsolation() {},
  async executeCommand(command) {
    throw new Error(`unknown command: ${(command as { name: string }).name}`);
  },
  async executeQuery(query) {
    switch (query.name) {
      case "Entry":
        return overlayCheck({
          existing: query.input.existing,
          sameHeading: query.input.sameHeading,
          closedHeading: query.input.closedHeading,
          layer1Only: query.input.layer1Only,
        });
      default:
        throw new Error(`unknown query: ${(query as { name: string }).name}`);
    }
  },
};
