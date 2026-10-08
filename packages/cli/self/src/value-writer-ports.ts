/**
 * The dependencies of the value writer, described in the writer's own terms. The writer receives one
 * implementation of each through its constructor and never reaches for anything else.
 *
 * All methods are synchronous. The writer asks its environment nothing; it is only told things.
 */

import type { Constant } from "./value-writer-types.ts";

/**
 * The intermediate representation being written: receives each value the writer writes, in the order the
 * values were handed to the writer.
 */
export interface ValueOutput {
  /**
   * Told: write one constant.
   *
   * Specification effect: `WriteConstant`, whose payload fields `kind`, `text`, `number` and `flag` are the
   * fields of `constant` with the same names. Told while the writer handles `constant`.
   *
   * @param constant the constant to write.
   */
  writeConstant(constant: Constant): void;

  /**
   * Told: write one reference.
   *
   * Specification effect: `WriteReference`. Told while the writer handles `reference`.
   *
   * @param text the effect's `text` payload field: the reference as one text.
   */
  writeReference(text: string): void;

  /**
   * Told: write one state of a reference to the state before a command.
   *
   * Specification effect: `WriteWasState`. Told while the writer handles `wasState`.
   *
   * @param state the effect's `state` payload field: the state's name.
   */
  writeWasState(state: string): void;
}

/** Everything the value writer needs from outside, passed to its constructor as one object. */
export interface ValueWriterDependencies {
  /** Told each value to write. */
  readonly output: ValueOutput;
}
