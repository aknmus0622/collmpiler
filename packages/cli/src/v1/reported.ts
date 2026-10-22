// What a verdict of the formal checker means for the person (1.0): the Stage 0 of checker-verdict. A broken property, a
// value read where it is not defined, or a component called against its `requires` stops everything; an event no trace
// reaches, or something the checker cannot express, is a warning; the rest says nothing.

export type VerdictFacts = { kind: "property" | "defined" | "requires" | "reach" | "skipped"; status: "holds" | "broken" | "reached" | "unreachable" | "out-of-range" | "skipped" };
export type Reported = { severity: "error" | "warning" | "none"; code: "property" | "undefined-value" | "requires-broken" | "unreached-case" | "out-of-range" | "none" };

export function reportedStage0({ kind, status }: VerdictFacts): Reported {
  if (kind === "skipped" || status === "skipped" || status === "out-of-range") return { severity: "warning", code: "out-of-range" };
  if (kind === "reach") return status === "unreachable" ? { severity: "warning", code: "unreached-case" } : { severity: "none", code: "none" };
  if (status !== "broken") return { severity: "none", code: "none" };
  return { severity: "error", code: kind === "property" ? "property" : kind === "defined" ? "undefined-value" : "requires-broken" };
}
