/**
 * Shared vocabulary of the reference check.
 *
 * The reference check is driven through one specification as a walk: the walk is begun, each command of the
 * specification is entered and left in turn, each case inside a command is entered, and every reference to a
 * state or an effect met on the way is handed to the check. At the end the walk is finished and the
 * specification is accepted or rejected. This file holds only types; it has no behaviour.
 */

/**
 * Where the walk currently is. The names are exactly the specification's state names.
 *
 * - `IDLE`: the walk has not begun (the starting state).
 * - `BETWEEN_COMMANDS`: the walk has begun and is not inside any command.
 * - `IN_COMMAND`: the walk is inside a command, before the first of its cases.
 * - `IN_CASE`: the walk is inside one case of a command.
 * - `ACCEPTED`: the walk is finished and the specification was accepted. No further command applies.
 * - `REJECTED`: the walk is finished and the specification was rejected. No further command applies.
 */
export type ReferenceCheckState =
  | "IDLE"
  | "BETWEEN_COMMANDS"
  | "IN_COMMAND"
  | "IN_CASE"
  | "ACCEPTED"
  | "REJECTED";

/**
 * The kind of problem a diagnostic reports.
 *
 * Same names as the specification's `ReportDiagnostic.code` values.
 */
export type DiagnosticCode = "unknown-state" | "unknown-effect";

/**
 * One problem found by the walk (the payload of the specification's `ReportDiagnostic` effect). Every field
 * has the same name as the payload field it corresponds to.
 */
export interface Diagnostic {
  /** The kind of problem. Specification name: `ReportDiagnostic.code`. */
  readonly code: DiagnosticCode;
  /** The name of the command the problem was found in. Specification name: `ReportDiagnostic.command`. */
  readonly command: string;
  /**
   * The name of the case the problem was found in; the empty string when it was found outside any case.
   * Specification name: `ReportDiagnostic.caseName`.
   */
  readonly caseName: string;
  /** The name that was referred to. Specification name: `ReportDiagnostic.subject`. */
  readonly subject: string;
}

/**
 * What the walk remembers between commands (the specification's `data`). Every field has the same name as
 * the specification's data field it corresponds to. A field the walk has not remembered yet is `null`.
 */
export interface WalkMemory {
  /** How many errors the walk has counted. Specification name: `errors`. */
  readonly errors: number;
  /**
   * The name of the command the walk last entered, or `null` while none has been remembered.
   * Specification name: `command`.
   */
  readonly command: string | null;
  /**
   * The case name the walk last remembered, or `null` while none has been remembered. Specification name:
   * `caseName`.
   */
  readonly caseName: string | null;
}
