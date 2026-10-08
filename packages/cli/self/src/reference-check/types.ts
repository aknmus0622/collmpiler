/**
 * Vocabulary of the reference check: the position it reports, the diagnostics it emits, and the
 * dependencies it is given.
 */

/**
 * Position of the walk. Corresponds to the specification's states:
 *
 * - `"idle"`: `IDLE`
 * - `"between-commands"`: `BETWEEN_COMMANDS`
 * - `"in-command"`: `IN_COMMAND`
 * - `"in-case"`: `IN_CASE`
 * - `"accepted"`: `ACCEPTED`
 * - `"rejected"`: `REJECTED`
 */
export type ReferenceCheckState =
  | "idle"
  | "between-commands"
  | "in-command"
  | "in-case"
  | "accepted"
  | "rejected";

/**
 * Classification of a diagnostic. Corresponds to the `code` of the specification's `ReportDiagnostic`
 * effect, with the same spellings.
 */
export type ReferenceDiagnosticCode = "unknown-state" | "unknown-effect";

/**
 * One diagnostic emitted by the check. Corresponds to the payload of the specification's
 * `ReportDiagnostic` effect, member for member (`code`, `command`, `caseName`, `subject`).
 */
export interface ReferenceDiagnostic {
  readonly code: ReferenceDiagnosticCode;
  /** Command name the diagnostic is attached to. */
  readonly command: string;
  /** Case name the diagnostic is attached to; may be the empty string. */
  readonly caseName: string;
  /** The state name or effect name the diagnostic is about. */
  readonly subject: string;
}

/**
 * Dependency: the names declared by the specification under check. The check consults it each time it
 * needs an answer and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface DeclaredNames {
  /**
   * Lookup of a state by name.
   * Corresponds to the query `stateDeclared` with input `{ name: state }`; returns its answer.
   */
  declaresState(state: string): boolean;

  /**
   * Lookup of an effect by name.
   * Corresponds to the query `effectDeclared` with input `{ name: effect }`; returns its answer.
   */
  declaresEffect(effect: string): boolean;
}

/** Dependency: the receiver of the diagnostics the check emits. */
export interface ReferenceDiagnosticSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted diagnostic.
   * Corresponds to the specification's `ReportDiagnostic` effect; the argument is its payload.
   */
  report(diagnostic: ReferenceDiagnostic): void;
}
