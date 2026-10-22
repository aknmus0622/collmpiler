/**
 * Checker verdict: how serious each outcome of the formal checker is.
 *
 * Corresponds to the specification component `checker-verdict`. It has no state
 * and no dependencies; its only entry is the query `Verdict`, implemented here by
 * the pure function {@link checkerVerdict}.
 */

/**
 * Specification query `checker-verdict.Verdict` (calculation `verdict`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 *
 * @param kind   what was checked (specification parameter `kind`).
 * @param status how that check came out (specification parameter `status`).
 * @returns the code and severity to report for that check, as a fresh record.
 */
export function checkerVerdict(kind: CheckKind, status: CheckStatus): CheckerVerdict {
  const rule = VERDICT_RULES.find((r) => ruleMatches(r, kind, status));
  const outcome = rule === undefined ? NOTHING_TO_REPORT : rule.outcome;
  return { code: outcome.code as VerdictCode, severity: outcome.severity as VerdictSeverity };
}

/** A diagnostic as written in the decision table below. */
interface VerdictOutcome {
  readonly code: string;
  readonly severity: string;
}

/**
 * One row of the decision table: it applies when the check's kind and status are
 * those given (`null` matches any value).
 */
interface VerdictRule {
  readonly kind: string | null;
  readonly status: string | null;
  readonly outcome: VerdictOutcome;
}

/** Something the checker skipped or could not explore: a warning. */
const OUT_OF_RANGE: VerdictOutcome = { code: "out-of-range", severity: "warning" };

/** Anything that holds, or an event that is reached: nothing is reported. */
const NOTHING_TO_REPORT: VerdictOutcome = { code: "none", severity: "none" };

/** The decision table; the first row that matches decides. */
const VERDICT_RULES: readonly VerdictRule[] = [
  { kind: "skipped", status: null, outcome: OUT_OF_RANGE },
  { kind: null, status: "skipped", outcome: OUT_OF_RANGE },
  { kind: null, status: "out-of-range", outcome: OUT_OF_RANGE },
  { kind: "reach", status: "unreachable", outcome: { code: "unreached-case", severity: "warning" } },
  { kind: "property", status: "broken", outcome: { code: "property", severity: "error" } },
  { kind: "defined", status: "broken", outcome: { code: "undefined-value", severity: "error" } },
  { kind: "requires", status: "broken", outcome: { code: "requires-broken", severity: "error" } },
];

function ruleMatches(rule: VerdictRule, kind: string, status: string): boolean {
  return (rule.kind === null || rule.kind === kind) && (rule.status === null || rule.status === status);
}

/**
 * What the formal checker checked (specification parameter `kind`).
 *
 * - `"property"`: a stated property of the model.
 * - `"defined"`: that a value read is defined where it is read.
 * - `"requires"`: that a component is called within its `requires`.
 * - `"reach"`: that an event can happen (some trace reaches it).
 * - `"skipped"`: something the checker could not express at all.
 */
export type CheckKind = "property" | "defined" | "requires" | "reach" | "skipped";

/**
 * How a check came out (specification parameter `status`).
 *
 * - `"holds"`: the checked thing holds.
 * - `"broken"`: the checked thing does not hold.
 * - `"reached"`: the event is reached by some trace.
 * - `"unreachable"`: no trace reaches the event.
 * - `"out-of-range"`: the check left the range the checker explores.
 * - `"skipped"`: the check was not performed.
 */
export type CheckStatus =
  | "holds"
  | "broken"
  | "reached"
  | "unreachable"
  | "out-of-range"
  | "skipped";

/**
 * The diagnostic code reported for a check (field `code` of the specification's
 * result record). `"none"` means nothing is reported.
 */
export type VerdictCode =
  | "property"
  | "undefined-value"
  | "requires-broken"
  | "unreached-case"
  | "out-of-range"
  | "none";

/**
 * How serious the reported diagnostic is (field `severity` of the specification's
 * result record). `"none"` means nothing is reported.
 */
export type VerdictSeverity = "error" | "warning" | "none";

/** The answer of the `Verdict` query: a diagnostic code with its severity. */
export interface CheckerVerdict {
  code: VerdictCode;
  severity: VerdictSeverity;
}
