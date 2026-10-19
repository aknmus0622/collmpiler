/**
 * Vocabulary of the mutation verdict: the position it reports, the reports it emits, and the dependencies
 * it is given.
 */

/**
 * Position of the judge. Corresponds to the specification's states:
 *
 * - `"idle"`: `IDLE` (between values; ready for `Begin`)
 * - `"trying"`: `TRYING` (a value is under judgment; waiting for `Tried` after each requested run)
 */
export type MutationVerdictState = "idle" | "trying";

/**
 * Kind of the decision-table value being judged. Corresponds to the specification's `kind` input of
 * `Begin` and to `data.valueKind`, with the same spellings.
 */
export type ValueKind = "number" | "string" | "boolean" | "null";

/**
 * How serious a report is. Corresponds to the `severity` of the specification's `Report` effect, with the
 * same spellings.
 */
export type ReportSeverity = "error" | "warning";

/**
 * Verdict on a value that was reported. Corresponds to the `verdict` of the specification's `Report`
 * effect, with the same spellings.
 */
export type MutationVerdictKind = "precondition" | "unobserved" | "rare";

/**
 * One report emitted by the judge. Corresponds to the payload of the specification's `Report` effect,
 * member for member (`severity`, `verdict`).
 */
export interface ValueReport {
  readonly severity: ReportSeverity;
  readonly verdict: MutationVerdictKind;
}

/**
 * What a finished run tells the judge. Corresponds to the input of the specification's `Tried` command.
 */
export interface TrialResult {
  /** The command's `changed`: whether some expected outcome changed in the run. */
  readonly changed: boolean;
  /** The command's `enablementDiffers`, as reported by whoever performed the run. */
  readonly enablementDiffers: boolean;
}

/** Dependency: whatever runs the specification with the value under judgment changed. */
export interface TrialRunner {
  /**
   * Called synchronously, from inside the command that asks for the run, once per run asked for. The run's
   * result is fed back later by calling `Tried` on the judge. Corresponds to the specification's
   * `RunTrials` effect.
   *
   * @param extra the effect's `extra`: which seed to run under, passed through unchanged
   */
  runTrials(extra: number): void;
}

/** Dependency: the receiver of the reports the judge emits. */
export interface ValueReportSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted report. Corresponds to
   * the specification's `Report` effect; the argument is its payload.
   */
  report(report: ValueReport): void;
}
