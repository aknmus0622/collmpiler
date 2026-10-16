import type { Command, CommandOutput, StateName, TargetSystemAdapter } from "./value-writer.adapter.contract.ts";
import type { ConstantValue, SpecValue, ValueWriterState, WrittenValue } from "../src/value-writer/types.ts";
import { ValueWriter } from "../src/value-writer/value-writer.ts";

const STATE_NAMES: Record<ValueWriterState, StateName> = {
  ready: "READY",
};

let writer: ValueWriter | undefined;

function current(): ValueWriter {
  if (writer === undefined) throw new Error("adapter: setupIsolation has not been called");
  return writer;
}

function toSpecValue(value: Extract<Command, { name: "Write" }>["input"]["value"]): SpecValue {
  if ("constant" in value) return { kind: "constant", constant: value.constant as ConstantValue };
  if ("reference" in value) {
    const { target, name } = value.reference;
    return { kind: "reference", reference: { target, name } };
  }
  if ("column" in value) {
    const { table, column } = value.column;
    return { kind: "reference", reference: { target: "decision", table, column } };
  }
  if ("was" in value) return { kind: "was", states: value.was };
  const unknown: never = value;
  throw new Error(`adapter: unknown value ${JSON.stringify(unknown)}`);
}

function toWriteOutput(written: WrittenValue): CommandOutput["Write"] {
  switch (written.kind) {
    case "constant":
      return { constant: written.constant as Extract<CommandOutput["Write"], { constant: unknown }>["constant"] };
    case "reference":
      return { reference: written.text };
    case "was":
      return { was: [...written.states] };
    default: {
      const unknown: never = written;
      throw new Error(`adapter: unknown written value ${JSON.stringify(unknown)}`);
    }
  }
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports) {
    // The value writer has no dependencies, so there is nothing in `ports` to connect.
    writer = new ValueWriter();
  },
  async teardownIsolation() {
    writer = undefined;
  },
  async executeCommand(command) {
    const system = current();
    switch (command.name) {
      case "Write":
        return toWriteOutput(system.write(toSpecValue(command.input.value)));
      default: {
        const unknown: never = command.name;
        throw new Error(`adapter: unknown command ${JSON.stringify(unknown)}`);
      }
    }
  },
  async getCurrentState() {
    return STATE_NAMES[current().state];
  },
};
