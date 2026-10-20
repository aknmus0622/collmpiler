import type { StateName, TargetSystemAdapter } from "./outcome-apply.adapter.contract.ts";
import { OutcomeApply } from "../src/outcome-apply/outcome-apply.ts";
import type { AnyValue, OutcomeApplyState } from "../src/outcome-apply/types.ts";

// Import the production code from ../src/ and forward each call to it. No business logic here.

const STATE_NAMES: Record<OutcomeApplyState, StateName> = {
  ready: "READY",
};

let system: OutcomeApply | undefined;

function current(): OutcomeApply {
  if (!system) throw new Error("the system is not set up");
  return system;
}

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    system = new OutcomeApply({
      fail: (code) => ports.effects.Fail({ code }),
    });
  },
  async teardownIsolation() {
    system = undefined;
  },
  async executeCommand(command) {
    const s = current();
    switch (command.name) {
      case "Begin":
        return s.begin(command.input.state);
      case "Call":
        return s.call(command.input.keyed, command.input.found);
      case "Effect":
        return s.effect(
          command.input.guard,
          command.input.chosen,
          command.input.guardValue as AnyValue,
          command.input.declared,
        );
      case "GoTo":
        return s.goTo(command.input.target, command.input.declared);
      case "Set":
        return s.set(command.input.declared);
      case "Fits":
        return s.fits(command.input.fits);
      case "Responds":
        return s.responds(command.input.given);
      case "RespondField":
        return s.respondField(
          command.input.isNull,
          command.input.optional,
          command.input.anyValue,
          command.input.fits,
        );
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
    }
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
