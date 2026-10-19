import type { ReportSeverity, TrialResult, ValueKind, ValueReport } from "./types.ts";

/**
 * What the `Tried` command does, as chosen by `judgeTrial`:
 *
 * - `{ kind: "shows" }`: the case that returns to `IDLE` without emitting anything (the value shows)
 * - `{ kind: "report", report }`: one of the cases that emit `Report`, with the payload to report
 * - `{ kind: "retry" }`: the case that stays in `TRYING` and emits `RunTrials` for the next extra
 */
export type TrialOutcome =
  | { readonly kind: "shows" }
  | { readonly kind: "report"; readonly report: ValueReport }
  | { readonly kind: "retry" };

/**
 * Pure decision. Whether `Begin` skips the value, i.e. takes its case that does nothing (no state change,
 * no data stored, no effect) rather than its `otherwise` case.
 *
 * @param kind the command's `kind`
 * @returns true when nothing is to happen
 */
export function isSkipped(kind: ValueKind): boolean {
  return kind === "null";
}

/**
 * Corresponds to the `extraSeeds` column of the specification's `seeds` decision table.
 *
 * @returns the number of extra seeds a value is tried under
 */
export function extraSeeds(): number {
  return 2;
}

/**
 * Pure decision. Chooses the case of the specification's `Tried` command.
 *
 * @param result the input of the `Tried` command
 * @param currentExtra the specification's `data.currentExtra`, as remembered before this command
 * @param commandChangeSeen the specification's `data.commandChangeSeen`, as remembered before this run
 * @param valueKind the specification's `data.valueKind`
 * @returns the case that applies
 */
export function judgeTrial(
  result: TrialResult,
  currentExtra: number,
  commandChangeSeen: boolean,
  valueKind: ValueKind,
): TrialOutcome {
  if (result.changed) {
    if (currentExtra === 0) return { kind: "shows" };
    return { kind: "report", report: { severity: "warning", verdict: "rare" } };
  }
  if (currentExtra < extraSeeds()) return { kind: "retry" };
  const verdict = commandChangeSeenNow(commandChangeSeen, result.enablementDiffers) ? "precondition" : "unobserved";
  return { kind: "report", report: { severity: severityOf(valueKind), verdict } };
}

/**
 * Corresponds to the specification's calculation `nextExtra`.
 *
 * @param currentExtra the specification's `data.currentExtra`
 * @returns the extra of the next run to ask for
 */
export function nextExtra(currentExtra: number): number {
  return currentExtra + 1;
}

/**
 * Corresponds to the specification's calculation `commandChangeSeenNow`.
 *
 * @param commandChangeSeen the specification's `data.commandChangeSeen`, as remembered before this run
 * @param enablementDiffers the `Tried` command's `enablementDiffers`
 * @returns the value to remember as `data.commandChangeSeen`
 */
export function commandChangeSeenNow(commandChangeSeen: boolean, enablementDiffers: boolean): boolean {
  return commandChangeSeen || enablementDiffers;
}

/**
 * Corresponds to the specification's calculation `severity`.
 *
 * @param kind the specification's `data.valueKind`
 * @returns the severity to report with
 */
export function severityOf(kind: ValueKind): ReportSeverity {
  return kind === "boolean" ? "warning" : "error";
}
