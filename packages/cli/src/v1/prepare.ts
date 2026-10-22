// Everything checked about a 1.0 spec before any agent runs (DSL.md §17.13 ①): it reads and builds without a
// problem, the spec alone runs (no case missing, none overlapping, no missing key, properties hold), the author's
// examples hold, and which events were never reached. Shared by `clp compile` and `clp apply`.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { resolveAssets } from "../assets.ts";
import type { Asset } from "../assets.ts";
import { compileChecked } from "./load.ts";
import type { Problem, Unit } from "./read.ts";
import { CORE } from "./read.ts";
import type { Ir8 } from "./ir.ts";
import { checkExamples, selfCheck8 } from "./pbt.ts";
import { seedOf8 } from "./runtime.ts";
import { alloyEnabled, checked as alloyChecked, tracesFor } from "./traces.ts";
import { describeUnobservable8, observability8 } from "./mutants.ts";
import type { Trial, Unobservable } from "./verdict.ts";
import { reportedStage0 } from "./reported.ts";
import type { VerdictFacts } from "./reported.ts";
import { decided } from "./decide.ts";
import { javaAvailable } from "./alloy.ts";
import type { Expr } from "./syntax.ts";

/** Whether a spec directory is written in the 1.0 notation (a file imports `@clp/core/v1`). */
export function isV1Specs(dir: string): boolean {
  if (!existsSync(dir)) return false;
  return (readdirSync(dir, { recursive: true }) as string[]).some((file) => {
    if (!file.endsWith(".ts")) return false;
    try {
      return readFileSync(join(dir, file), "utf8").includes(`"${CORE}"`);
    } catch {
      return false;
    }
  });
}

export type Prepared = {
  ir?: Ir8;
  problems: Problem[];
  /** The files the component's spec starts from (relative to the specs directory). */
  roots: string[];
  assets: Asset[];
  unit?: Unit;
};

/** Reads and builds one component; nothing is run. */
export async function prepare(specsDir: string, component: string, options: { drafts?: boolean } = {}): Promise<Prepared> {
  const { ir, problems, unit } = await compileChecked(specsDir, component, options);
  const rel = (file: string) => relative(specsDir, file).split(sep).join("/");
  const roots = unit ? [unit.file, ...(unit.interpretation ? [unit.interpretation.file] : [])].map(rel) : [];
  let assets: Asset[] = [];
  if (unit?.settings.assets) {
    try {
      assets = resolveAssets(assetDeclarations(unit.settings.assets), dirname(unit.file));
    } catch (error) {
      problems.push({ severity: "error", code: "bad-asset", where: unit.exportName, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { ir, problems, roots: [...new Set(roots)], assets, unit };
}

function assetDeclarations(expr: Expr): { kind: "file" | "dir" | "text"; path: string; text: string; phases?: ("design" | "wiring" | "implementation")[] }[] {
  if (expr.k !== "arr") throw new Error("assets は [file(…), dir(…), text(…)] で書きます");
  return expr.items.map((item) => {
    if (item.k !== "call" || item.callee.k !== "id" || !["file", "dir", "text"].includes(item.callee.name) || item.args[0]?.k !== "str") {
      throw new Error("assets の要素は file(\"パス\")、dir(\"パス\")、text(\"文\") です");
    }
    const options = item.args[1];
    const phases =
      options?.k === "obj"
        ? options.props.flatMap((p) => (p.k === "prop" && p.key === "phases" && p.value.k === "arr" ? p.value.items.flatMap((i) => (i.k === "str" ? [i.value as "design"] : [])) : []))
        : undefined;
    const value = item.args[0].value;
    const kind = item.callee.name as "file" | "dir" | "text";
    return { kind, path: value, text: value, ...(phases && phases.length ? { phases } : {}) };
  });
}

export type Checked = { problems: Problem[]; warnings: string[] };

/** Runs the spec alone: spec errors, examples, and events never reached. */
export async function checkSpec(ir: Ir8, options: { runs?: number; judge?: (trials: Trial[]) => Promise<Unobservable[] | undefined> } = {}): Promise<Checked> {
  const problems: Problem[] = [];
  const warnings: string[] = [];
  const { deciders8, judgeTrials } = await import("./stage1.ts");
  const deciders = await deciders8();
  const checked = await selfCheck8(ir, { seed: 1 }, deciders);
  if (!checked.ok) {
    problems.push({ severity: "error", code: "spec-check", where: ir.root, message: `${checked.message}\n  再現する手順: ${JSON.stringify(checked.steps)}` });
    return { problems, warnings };
  }
  for (const found of checkExamples(ir)) problems.push({ severity: "error", code: "example", where: `${ir.root}.examples.${found.example}`, message: found.message });
  // ① the formal check (Alloy 6): properties, definedness, requires of calls, reachability of every event
  const formal = alloyEnabled() ? (javaAvailable() ? alloyChecked(ir) : undefined) : undefined;
  if (alloyEnabled() && !formal) problems.push({ severity: "error", code: "no-java", where: "", message: "Java がありません。仕様の検査 (Alloy 6) には Java が要ります (DISTRIBUTION.md 決定 3')" });
  const shown = (steps: { event: string; params: Record<string, unknown> }[] | undefined) =>
    steps?.length ? `\n  反例の手順: ${steps.map((s) => `${s.event}(${JSON.stringify(s.params)})`).join(" → ")}` : "";
  const reached = new Set<string>();
  const report = (facts: VerdictFacts) => decided("checker-verdict", facts, reportedStage0(facts));
  for (const skipped of formal?.skipped ?? []) {
    if (report({ kind: "skipped", status: "skipped" }).severity === "warning") warnings.push(`warning[out-of-range] ${ir.root}: ${skipped}`);
  }
  for (const verdict of formal?.verdicts ?? []) {
    const { severity, code } = report({ kind: verdict.kind, status: verdict.status });
    if (verdict.kind === "reach") {
      if (verdict.status === "reached") reached.add(verdict.what);
      if (severity === "warning" && code === "unreached-case") warnings.push(`warning[unreached-case] ${verdict.what}: Alloy で探した範囲 (原子は種類ごとに 6 個、12 ステップまで) では、この場合に至る手順がありません。この場合の結果は検証されません`);
      if (severity === "warning" && code === "out-of-range") warnings.push(`warning[out-of-range] ${verdict.what}: Alloy では確かめられませんでした`);
      continue;
    }
    if (severity === "warning") warnings.push(`warning[${code}] ${verdict.what}: Alloy では確かめられませんでした`);
    if (severity !== "error") continue;
    const message =
      verdict.kind === "property"
        ? `性質 ${verdict.what} が成り立たない手順があります`
        : verdict.kind === "defined"
          ? `${verdict.what} とは限りません（無いキーを読む手順があります）`
          : `${verdict.what}、その requires が成り立たない手順があります`;
    problems.push({ severity: "error", code, where: ir.root, message: message + shown(verdict.trace) });
  }
  // spec mutation: every constant the mutation gate breaks must show in what the spec answers or sends
  if (problems.length === 0) {
    for (const found of await observability8(ir, { seed: seedOf8(ir), traces: tracesFor(ir, formal) }, options.judge ?? judgeTrials)) {
      const text = `${ir.root}: ${describeUnobservable8(found)}`;
      if (found.severity === "error") problems.push({ severity: "error", code: "unobservable-value", where: ir.root, message: describeUnobservable8(found) });
      else warnings.push(`warning[unobservable-value] ${text}`);
    }
  }
  if (!formal) {
    const more = await selfCheck8(ir, { seed: seedOf8(ir), numRuns: options.runs ?? 1000 }, deciders);
    const never = new Set(checked.coverage.never.filter((e) => (more.ok ? more.coverage.never.includes(e) : true)));
    for (const event of never) warnings.push(`warning[unreached-case] ${event}: 仕様を実行しても、この場合には一度も当たりませんでした。この場合の結果は検証されません`);
  }
  return { problems, warnings };
}
