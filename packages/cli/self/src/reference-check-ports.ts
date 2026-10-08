/**
 * The dependencies of the reference check, described in the check's own terms. The check receives one
 * implementation of each through its constructor and never reaches for anything else.
 *
 * All methods are synchronous.
 */

import type { Diagnostic } from "./reference-check-types.ts";

/**
 * The names the specification under check declares.
 *
 * The answers are asked for at the moment a reference is handed to the check and are not kept afterwards.
 */
export interface Declarations {
  /**
   * Asked: does the specification declare a state with this name?
   *
   * Specification query: `stateDeclared`. Asked while the check handles `allowFrom` and `goTo`, with the
   * state name given to that command.
   *
   * @param state the state name that was referred to.
   */
  isStateDeclared(state: string): boolean;

  /**
   * Asked: does the specification declare an effect with this name?
   *
   * Specification query: `effectDeclared`. Asked while the check handles `useEffect`, with the effect name
   * given to that command.
   *
   * @param name the effect name that was referred to.
   */
  isEffectDeclared(name: string): boolean;
}

/**
 * Receives the problems the walk finds.
 */
export interface DiagnosticReporter {
  /**
   * Told: one problem was found.
   *
   * Specification effect: `ReportDiagnostic`, whose payload fields `code`, `command`, `caseName` and
   * `subject` are the fields of `diagnostic` with the same names.
   *
   * @param diagnostic what kind of problem it is, where it was found, and which name it is about.
   */
  report(diagnostic: Diagnostic): void;
}

/** Everything the reference check needs from outside, passed to its constructor as one object. */
export interface ReferenceCheckDependencies {
  /** Asked whether a state or an effect is declared. */
  readonly declarations: Declarations;
  /** Told about each problem found. */
  readonly diagnostics: DiagnosticReporter;
}
