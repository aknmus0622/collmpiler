import { referenceText } from "./reference-text.ts";
import type { Constant, Reference, ValueSink, ValueWriterState } from "./types.ts";

/**
 * Writes the values of a specification into its intermediate representation, one value at a time: one
 * call of `constant`, `reference` or `wasState` per value, in any order and any number of times. What is
 * written goes to the sink passed to the constructor.
 *
 * A new instance starts in the specification's initial state; the specification has no remembered data.
 * Each method below performs one command of the specification; a command returns nothing, and its
 * outcome is observed through `state` and the calls made on the dependency. Calls on the dependency are
 * made synchronously, in the order the specification lists the effects.
 */
export class ValueWriter {
  private readonly sink: ValueSink;
  private readonly currentState: ValueWriterState = "ready";

  /**
   * @param sink receives the effects `WriteConstant`, `WriteReference` and `WriteWasState`
   */
  constructor(sink: ValueSink) {
    this.sink = sink;
  }

  /** The current state. `ValueWriterState` lists the specification name of each value. */
  get state(): ValueWriterState {
    return this.currentState;
  }

  /**
   * Performs the command `Constant`.
   *
   * @param constant the command's input: its `kind`, `text`, `number` and `flag`
   */
  constant(constant: Constant): void {
    this.sink.writeConstant({
      kind: constant.kind,
      text: constant.text,
      number: constant.number,
      flag: constant.flag,
    });
  }

  /**
   * Performs the command `Reference`.
   *
   * @param reference the command's input; `Reference` says how its members correspond to the command's
   *   `target`, `name`, `table` and `column`
   */
  reference(reference: Reference): void {
    this.sink.writeReference(referenceText(reference));
  }

  /**
   * Performs the command `WasState`.
   *
   * @param state the command's `state`: a state name
   */
  wasState(state: string): void {
    this.sink.writeWasState(state);
  }
}
