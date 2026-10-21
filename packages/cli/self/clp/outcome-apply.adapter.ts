import type { Command, CommandOutput, Ports, StateName, TargetSystemAdapter } from "./outcome-apply.adapter.contract.ts";
import { OutcomeApply } from "../src/outcome-apply.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.
let system: OutcomeApply | null = null;

function current(): OutcomeApply {
  if (system === null) throw new Error("adapter: setupIsolation has not been called");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    system = new OutcomeApply({
      fail: (code) => ports.effects.Fail({ code }),
    });
  },
  async teardownIsolation() {
    system = null;
  },
  async executeCommand(command: Command): Promise<CommandOutput[keyof CommandOutput] | void> {
    const s = current();
    switch (command.name) {
      case "Begin":
        return s.begin(command.input.state);
      case "Call":
        return s.call(command.input.keyed, command.input.found);
      case "Effect":
        return s.effect({
          declared: command.input.declared,
          guard: command.input.guard,
          chosen: command.input.chosen,
          guardValue: command.input.guardValue,
        });
      case "GoTo":
        return s.goTo(command.input.target, command.input.declared);
      case "Set":
        return s.set(command.input.declared);
      case "Responds":
        return s.responds(command.input.given);
      case "RespondField":
        return s.respondField({
          isNull: command.input.isNull,
          optional: command.input.optional,
          anyValue: command.input.anyValue,
          fits: command.input.fits,
        });
      case "Fits":
        return s.fits(command.input.fits);
      case "Add":
        return s.add(command.input.many);
      case "AddField":
        return s.addField(command.input.declared);
      case "Key":
        return s.key(command.input.exists);
      case "Remove":
        return s.remove(command.input.many);
      case "End":
        return s.end();
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production code has no states of its own: it is always in the single spec state READY.
    current();
    return "READY";
  },
};
