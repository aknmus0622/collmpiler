// What the generated verify.ts (IR version 8) calls: derive the IR from the specs, then run the property-based test
// against the adapter and print the result on one line.

import { parseArgs } from "node:util";
import { compileChecked } from "./load.ts";
import { deciders8 } from "./stage1.ts";
import { check8, entriesOf } from "./pbt.ts";
import type { Adapter8, PbtResult8 } from "./pbt.ts";
import { specHash8 } from "./generate.ts";
import type { Ir8 } from "./ir.ts";
import { tracesFor } from "./traces.ts";

export const RESULT_PREFIX = "CLP_RESULT ";
export const seedOf8 = (ir: Ir8): number => Number.parseInt(specHash8(ir).slice("sha256:".length, "sha256:".length + 7), 16);
/** Fewer trials for a component that contains others (its parts were verified on their own) or is reached over HTTP. */
export const defaultRuns8 = (ir: Ir8) => (ir.components[ir.root].routes || (ir.components[ir.root].contains?.length ?? 0) > 0 ? 500 : 5000);

/** What the production system's boundary is: entries, their inputs and answers, the outside world, routes, restarts. */
export function boundary8(ir: Ir8): string {
  const entries = entriesOf(ir).map((e) => ({ name: e.qualified, kind: e.kind, params: e.params, output: e.output ?? null }));
  const outside = Object.fromEntries(Object.entries(ir.components).flatMap(([id, c]) => (c.external ? [[id, c.external]] : [])));
  const root = ir.components[ir.root];
  return JSON.stringify({ entries, outside, routes: root.routes ?? null, durable: Object.values(ir.components).some((c) => c.durable), sorts: ir.sorts });
}

export async function runPbt(options: { specs: string; adapter: Adapter8; component?: string; args?: string[] }): Promise<PbtResult8> {
  const { values } = parseArgs({
    args: options.args ?? process.argv.slice(2),
    options: { seed: { type: "string" }, path: { type: "string" }, runs: { type: "string" }, drafts: { type: "boolean", default: false } },
  });
  let result: PbtResult8;
  const { ir, problems } = await compileChecked(options.specs, options.component, { drafts: values.drafts });
  const errors = problems.filter((p) => p.severity === "error");
  if (!ir || errors.length > 0) result = { status: "error", message: `仕様に誤りがあります: ${errors.map((p) => `${p.where} ${p.message}`).join(" / ")}` };
  else {
    result = await check8(ir, options.adapter, {
      seed: values.seed === undefined ? seedOf8(ir) : Number(values.seed),
      ...(values.path ? { path: values.path } : {}),
      numRuns: values.runs === undefined ? defaultRuns8(ir) : Number(values.runs),
      traces: tracesFor(ir),
    }, await deciders8());
  }
  console.log(RESULT_PREFIX + JSON.stringify(result));
  if (result.status !== "pass") process.exitCode = 1;
  return result;
}
