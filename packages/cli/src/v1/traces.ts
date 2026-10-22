// The fixed traces replayed before the random ones (DSL.md §17.13 ②): the shortest trace Alloy found to every event,
// and the examples the author wrote. Both are in the common trace format.

import { checkWithAlloy, javaAvailable } from "./alloy.ts";
import type { CheckResult } from "./alloy.ts";
import type { Ir8, TraceStep } from "./ir.ts";

/** Alloy is used unless `CLP_ALLOY=off` (for tests that do not need it) or Java is missing (then the caller says so). */
export const alloyEnabled = () => process.env.CLP_ALLOY !== "off";

let java: boolean | undefined;
export function checked(ir: Ir8): CheckResult | undefined {
  if (!alloyEnabled()) return undefined;
  java ??= javaAvailable();
  if (!java) return undefined;
  return checkWithAlloy(ir);
}

export function tracesFor(ir: Ir8, result: CheckResult | undefined = checked(ir)): { event: string; steps: TraceStep[] }[] {
  const traces: { event: string; steps: TraceStep[] }[] = [];
  for (const verdict of result?.verdicts ?? []) {
    if (verdict.kind === "reach" && verdict.status === "reached" && verdict.trace?.length) traces.push({ event: verdict.what, steps: verdict.trace });
  }
  for (const [name, example] of Object.entries(ir.examples ?? {})) {
    const steps: TraceStep[] = example.steps.map((step) => ("expect" in step ? { event: step.expect.event, params: step.expect.params } : step));
    traces.push({ event: `example:${name}`, steps });
  }
  return traces;
}
