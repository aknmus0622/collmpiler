// Spec mutation for 1.0 (the counterpart of 0.3's `observability`): before any agent runs, each constant the mutation
// gate will break in production code (a decision-table cell, a constant answered or sent to the outside world) is
// changed in the IR, and the spec is run on the same sequences (the fixed traces, then random ones). A constant whose
// change shows nowhere cannot be verified in an implementation: the gate would reject a correct implementation, or
// the check would be pushed out of it. That is a spec problem, and stops here.

import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { SpecError } from "./eval.ts";
import type { Expr, Ir8, TraceStep } from "./ir.ts";
import { Simulation, fixedSteps, literalsOf, sequencesFrom, stepArbitrary } from "./pbt.ts";
import type { RawStep } from "./pbt.ts";

export type Site = { where: string; value: string | number | boolean; mutate: (ir: Ir8) => void };
export type Unobservable = { where: string; value: unknown; verdict: "unobserved" | "rare" | "precondition"; severity: "error" | "warning" };

/** The constants the mutation gate breaks, each with how to change it in a copy of the IR. */
export function sitesOf(ir: Ir8): Site[] {
  const sites: Site[] = [];
  const changed = (v: string | number | boolean) => (typeof v === "number" ? v + 1 : typeof v === "boolean" ? !v : `${v}~`);
  // a constant inside an expression: a number, or ["lit", string]
  const visit = (where: string, get: (ir: Ir8) => unknown, set: (ir: Ir8, value: unknown) => void) => {
    const walk = (path: (string | number)[], node: unknown) => {
      const at = (target: Ir8) => path.reduce<unknown>((x, k) => (x as Record<string | number, unknown>)[k], get(target));
      if (typeof node === "number" || typeof node === "boolean") {
        sites.push({
          where: `${where}${path.length ? `[${path.join("][")}]` : ""}`,
          value: node,
          mutate: (target) => {
            if (path.length === 0) return set(target, changed(node));
            const parent = path.slice(0, -1).reduce<unknown>((x, k) => (x as Record<string | number, unknown>)[k], get(target)) as Record<string | number, unknown>;
            parent[path[path.length - 1]] = changed(node);
          },
        });
        void at;
        return;
      }
      if (!Array.isArray(node)) {
        if (typeof node === "object" && node !== null) for (const [k, v] of Object.entries(node)) walk([...path, k], v);
        return;
      }
      if (node[0] === "lit" && typeof node[1] === "string") {
        sites.push({
          where: `${where}${path.length ? `[${path.join("][")}]` : ""}`,
          value: node[1],
          mutate: (target) => {
            const lit = path.reduce<unknown>((x, k) => (x as Record<string | number, unknown>)[k], get(target)) as unknown[];
            lit[1] = changed(node[1] as string);
          },
        });
        return;
      }
      if (["state", "var", "cond", "calc", "decide", "ask", "outputOf", "field"].includes(node[0] as string)) {
        node.forEach((x, i) => typeof x === "object" && x !== null && !Array.isArray(x) && walk([...path, i], x));
        return;
      }
      node.forEach((x, i) => i > 0 && walk([...path, i], x));
    };
    walk([], get(ir));
  };
  for (const [id, c] of Object.entries(ir.components)) {
    for (const [name, table] of Object.entries(c.decisions ?? {})) {
      table.rows.forEach((row, r) => {
        for (const column of Object.keys(row.then)) {
          visit(`${id}.decisions.${name}[${r}].${column}`, (x) => x.components[id].decisions![name].rows[r].then[column], (x, v) => (x.components[id].decisions![name].rows[r].then[column] = v as Expr));
        }
      });
    }
    for (const [name, event] of Object.entries(c.events ?? {})) {
      if (event.output !== undefined) visit(`${id}.events.${name}.output`, (x) => x.components[id].events![name].output, (x, v) => (x.components[id].events![name].output = v as Expr));
      event.calls.forEach((call, i) => {
        if (!ir.components[call.component]?.external) return;
        for (const arg of Object.keys(call.args)) {
          visit(`${id}.events.${name}.calls[${i}].${arg}`, (x) => x.components[id].events![name].calls[i].args[arg], (x, v) => (x.components[id].events![name].calls[i].args[arg] = v as Expr));
        }
      });
    }
  }
  return sites;
}

type Shown = "shows" | "precondition" | "none";
/** Runs both on the same steps. Whether some observation differs, or only whether a step was in the spec. */
function differs(original: Ir8, mutant: Ir8, raw: RawStep[]): Shown {
  const a = new Simulation(original);
  const b = new Simulation(mutant);
  let precondition = false;
  for (const step of raw) {
    let x: unknown;
    let y: unknown;
    try {
      if (step.restart) a.restart();
      x = a.step(step) ?? "outside";
    } catch (error) {
      if (!(error instanceof SpecError)) throw error;
      return "none";
    }
    try {
      if (step.restart) b.restart();
      y = b.step(step) ?? "outside";
    } catch (error) {
      if (!(error instanceof SpecError)) throw error;
      return "shows";
    }
    const seen = (v: unknown) => (v === "outside" ? v : (v as { expected: unknown }).expected);
    if ((x === "outside") !== (y === "outside")) precondition = true;
    else if (!isDeepStrictEqual(seen(x), seen(y))) return "shows";
  }
  return precondition ? "precondition" : "none";
}

export function observability8(ir: Ir8, params: { seed: number; numRuns?: number; traces?: { steps: TraceStep[] }[] }): Unobservable[] {
  const found: Unobservable[] = [];
  const fixed = (params.traces ?? []).map((t) => fixedSteps(ir, t.steps)).filter((t): t is RawStep[] => t !== undefined);
  const sequences = sequencesFrom(ir, fixed, stepArbitrary(ir, literalsOf(ir)));
  for (const site of sitesOf(ir)) {
    const mutant = structuredClone(ir);
    site.mutate(mutant);
    let precondition = false;
    const tryUnder = (seed: number): boolean => {
      for (const raw of fixed) {
        const shown = differs(ir, mutant, raw);
        if (shown === "shows") return true;
        if (shown === "precondition") precondition = true;
      }
      const details = fc.check(
        fc.property(sequences, (raw) => {
          const shown = differs(ir, mutant, raw);
          if (shown === "precondition") precondition = true;
          return shown !== "shows";
        }),
        { seed, numRuns: params.numRuns ?? 1000 },
      );
      return details.failed;
    };
    if (tryUnder(params.seed)) continue;
    const rare = [params.seed + 1, params.seed + 2].some(tryUnder);
    const verdict = rare ? "rare" : precondition ? "precondition" : "unobserved";
    found.push({ where: site.where, value: site.value, verdict, severity: rare || typeof site.value === "boolean" ? "warning" : "error" });
  }
  return found;
}

export const describeUnobservable8 = (found: Unobservable) =>
  `${found.where} = ${JSON.stringify(found.value)}: ${
    found.verdict === "rare"
      ? "この値を変えても、検証のシードでは結果が変わりません（ほかのシードでは変わります）。検証で確かめられないことがあります"
      : found.verdict === "precondition"
        ? "この値を変えると、手順が仕様の範囲 (requires) に入るかどうかだけが変わります。答えや外の世界へのコマンドには現れないので、実装では確かめられません"
        : "この値を変えても、仕様の答えも外の世界へのコマンドも変わりません。実装では確かめられない値です（使われない列、届かないしきい値、詰め物の値など）"
  }`;
