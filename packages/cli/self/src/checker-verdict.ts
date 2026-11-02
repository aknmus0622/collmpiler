/**
 * Classifies one result reported by the formal checker: given what was checked
 * and how it came out, says which finding (if any) to report and how serious it is.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `checker-verdict`.
 */

/**
 * What the checker examined. Specification name: parameter `kind`; the values
 * are the specification's own.
 *
 * - `"property"`: a stated property of the model.
 * - `"defined"`: that a value that is read is defined at that point.
 * - `"requires"`: that a component is called within its `requires`.
 * - `"reach"`: that an event can happen.
 * - `"skipped"`: something the checker could not express at all.
 */
export type CheckKind = "property" | "defined" | "requires" | "reach" | "skipped";

/**
 * How the check came out, as the checker reported it. Specification name:
 * parameter `status`; the values are the specification's own.
 *
 * - `"holds"`: the checker found the claim to be true.
 * - `"broken"`: the checker found a counterexample.
 * - `"reached"`: some trace reaches the event.
 * - `"unreachable"`: no trace reaches the event.
 * - `"out-of-range"`: the checker's outcome lies outside what it could decide.
 * - `"skipped"`: the checker did not perform the check.
 */
export type CheckStatus =
  | "holds"
  | "broken"
  | "reached"
  | "unreachable"
  | "out-of-range"
  | "skipped";

/**
 * Identifies the finding to report. Specification name: field `code` of the
 * query's result; the values are the specification's own, and `"none"` means
 * there is no finding.
 */
export type FindingCode =
  | "property"
  | "undefined-value"
  | "requires-broken"
  | "unreached-case"
  | "out-of-range"
  | "none";

/**
 * How serious a finding is. Specification name: field `severity` of the query's
 * result; the values are the specification's own, and `"none"` means there is
 * nothing to act on.
 */
export type FindingSeverity = "error" | "warning" | "none";

/**
 * The answer for one checker result. A new plain object with exactly these two
 * fields, so it can be compared by value.
 */
export interface CheckerFinding {
  /** Which finding this is. */
  code: FindingCode;
  /** How serious it is. */
  severity: FindingSeverity;
}

/**
 * Performs the specification's query `Verdict` (`checker-verdict.Verdict`).
 *
 * Accepts any combination of the two arguments, including ones the checker
 * would not normally pair, and always answers. Never throws for a valid
 * argument. Reads no state, so the same arguments always give an equal answer.
 *
 * @param kind what was checked (specification parameter `kind`).
 * @param status how it came out (specification parameter `status`).
 * @returns the finding to report, with its `code` and `severity`.
 */
export function classifyCheckerResult(kind: CheckKind, status: CheckStatus): CheckerFinding {
  if (kind === "skipped" || status === "skipped" || status === "out-of-range") {
    return { code: "out-of-range", severity: "warning" };
  }
  if (kind === "reach" && status === "unreachable") {
    return { code: "unreached-case", severity: "warning" };
  }
  if (kind === "property" && status === "broken") {
    return { code: "property", severity: "error" };
  }
  if (kind === "defined" && status === "broken") {
    return { code: "undefined-value", severity: "error" };
  }
  if (kind === "requires" && status === "broken") {
    return { code: "requires-broken", severity: "error" };
  }
  return { code: "none", severity: "none" };
}
