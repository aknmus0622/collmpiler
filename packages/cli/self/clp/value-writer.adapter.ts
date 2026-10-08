import type { StateName, TargetSystemAdapter } from "./value-writer.adapter.contract.ts";
import type { ValueWriterState } from "../src/value-writer/types.ts";
import { ValueWriter } from "../src/value-writer/value-writer.ts";

const STATE_NAMES: Record<ValueWriterState, StateName> = {
  ready: "READY",
};

let writer: ValueWriter | undefined;

function current(): ValueWriter {
  if (writer === undefined) throw new Error("adapter: setupIsolation has not been called");
  return writer;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    writer = new ValueWriter({
      writeConstant: ({ kind, text, number, flag }) => ports.effects.WriteConstant({ kind, text, number, flag }),
      writeReference: (text) => ports.effects.WriteReference({ text }),
      writeWasState: (state) => ports.effects.WriteWasState({ state }),
    });
  },
  async teardownIsolation() {
    writer = undefined;
  },
  async executeCommand(command) {
    const system = current();
    switch (command.name) {
      case "Constant": {
        const { kind, text, number, flag } = command.input;
        system.constant({ kind, text, number, flag });
        break;
      }
      case "Reference": {
        const { target, name, table, column } = command.input;
        system.reference(target === "decision" ? { target, table, column } : { target, name });
        break;
      }
      case "WasState":
        system.wasState(command.input.state);
        break;
      default: {
        const unknown: never = command;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
