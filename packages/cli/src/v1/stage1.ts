// Stage 1 for 1.0: the framework's own decisions made by code generated from its own specs (packages/cli/self/specs),
// used through the generated adapter contracts, never by importing their production code.
//
// The reader and the oracle run synchronously, so they decide with Stage 0 and record each question (decide.ts); the
// questions are then put to the generated components here, and every answer must agree (R4). The procedures that are
// already turned inside out (the pipeline, `clp interpret`, spec mutation, the contract's text) are driven by Stage 1
// directly, as in 0.3. When generated code cannot be used (no pass record for the specs and code as they are, it does
// not load, it throws, the question is outside its spec), Stage 0 decides alone and a warning says why.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isSource } from "../layout.ts";
import type { Workspace } from "../layout.ts";
import { hashFiles, staleness } from "../verified.ts";
import { leavesOf } from "../observe.ts";
import type { Observed } from "../observe.ts";
import type { Deciders8 } from "./decide.ts";
import type { Adapter8 } from "./pbt.ts";
import type { Trial, Unobservable } from "./verdict.ts";
import { EXTRA_SEEDS } from "./verdict.ts";
import { contractFacts8, registerPlan8, typeText8Stage0 } from "./generate.ts";
import type { NoteId8, Sections8 } from "./generate.ts";
import type { Ir8 } from "./ir.ts";

/** Where the framework's own components live (specs, generated production code, test side). */
export const SELF = new URL("../../self/", import.meta.url);
const adapterUrl = (component: string) => new URL(`clp/${component}.adapter.ts`, SELF).href;

// --- grading components (SELF_HOSTING.md §10.3) and their Stage 0 files (relative to packages/cli/src) ---
export const R1_COMPONENTS8: Record<string, readonly string[]> = {
  "mutation-judge": ["mutation.ts"],
  "gate-rules": ["rules.ts"],
  "observation-compare": ["observe.ts"],
  "step-choice": ["choose.ts"],
  "promise-keeper": ["promise.ts"],
  "outcome-apply": ["v1/outcome.ts"],
  "input-candidates": ["candidates.ts"],
};
export const stage0HashOf8 = (component: string) => hashFiles(fileURLToPath(new URL("..", import.meta.url)), R1_COMPONENTS8[component] ?? []);
const GRADING = "CLP_GRADING_BY_STAGE0";
export const isGradingByStage0 = () => process.env[GRADING] === "1";
/** R1: while a grading component is being rebuilt, every grading decision is Stage 0's (also in verification subprocesses). */
export const setGradingByStage0 = (on: boolean) => void (on ? (process.env[GRADING] = "1") : delete process.env[GRADING]);

const warned = new Set<string>();
export function fallback(component: string, error: unknown): undefined {
  const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
  if (!warned.has(`${component}: ${reason}`)) {
    warned.add(`${component}: ${reason}`);
    console.error(`注意: Stage 1 (生成したコード) の ${component} を実行できないので、Stage 0 (手書き) で続けます: ${reason}`);
  }
  return undefined;
}

/** The generated adapter of a component of the framework, if its pass record is current. */
export async function adapterOf(component: string): Promise<Adapter8 | undefined> {
  if (process.env.CLP_STAGE === "0") return undefined;
  const record = fileURLToPath(new URL(`clp/${component}.verified.json`, SELF));
  const specs = fileURLToPath(new URL("specs", SELF));
  if (!existsSync(fileURLToPath(new URL(`clp/${component}.adapter.ts`, SELF)))) return fallback(component, new Error("生成したコードがありません"));
  const grading = component in R1_COMPONENTS8 ? { stage0: stage0HashOf8(component) } : undefined;
  const stale = staleness(record, specs, grading);
  if (stale !== undefined) return fallback(component, new Error(stale));
  try {
    return ((await import(adapterUrl(component))) as { adapter: Adapter8 }).adapter;
  } catch (error) {
    return fallback(component, error);
  }
}

type Ports = Record<string, Record<string, (input?: Record<string, unknown>) => unknown>>;
/** One isolation: commands in order, then (optionally) a query; the query's answer. */
async function ask(adapter: Adapter8, ports: Ports, commands: { name: string; input: Record<string, unknown> }[], query?: { name: string; input: Record<string, unknown> }): Promise<unknown> {
  await adapter.setupIsolation(ports);
  try {
    let answer: unknown;
    for (const command of commands) answer = await adapter.executeCommand(command);
    if (query) answer = await adapter.executeQuery!(query);
    return answer;
  } finally {
    await adapter.teardownIsolation();
  }
}

// Serialized: generated components keep module state
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

// --- the questions of the reader and the oracle, put to Stage 1 (in the shape of Stage 0's answer) ---

type Glue = (adapter: Adapter8, question: any) => Promise<unknown>;
const inRange = (n: unknown, min: number, max: number) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
const OUT = Symbol("outside the component's spec");

export const GLUE: Record<string, Glue> = {
  "step-choice": async (adapter, q: { names: string[]; holding: string[] }) => {
    const answer = (await ask(
      adapter,
      { oracle: { Holds: (input) => q.holding.includes(String(input?.name)) } },
      [{ name: "BeginCases", input: {} }, ...q.names.map((name) => ({ name: "Case", input: { name } }))],
      { name: "Decision", input: {} },
    )) as { chosen: string | null; otherwise: boolean; conflict: string[] };
    return { chosen: answer.otherwise ? "otherwise" : answer.chosen, conflict: answer.conflict };
  },
  "promise-keeper": async (adapter, q: { kind: string; [k: string]: unknown }) => {
    if (q.kind === "increasing") {
      if (!inRange(q.drawn, -1000, 1000) || !inRange(q.delta, 0, 100)) return OUT;
      return ask(adapter, {}, [], { name: "Increasing", input: { drawn: q.drawn, previous: q.previous, delta: q.delta, max: q.max } });
    }
    if (q.kind === "survives") return (await ask(adapter, {}, [], { name: "Restart", input: { durable: q.durable } })) === "keep";
    const drawn = q.drawn;
    const used = q.used as unknown[];
    if (typeof drawn === "number" ? !inRange(drawn, 0, 4) || used.some((u) => !inRange(u, 0, 4)) : used.some((u) => typeof u !== "string")) return OUT;
    const begin = typeof drawn === "number" ? { name: "BeginFreshNumber", input: { drawn } } : { name: "BeginFreshText", input: { drawn } };
    const given = used.map((u) => (typeof u === "number" ? { name: "UsedNumber", input: { answered: u } } : { name: "UsedText", input: { answered: u } }));
    return ask(adapter, {}, [begin, ...given], { name: "Fresh", input: {} });
  },
  "input-candidates": async (adapter, q: { kind: string; [k: string]: unknown }) => {
    if (q.kind === "strings") {
      const numbers = q.numbers as number[];
      if (numbers.some((n) => !inRange(n, -2, 10002))) return OUT;
      return ask(adapter, {}, [{ name: "BeginStrings", input: {} }, ...(q.texts as string[]).map((text) => ({ name: "Text", input: { text } })), ...numbers.map((number) => ({ name: "LengthNumber", input: { number } }))], { name: "DecideStrings", input: {} });
    }
    if (q.kind === "numbers") {
      const around = q.around as number[];
      if (around.some((n) => !inRange(n, -4, 13))) return OUT;
      return ask(adapter, {}, [{ name: "BeginNumbers", input: { integer: q.integer, min: q.min, max: q.max } }, ...around.map((value) => ({ name: "Around", input: { around: value } }))], { name: "DecideNumbers", input: {} });
    }
    return ask(adapter, {}, [{ name: "BeginAmong", input: { pick: q.pick } }, ...(q.usable as boolean[]).map((usable) => ({ name: "Item", input: { usable } }))], { name: "DecideAmong", input: {} });
  },
  "observation-compare": async (adapter, q: { expected: Observed; actual: Observed; answers: boolean }) => {
    const answered = "output" in q.actual && q.actual.output !== undefined;
    return ask(
      adapter,
      {},
      [
        { name: "Begin", input: { answers: q.answers, answered } },
        ...[...leavesOf(q.expected)].map((leaf) => ({ name: "Expected", input: { leaf } })),
        ...[...leavesOf(q.actual)].map((leaf) => ({ name: "Actual", input: { leaf } })),
      ],
      { name: "Decide", input: {} },
    );
  },
  "outcome-apply": (adapter, q: { external: boolean; guard: string; touched: boolean }) => ask(adapter, {}, [], { name: "Call", input: q }),
  "overlay-check": (adapter, q) => ask(adapter, {}, [], { name: "Entry", input: q }),
  "fill-check": (adapter, q) => ask(adapter, {}, [], { name: "Fragment", input: q }),
  "syntax-check": (adapter, q) => ask(adapter, {}, [], { name: "Word", input: q }),
  "type-check": (adapter, q: { promise?: Record<string, unknown>; row?: Record<string, unknown> }) =>
    q.promise ? ask(adapter, {}, [], { name: "Promise", input: q.promise }) : ask(adapter, {}, [], { name: "Row", input: q.row! }),
  "sentence-trace": (adapter, q: { kind: string; [k: string]: unknown }) => {
    const { kind, ...input } = q;
    return ask(adapter, {}, [], { name: kind.charAt(0).toUpperCase() + kind.slice(1), input });
  },
  "checker-verdict": (adapter, q) => ask(adapter, {}, [], { name: "Verdict", input: q }),
  "usage-check": (adapter, q) => ask(adapter, {}, [], { name: "Declared", input: q }),
  "fit-check": (adapter, q: { value: string; [k: string]: unknown }) => {
    const { value, ...rest } = q;
    return ask(adapter, {}, [], { name: "Fits", input: { given: value, ...rest } });
  },
};

/** Stage 1 for every recorded question: for each component, an answer in Stage 0's shape (undefined when it cannot answer). */
export async function deciders8(options: { grading?: boolean } = {}): Promise<Deciders8> {
  const deciders: Deciders8 = {};
  for (const [component, glue] of Object.entries(GLUE)) {
    // R1: while a grading component is being rebuilt, grading is Stage 0's alone
    if (component in R1_COMPONENTS8 && (options.grading === false || isGradingByStage0())) continue;
    const adapter = await adapterOf(component);
    if (!adapter) continue;
    deciders[component] = (question) =>
      serial(async () => {
        try {
          const answer = await glue(adapter, question);
          return answer === OUT ? undefined : answer;
        } catch (error) {
          return fallback(component, error);
        }
      });
  }
  return deciders;
}

// --- procedures driven by Stage 1 ---

/** mutation-verdict: asks for runs, reports what does not show. */
export async function judgeTrials(trials: Trial[]): Promise<Unobservable[] | undefined> {
  const adapter = await adapterOf("mutation-verdict");
  if (!adapter) return undefined;
  return serial(async () => {
    try {
      return await judgeWithAdapter(adapter, trials);
    } catch (error) {
      return fallback("mutation-verdict", error);
    }
  });
}
export async function judgeWithAdapter(adapter: Adapter8, trials: Trial[]): Promise<Unobservable[]> {
  {
    {
      const found: Unobservable[] = [];
      const requested: ({ name: "RunTrials"; extra: number } | { name: "Report"; verdict: Unobservable["verdict"]; severity: Unobservable["severity"] })[] = [];
      await adapter.setupIsolation({
        runs: {
          RunTrials: (input?: Record<string, unknown>) => void requested.push({ name: "RunTrials", extra: Number(input?.extra) }),
          Report: (input?: Record<string, unknown>) => void requested.push({ name: "Report", verdict: input?.verdict as Unobservable["verdict"], severity: input?.severity as Unobservable["severity"] }),
        },
      });
      try {
        for (const trial of trials) {
          requested.length = 0;
          await adapter.executeCommand({ name: "Begin", input: { kind: trial.value === null ? "null" : typeof trial.value } });
          let runs = 0;
          while (requested.length > 0) {
            const request = requested.shift()!;
            if (request.name === "Report") {
              found.push({ where: trial.where, value: trial.value, verdict: request.verdict, severity: request.severity });
              continue;
            }
            if (++runs > 1 + EXTRA_SEEDS) throw new Error(`mutation-verdict が、${trial.where} について試行を ${runs} 回頼みました`);
            await adapter.executeCommand({ name: "Tried", input: await trial.run(request.extra) });
          }
        }
      } finally {
        await adapter.teardownIsolation();
      }
      return found;
    }
  }
}

/** text-plan: the contract's text decisions for an IR, made beforehand and registered (the contract is written synchronously). */
export async function planContract8(ir: Ir8): Promise<void> {
  const adapter = await adapterOf("text-plan");
  if (!adapter) return;
  await serial(async () => {
    try {
      const facts = contractFacts8(ir);
      const types = new Map<string, string>();
      for (const fact of facts.types) {
        const key = JSON.stringify(fact);
        if (!types.has(key)) types.set(key, (await ask(adapter, {}, [], { name: "TypeText", input: fact })) as string);
      }
      const notes = new Map<string, NoteId8[]>();
      for (const fact of facts.notes) notes.set(JSON.stringify(fact), (await ask(adapter, {}, [], { name: "Notes", input: fact })) as NoteId8[]);
      const sections = new Map<string, Sections8>([[JSON.stringify(facts.sections), (await ask(adapter, {}, [], { name: "Sections", input: facts.sections })) as Sections8]]);
      registerPlan8(ir, { types, notes, sections });
    } catch (error) {
      fallback("text-plan", error);
    }
  });
  void typeText8Stage0;
}

// --- the gate's verdicts (grading components): Stage 0 always judges; Stage 1, when usable, too; the stricter wins ---

async function graded<R>(component: string, run: (adapter: Adapter8) => Promise<R>, stage0: R, strict: (a: R, b: R) => R, same: (a: R, b: R) => boolean): Promise<R> {
  if (isGradingByStage0()) return stage0;
  const adapter = await adapterOf(component);
  if (!adapter) return stage0;
  let stage1: R;
  try {
    stage1 = await serial(() => run(adapter));
  } catch (error) {
    fallback(component, error);
    return stage0;
  }
  if (!same(stage0, stage1)) console.error(`注意: 採点の判断が、Stage 0 と Stage 1 (${component}) で食い違いました。厳しい側を取ります`);
  return strict(stage0, stage1);
}

/** gate-rules: one question (a query of the component) with the facts. */
export function gateVerdict8<R>(name: string, facts: object, stage0: R, strict: (a: R, b: R) => R): Promise<R> {
  return graded("gate-rules", (adapter) => ask(adapter, {}, [], { name, input: facts as Record<string, unknown> }) as Promise<R>, stage0, strict, (a, b) => JSON.stringify(a) === JSON.stringify(b));
}

type JudgeEvent = { name: string; input: Record<string, unknown> };
type JudgeReport<E> = { code: "survived" | "in-adapter" | "ineffective"; event: E };
/** mutation-judge: the events of a mutation report; what both stages report is reported (union). */
export function judgeDecided8<E extends JudgeEvent>(events: E[], stage0: JudgeReport<E>[]): Promise<JudgeReport<E>[]> {
  const key = (found: JudgeReport<E>) => `${found.code}\u0000${events.indexOf(found.event)}`;
  const union = (a: JudgeReport<E>[], b: JudgeReport<E>[]) => {
    const seen = new Set(a.map(key));
    return [...a, ...b.filter((found) => !seen.has(key(found)))].sort((x, y) => events.indexOf(x.event) - events.indexOf(y.event));
  };
  const same = (a: JudgeReport<E>[], b: JudgeReport<E>[]) => a.length === b.length && a.every((found, index) => key(found) === key(b[index]));
  const run = async (adapter: Adapter8) => {
    const found: JudgeReport<E>[] = [];
    let current: E;
    const report = (code: JudgeReport<E>["code"]) => () => void found.push({ code, event: current });
    await adapter.setupIsolation({ verdict: { Survived: report("survived"), InAdapter: report("in-adapter"), Ineffective: report("ineffective") } });
    try {
      for (const event of events) {
        current = event;
        await adapter.executeCommand({ name: event.name, input: event.input });
      }
    } finally {
      await adapter.teardownIsolation();
    }
    return found;
  };
  return graded("mutation-judge", run, stage0, union, same);
}

// --- R3: the cases of a grading component, run through the new code and Stage 0 (in a subprocess: it loads new code) ---

const CLP_BIN = fileURLToPath(new URL("../../bin/clp.ts", import.meta.url));
export function runCases(specsDir: string, ws: Workspace, component: string): { problem?: string; unexecuted: string[] } {
  const cases = join(specsDir, "..", "cases", `${component}.json`);
  if (!existsSync(cases)) return { problem: `事例の集まりがありません (${cases})`, unexecuted: [] };
  const coverage = mkdtempSync(join(tmpdir(), "clp-cases-"));
  try {
    const run = spawnSync(process.execPath, [CLP_BIN, "__cases", "--component", component, "--adapter", join(ws.root, ws.paths.adapter), "--cases", cases], {
      encoding: "utf8",
      timeout: 300_000,
      env: { ...process.env, NODE_V8_COVERAGE: coverage },
    });
    if (run.status !== 0) return { problem: `事例を流せませんでした: ${(run.stderr ?? "").trim().slice(-500)}`, unexecuted: [] };
    const result = JSON.parse(run.stdout) as { problem?: string };
    return { ...result, unexecuted: unexecutedFunctions(coverage, ws) };
  } finally {
    rmSync(coverage, { recursive: true, force: true });
  }
}
// 本番コードのうち、読み込まれたファイルの中で、一度も呼ばれなかった関数（モジュールそのものは除く）
function unexecutedFunctions(dir: string, ws: Workspace): string[] {
  type Fn = { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] };
  const root = realpathSync(ws.root);
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const report = JSON.parse(readFileSync(join(dir, name), "utf8")) as { result?: { url: string; functions: Fn[] }[] };
    for (const script of report.result ?? []) {
      if (!script.url.startsWith("file://")) continue;
      const rel = relative(root, fileURLToPath(script.url)).split(sep).join("/");
      if (rel.startsWith("..") || !isSource(ws, rel) || script.functions.length === 0) continue;
      const size = (fn: Fn) => fn.ranges[0].endOffset - fn.ranges[0].startOffset;
      const module = script.functions.reduce((widest, fn) => (size(fn) > size(widest) ? fn : widest));
      // 読み出し (get / set) は、判断ではないので数えない（状態を外から見るためのもの）
      for (const fn of script.functions) {
        if (fn !== module && fn.ranges[0].count === 0 && fn.functionName !== "" && !/^[gs]et /.test(fn.functionName)) found.push(`${rel}: ${fn.functionName}`);
      }
    }
  }
  return [...new Set(found)].sort();
}
