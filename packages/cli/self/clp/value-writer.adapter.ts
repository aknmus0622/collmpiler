import type { TargetSystemAdapter } from "./value-writer.adapter.contract.ts";
import { ValueWriter } from "../src/value-writer.ts";

let writer: ValueWriter | undefined;

function current(): ValueWriter {
  if (writer === undefined) throw new Error("setupIsolation has not been called");
  return writer;
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports) {
    writer = new ValueWriter({
      output: {
        writeConstant: (constant) =>
          ports.effects.WriteConstant({
            flag: constant.flag,
            kind: constant.kind,
            number: constant.number,
            text: constant.text,
          }),
        writeReference: (text) => ports.effects.WriteReference({ text }),
        writeWasState: (state) => ports.effects.WriteWasState({ state }),
      },
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
        return;
      }
      case "Reference": {
        // A reference carries only the inputs that belong to its target (see `Reference`).
        const { target, name, table, column } = command.input;
        system.reference(target === "decision" ? { target, table, column } : { target, name });
        return;
      }
      case "WasState":
        system.wasState(command.input.state);
        return;
    }
  },
  async getCurrentState() {
    return current().state;
  },
};
