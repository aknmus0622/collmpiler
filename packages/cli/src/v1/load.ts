// The one place a 1.0 spec directory is loaded: read, lay the interpretations over Layer 1, build the IR of a component.

import { Builder } from "./build.ts";
import { readProgram } from "./read.ts";
import type { Problem, Program, Unit } from "./read.ts";
import type { Ir8 } from "./ir.ts";
import { hasProse, layer1Hash } from "./stamp.ts";
import { shapeProblems } from "./shape.ts";
import { usageWarnings } from "./usage.ts";
import { FrameworkError, agree, recording } from "./decide.ts";
import type { Asked } from "./decide.ts";

/** compile, then the decisions it made put to Stage 1 (R4): a disagreement is an error of the framework. */
export async function compileChecked(dir: string, component: string | undefined, options: { drafts?: boolean } = {}): Promise<Compiled> {
  const compiled = compile(dir, component, options);
  const { deciders8 } = await import("./stage1.ts");
  try {
    await agree(compiled.asked ?? [], await deciders8());
  } catch (error) {
    if (!(error instanceof FrameworkError)) throw error;
    compiled.problems.push({ severity: "error", code: "framework", where: "", message: error.message });
  }
  return compiled;
}
import { relative, sep } from "node:path";

/** Interpretations that cannot be used: missing where Layer 1 has prose, derived from another Layer 1 (stale), not reviewed. */
export function interpretationProblems(program: Program, units: Unit[]): Problem[] {
  const problems: Problem[] = [];
  const rel = (file: string) => relative(process.cwd(), file).split(sep).join("/");
  for (const unit of units) {
    if (unit.kind === "external") continue;
    const interpretation = unit.interpretation;
    if (!interpretation) {
      if (hasProse(unit)) problems.push({ severity: "error", code: "unbound-specification", where: unit.exportName, message: "この部品の解釈 (interpretation) がありません。clp interpret で導いて、確定してください" });
      continue;
    }
    if (interpretation.stamp !== layer1Hash(unit, program)) {
      problems.push({ severity: "error", code: "stale-interpretation", where: unit.exportName, message: `解釈を導いたあとで、Layer 1 が変わっています。clp interpret で導き直してください (${rel(interpretation.file)})` });
    }
    if (!interpretation.file.endsWith(".draft.ts")) {
      const open = program.reviews.filter((r) => r.file === rel(interpretation.file));
      if (open.length > 0) problems.push({ severity: "error", code: "unreviewed-interpretation", where: unit.exportName, message: `確定した解釈に、確かめていない疑問点が ${open.length} 件あります (${open.map((r) => `${r.file}:${r.line}`).join(", ")})` });
    }
  }
  return problems;
}

export type Loaded = {
  program: Program;
  /** Components that can be verified (services with commands or queries once interpreted), by name. */
  components: string[];
};

export function loadProgram(dir: string, options: { drafts?: boolean } = {}): Loaded {
  const program = readProgram(dir, options);
  const components = program.units
    .filter((unit) => unit.kind === "service" && (unit.proseOnly || hasPorts(unit)))
    .map((unit) => unit.id)
    .sort();
  return { program, components };
}

const hasPorts = (unit: Unit) => [...unit.entries.values()].some((entry) => entry.heading === "commands" || entry.heading === "queries");

export type Compiled = { ir?: Ir8; problems: Problem[]; unit?: Unit; program: Program; asked?: Asked[] };

/** The IR of one component, and every problem found while reading and building it (the parsing problems of every file, too). */
export function compile(dir: string, component: string | undefined, options: { drafts?: boolean } = {}): Compiled {
  const { result, asked } = recording(() => compileNow(dir, component, options));
  return { ...result, asked };
}
function compileNow(dir: string, component: string | undefined, options: { drafts?: boolean }): Compiled {
  const { program, components } = loadProgram(dir, options);
  const name = component ?? (components.length === 1 ? components[0] : undefined);
  if (name === undefined) {
    if (components.length === 0) return { program, problems: [...program.problems] };
    throw new Error(`コンポーネントが複数あります (${components.join(", ")})。どれを読むかを指定してください`);
  }
  const unit = program.units.find((u) => u.kind === "service" && u.id === name);
  if (!unit) throw new Error(`コンポーネント "${name}" がありません (あるのは: ${components.join(", ")})`);
  const builder = new Builder(program);
  const ir = builder.irOf(unit);
  const problems = [...program.problems, ...interpretationProblems(program, builder.units), ...builder.problems];
  // the IR's meaning has no prose left (a safety net behind the reader)
  if (!problems.some((p) => p.severity === "error")) {
    for (const found of shapeProblems(ir)) problems.push({ severity: "error", code: "ir-shape", where: unit.exportName, message: found });
    for (const warning of usageWarnings(ir)) {
      const match = /^warning\[unused\] (\S+): (.*)$/.exec(warning);
      if (match) problems.push({ severity: "warning", code: "unused", where: match[1], message: match[2] });
    }
  }
  return { ir, unit, program, problems };
}
