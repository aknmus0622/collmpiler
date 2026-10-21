import type { Ports, StateName, TargetSystemAdapter } from "./type-check.adapter.contract.ts";
import { TypeCheck } from "../src/type-check.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: TypeCheck | undefined;

function current(): TypeCheck {
  if (!system) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    system = new TypeCheck({
      report(code, owner) {
        ports.effects.Report({ code, owner });
      },
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
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
        check.claim(command.input.name, command.input.owner, command.input.shared);
        return;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // TypeCheck has no states of its own: it is always in the specification's single state READY.
    current();
    return "READY";
  },
};
