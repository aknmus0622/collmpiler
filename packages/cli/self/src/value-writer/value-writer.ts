import { referenceText } from "./reference-text.ts";
import type { SpecValue, ValueWriterState, WrittenValue } from "./types.ts";

/**
 * Writes the values of a specification into its intermediate representation, one value at a time: one
 * call of `write` per value, in any order and any number of times.
 *
 * A new instance starts in the specification's initial state; the specification has no remembered data
 * and no dependencies. Each method below performs one command of the specification; its outcome is the
 * value it returns.
 */
export class ValueWriter {
  private readonly currentState: ValueWriterState = "ready";

  /** The current state. `ValueWriterState` lists the specification name of each value. */
  get state(): ValueWriterState {
    return this.currentState;
  }

  /**
   * Performs the command `Write`.
   *
   * @param value the command's `value`; `SpecValue` says how its members correspond to the
   *   specification's alternatives
   * @returns the command's answer; `WrittenValue` says how its members correspond to the
   *   specification's alternatives
   */
  write(value: SpecValue): WrittenValue {
    if (value.kind === "constant") return { kind: "constant", constant: value.constant };
    if (value.kind === "reference") return { kind: "reference", text: referenceText(value.reference) };
    return { kind: "was", states: [...value.states] };
  }
}
