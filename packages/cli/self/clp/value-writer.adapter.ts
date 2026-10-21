import type { CommandOutput, Ports, StateName, TargetSystemAdapter } from "./value-writer.adapter.contract.ts";
import { ValueWriter } from "../src/value-writer.ts";
import type { JsonValue, SpecValue, WrittenValue } from "../src/value-writer.ts";

type WriteInput = Extract<Parameters<TargetSystemAdapter["executeCommand"]>[0], { name: "Write" }>["input"];

let writer: ValueWriter | undefined;

// Contract input `value` (keyed by variant) -> production `SpecValue` (discriminated by `kind`).
function toSpecValue(value: WriteInput["value"]): SpecValue {
  if ("constant" in value) return { kind: "constant", constant: value.constant as JsonValue };
  if ("reference" in value) return { kind: "reference", target: value.reference.target, name: value.reference.name };
  if ("column" in value) return { kind: "column", table: value.column.table, column: value.column.column };
  return { kind: "was", was: value.was };
}

// Production `WrittenValue` (discriminated by `kind`) -> contract output (keyed by variant).
function toOutput(written: WrittenValue): CommandOutput["Write"] {
  switch (written.kind) {
    case "constant":
      return { constant: written.value };
    case "reference":
      return { reference: written.value };
    case "was":
      return { was: written.value };
  }
}

// Import the production code from ../src/ and forward each call to it. No business logic here.
export const adapter: TargetSystemAdapter = {
  async setupIsolation(_ports: Ports) {
    // The value writer asks nothing of its environment and tells it nothing: no ports to connect.
    writer = new ValueWriter();
  },
  async teardownIsolation() {
    writer = undefined;
  },
  async executeCommand(command) {
    if (!writer) throw new Error("setupIsolation was not called");
    switch (command.name) {
      case "Write":
        return toOutput(writer.write(toSpecValue(command.input.value)));
    }
  },
  async getCurrentState(): Promise<StateName> {
    // The production code has no states of its own; the specification's only state is READY.
    return "READY";
  },
};
