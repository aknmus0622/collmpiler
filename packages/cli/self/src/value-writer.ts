/**
 * The value writer itself: it is driven by commands as the values of a specification are met, and tells its
 * output what to write.
 */

import { referenceText } from "./value-writer-decisions.ts";
import type { ValueWriterDependencies } from "./value-writer-ports.ts";
import type { Constant, Reference, ValueWriterState } from "./value-writer-types.ts";

/**
 * Writes the values of a specification into its intermediate representation, one value at a time.
 *
 * Usage:
 *
 * 1. Construct it with its dependencies. A new writer is in state `READY`.
 * 2. For each value met, call the method for what it is: `constant`, `reference`, or, for a reference to
 *    the state before a command, `wasState` once per state it lists.
 * 3. Read `state` at any time. The writer remembers nothing between commands (the specification has no
 *    `data`), so there is nothing else to read.
 *
 * Every command method is synchronous and returns nothing; whatever it tells the output has been told by
 * the time it returns. Every command applies in state `READY` and leaves the writer there.
 */
export class ValueWriter {
  private readonly dependencies: ValueWriterDependencies;

  /**
   * The current state. Deliberately not assigned in the skeleton: whoever writes the bodies gives it its
   * starting value (an initialiser may be added to this declaration).
   */
  private currentState: ValueWriterState = "READY";

  /**
   * @param dependencies the output that is told each value to write.
   */
  constructor(dependencies: ValueWriterDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * The current state, under the specification's own state names (see `ValueWriterState` for what each one
   * means). Reading it has no side effect.
   */
  get state(): ValueWriterState {
    return this.currentState;
  }

  /**
   * Specification command `Constant`. Applies in state `READY`.
   *
   * Hands the writer a constant written in the specification. Tells `ValueOutput.writeConstant` once.
   *
   * @param constant the command's inputs `kind`, `text`, `number` and `flag`, as the fields with the same
   *   names.
   */
  constant(constant: Constant): void {
    this.dependencies.output.writeConstant({
      kind: constant.kind,
      text: constant.text,
      number: constant.number,
      flag: constant.flag,
    });
  }

  /**
   * Specification command `Reference`. Applies in state `READY`.
   *
   * Hands the writer a reference to something the specification declares. Tells
   * `ValueOutput.writeReference` once.
   *
   * @param reference the command's inputs: `target`, and either `name` or, for a column of a decision
   *   table, `table` and `column` (see `Reference`).
   */
  reference(reference: Reference): void {
    this.dependencies.output.writeReference(referenceText(reference));
  }

  /**
   * Specification command `WasState`. Applies in state `READY`.
   *
   * Hands the writer one of the states listed by a reference to the state before a command. Tells
   * `ValueOutput.writeWasState` once.
   *
   * @param state the command's `state` input: the state's name.
   */
  wasState(state: string): void {
    this.dependencies.output.writeWasState(state);
  }
}
