import type { Command, Ports, StateName, TargetSystemAdapter } from "./type-check.adapter.contract.ts";
import { TypeCheck } from "../src/type-check/type-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: TypeCheck | undefined;

function current(): TypeCheck {
  if (system === undefined) throw new Error("the system is not set up");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    system = new TypeCheck({
      report(finding) {
        ports.effects.Report({ code: finding.code, owner: finding.owner });
      },
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command: Command) {
    const check = current();
    switch (command.name) {
      case "Type":
        check.type(command.input);
        return;
      case "Around":
        check.around(command.input.value);
        return;
      case "BeginColumn":
        check.beginColumn();
        return;
      case "Cell":
        check.cell(command.input.kind);
        return;
      case "EndColumn":
        check.endColumn();
        return;
      case "Promise":
        check.promise(command.input);
        return;
      case "Failure":
        check.failure(command.input);
        return;
      case "BeginClaims":
        check.beginClaims();
        return;
      case "Claim":
        check.claim(command.input);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`unknown command: ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The type check has a single state (the specification's READY) and exposes none.
    current();
    return "READY";
  },
};
