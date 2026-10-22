// Comparing two interpretations of the same Layer 1 (DSL.md §17.1, "読み違いの見つけ方"): both are run on the same
// random sequences, and every entry and aspect (whether it runs, what it answers, each effect, their order) where
// they part is reported with the shortest sequence that shows it. The comparison is of behaviour, not of text, so
// the two may name their conditions and state differently.

import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { SpecError } from "./eval.ts";
import type { Ir8 } from "./ir.ts";
import { Simulation, entryName, literalsOf, stepArbitrary, MAX_STEPS } from "./pbt.ts";
import type { Observed8, RawStep, Step8 } from "./pbt.ts";

export type Seen = Observed8 | { error: string } | { skipped: true };
export type Difference8 = { command: string; aspect: string; steps: Step8[]; first: Seen; other: Seen };

const isObserved = (seen: Seen): seen is Observed8 => "effects" in seen;

function advance(sim: Simulation, raw: RawStep): { name: string; seen: Seen; alive: boolean } {
  const name = entryName(sim.ir, sim.entries[raw.entry].qualified);
  try {
    if (raw.restart) sim.restart();
    const planned = sim.step(raw);
    return planned ? { name, seen: planned.expected, alive: true } : { name, seen: { skipped: true }, alive: true };
  } catch (error) {
    if (error instanceof SpecError) return { name, seen: { error: error.message }, alive: false };
    throw error;
  }
}

function aspectsOf(x: Seen, y: Seen): string[] {
  if (!isObserved(x) || !isObserved(y)) return isDeepStrictEqual(x, y) ? [] : ["runs"];
  const found: string[] = [];
  if (!isDeepStrictEqual(x.output, y.output)) found.push("output");
  const ports = new Set([...x.effects, ...y.effects].map((e) => e.port));
  const of = (effects: Observed8["effects"], port: string) => effects.filter((e) => e.port === port);
  for (const port of [...ports].sort()) if (!isDeepStrictEqual(of(x.effects, port), of(y.effects, port))) found.push(`effect:${port}`);
  if (!found.some((a) => a.startsWith("effect:")) && !isDeepStrictEqual(x.effects, y.effects)) found.push("order");
  return found;
}

/** Where two interpretations behave differently. Both must have the same entries (the boundary is fixed for the second one). */
export async function compare8(first: Ir8, second: Ir8, params: { seed?: number; numRuns?: number } = {}): Promise<Difference8[]> {
  const hints = literalsOf(first);
  const other = literalsOf(second);
  const merged = { strings: [...new Set([...hints.strings, ...other.strings])].sort(), numbers: [...new Set([...hints.numbers, ...other.numbers])].sort((a, b) => a - b) };
  const sequences = fc.array(stepArbitrary(first, merged), { maxLength: MAX_STEPS });
  const walk = (raw: RawStep[], only: string, aspect: string): Difference8 | undefined => {
    const a = new Simulation(first);
    const b = new Simulation(second);
    for (const step of raw) {
      const x = advance(a, step);
      const y = advance(b, step);
      const aspects = aspectsOf(x.seen, y.seen);
      if (x.name === only && aspects.includes(aspect)) return { command: only, aspect, steps: structuredClone(a.steps.length >= b.steps.length ? a.steps : b.steps), first: x.seen, other: y.seen };
      if (!x.alive || !y.alive || aspects.includes("runs")) return undefined;
    }
    return undefined;
  };
  const differences: Difference8[] = [];
  const names = new Simulation(first).entries.map((e) => entryName(first, e.qualified));
  const ports = Object.entries(first.components).flatMap(([id, c]) => Object.keys(c.external?.commands ?? {}).map((p) => `effect:${id}.${p}`));
  for (const command of names) {
    for (const aspect of ["runs", "output", ...ports.sort(), "order"]) {
      const details = await fc.check(fc.property(sequences, (raw) => walk(raw, command, aspect) === undefined), { numRuns: 300, seed: params.seed ?? 1, ...(params.numRuns ? { numRuns: params.numRuns } : {}) });
      if (!details.failed || !details.counterexample) continue;
      const found = walk(details.counterexample[0], command, aspect);
      if (found) differences.push(found);
    }
  }
  return differences;
}

export const aspectLabel8 = (aspect: string) =>
  aspect === "runs" ? "実行できるかどうか" : aspect === "output" ? "答え" : aspect === "order" ? "外の世界へのコマンドの順序" : `外の世界へのコマンド ${aspect.slice("effect:".length)}`;

export const describeDifference8 = (difference: Difference8, session: number) => {
  const path = difference.steps.map((step) => `${step.name}(${JSON.stringify(step.input)}${Object.keys(step.answers).length ? ` 外の世界: ${JSON.stringify(step.answers)}` : ""})`).join(" → ");
  return `${session} つ目の解釈と食い違う (${difference.command}、${aspectLabel8(difference.aspect)}): ${path}。1つ目: ${JSON.stringify(difference.first)}、${session} つ目: ${JSON.stringify(difference.other)}`;
};
