/**
 * The business decisions of the reference check as pure functions: they take plain values, return plain
 * values, and touch no dependency. The `ReferenceCheck` class (see `reference-check.ts`) gathers the inputs,
 * calls these, and carries out what they return.
 *
 * The rules themselves are in the specification, not in these comments.
 */

import type { Diagnostic, DiagnosticCode, ReferenceCheckState, WalkMemory } from "./reference-check-types.ts";

/**
 * What handing one reference to the check leads to: what to remember and what to report. The state of the
 * walk is not part of it, because checking a reference leaves the walk where it is.
 */
export interface ReferenceOutcome {
  /** The remembered data after the command (specification: the data with the outcome's `set` applied). */
  readonly memory: WalkMemory;
  /** The diagnostic to report, or `null` for none (specification effect `ReportDiagnostic`). */
  readonly diagnostic: Diagnostic | null;
}

/**
 * Decides what a reference to a state or an effect leads to. Covers the specification's commands
 * `AllowFrom`, `GoTo` and `UseEffect`.
 *
 * @param code the diagnostic code that belongs to the kind of name referred to: the one for states for
 *   `AllowFrom` and `GoTo`, the one for effects for `UseEffect`.
 * @param subject the name that was referred to (the command's `state` or `name` input).
 * @param declared the answer of the matching question of the `Declarations` dependency for `subject`.
 * @param memory the data remembered before the command.
 * @returns the data to remember and the diagnostic to report, if any.
 */
export function decideReference(
  code: DiagnosticCode,
  subject: string,
  declared: boolean,
  memory: WalkMemory,
): ReferenceOutcome {
  if (declared) {
    return { memory, diagnostic: null };
  }
  if (memory.command === null || memory.caseName === null) {
    throw new Error("the walk is not inside a command");
  }
  return {
    memory: { ...memory, errors: nextErrors(memory) },
    diagnostic: { code, command: memory.command, caseName: memory.caseName, subject },
  };
}

/**
 * Decides which state the specification's `Finish` command leads to.
 *
 * @param memory the data remembered before the command.
 * @returns the state the walk ends in.
 */
export function decideFinish(memory: WalkMemory): ReferenceCheckState {
  return memory.errors === 0 ? "ACCEPTED" : "REJECTED";
}

/**
 * The specification's calculation `nextErrors`.
 *
 * @param memory the data remembered before the command.
 */
export function nextErrors(memory: WalkMemory): number {
  return memory.errors + 1;
}
