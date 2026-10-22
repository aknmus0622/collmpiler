// Whether the spec of one of the framework's own components decides what its Stage 0 decides (SELF_HOSTING.md: "Passing
// verification does not license a replacement — compare against Stage 0 first"). The questions are those the
// framework asks (stage1.ts), many of them, put both to Stage 0 and to the spec itself (spec-adapter.ts). Used before an
// interpretation of a self component is accepted, and before code is generated from it.

import fc from "fast-check";
import { isDeepStrictEqual } from "node:util";
import { chooseCaseStage0 } from "../choose.ts";
import { freshStage0, increasingStage0, survivesRestartStage0 } from "../promise.ts";
import { amongStage0, numberCandidatesStage0, stringCandidatesStage0 } from "../candidates.ts";
import { observationsEqualStage0 } from "../observe.ts";
import { changedFileStage0, mutationSiteStage0, partFileStage0, removedInputStage0, sandboxFileStage0, testsStage0, wiringStage0 } from "../rules.ts";
import { callStage0 } from "./outcome.ts";
import { overlayStage0 } from "./overlay.ts";
import { fillStage0 } from "./fills.ts";
import { subsetStage0 } from "./subset.ts";
import { promiseStage0, rowStage0 } from "./declared.ts";
import { traceStage0 } from "./trace.ts";
import { reportedStage0 } from "./reported.ts";
import { usageStage0 } from "./usage.ts";
import { fitStage0 } from "./types.ts";
import { notes8Stage0, sections8Stage0, typeText8Stage0 } from "./generate.ts";
import type { TypeFacts8 } from "./generate.ts";
import { verdictStage0 } from "./verdict.ts";
import { GLUE } from "./stage1.ts";
import type { Adapter8 } from "./pbt.ts";
import type { Ir8 } from "./ir.ts";
import { specAdapter } from "./spec-adapter.ts";

type Case = { question: unknown; stage0: unknown; ask: (adapter: Adapter8) => Promise<unknown> };
const bool = fc.boolean();
const glue = (component: string, question: unknown) => (adapter: Adapter8) => GLUE[component](adapter, question);
const query = (name: string, input: Record<string, unknown>) => async (adapter: Adapter8) => {
  await adapter.setupIsolation({});
  try {
    return await adapter.executeQuery!({ name, input });
  } finally {
    await adapter.teardownIsolation();
  }
};

const CASES: Record<string, fc.Arbitrary<Case>> = {
  "step-choice": fc.uniqueArray(fc.constantFrom<string>("a", "b", "c", "d"), { maxLength: 4 }).chain((names) =>
    fc.subarray(names).map((holding) => {
      const question = { names, holding };
      return { question, stage0: chooseCaseStage0(names, (n) => holding.includes(n)), ask: glue("step-choice", question) };
    }),
  ),
  "promise-keeper": fc.oneof(
    fc.record({ drawn: fc.integer({ min: -1000, max: 1000 }), previous: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: null }), delta: fc.integer({ min: 0, max: 100 }) }).map((q) => {
      const question = { kind: "increasing", ...q, max: null };
      return { question, stage0: increasingStage0(q.drawn, q.previous, q.delta, null), ask: glue("promise-keeper", question) };
    }),
    fc.oneof(
      fc.record({ drawn: fc.integer({ min: 0, max: 4 }), used: fc.array(fc.integer({ min: 0, max: 4 }), { maxLength: 4 }) }),
      fc.record({ drawn: fc.constantFrom("a", "b", "a#1"), used: fc.array(fc.constantFrom("a", "b", "a#1", "a#2"), { maxLength: 4 }) }),
    ).map((q) => {
      const question = { kind: "fresh", ...q };
      return { question, stage0: freshStage0(q.drawn, q.used), ask: glue("promise-keeper", question) };
    }),
    bool.map((durable) => ({ question: { kind: "survives", durable }, stage0: survivesRestartStage0(durable), ask: glue("promise-keeper", { kind: "survives", durable }) })),
  ),
  "input-candidates": fc.oneof(
    fc.record({ texts: fc.array(fc.constantFrom("a", "b", "", "Gold"), { maxLength: 4 }), numbers: fc.array(fc.constantFrom(-2, 0, 1, 2, 99, 100, 10000, 10001), { maxLength: 4 }) }).map((q) => {
      const question = { kind: "strings", ...q };
      return { question, stage0: stringCandidatesStage0(q.texts, q.numbers), ask: glue("input-candidates", question) };
    }),
    fc.record({ integer: bool, min: fc.option(fc.integer({ min: -4, max: 13 }), { nil: null }), max: fc.option(fc.integer({ min: -4, max: 13 }), { nil: null }), around: fc.array(fc.integer({ min: -4, max: 13 }), { maxLength: 4 }) }).map((q) => {
      const question = { kind: "numbers", ...q };
      return { question, stage0: numberCandidatesStage0(q.integer, q.min, q.max, q.around), ask: glue("input-candidates", question) };
    }),
    fc.record({ pick: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }), usable: fc.array(bool, { maxLength: 5 }) }).map((q) => {
      const question = { kind: "among", ...q };
      return { question, stage0: amongStage0(q.pick, q.usable), ask: glue("input-candidates", question) };
    }),
  ),
  "observation-compare": fc
    .record({
      expected: fc.record({ state: fc.constant(null), effects: fc.array(fc.record({ port: fc.constantFrom("a.X", "a.Y"), args: fc.constantFrom({}, { n: 1 }, { n: 2 }) }), { maxLength: 2 }), output: fc.constantFrom(null, "ok", 1, { r: "x" }) }),
      actual: fc.record({ state: fc.constant(null), effects: fc.array(fc.record({ port: fc.constantFrom("a.X", "a.Y"), args: fc.constantFrom({}, { n: 1 }, { n: 2 }) }), { maxLength: 2 }), output: fc.constantFrom(null, "ok", 1, { r: "x" }) }),
      answers: bool,
    })
    .map((q) => ({ question: q, stage0: observationsEqualStage0(q.expected, q.actual, q.answers), ask: glue("observation-compare", q) })),
  "outcome-apply": fc.record({ external: bool, guard: fc.constantFrom("none", "holds", "not") as fc.Arbitrary<"none" | "holds" | "not">, touched: bool }).map((q) => ({ question: q, stage0: callStage0(q), ask: glue("outcome-apply", q) })),
  "overlay-check": fc
    .record({ existing: fc.constantFrom("none", "prose", "code", "interpretation") as fc.Arbitrary<"none">, sameHeading: bool, closedHeading: bool, layer1Only: bool })
    .map((q) => ({ question: q, stage0: overlayStage0(q), ask: glue("overlay-check", q) })),
  "fill-check": fc
    .record({ kind: fc.constantFrom("is", "does", "value") as fc.Arbitrary<"is">, inline: bool, entry: fc.constantFrom("none", "elsewhere", "prose", "method", "expression") as fc.Arbitrary<"none">, byInterpretation: bool })
    .map((q) => ({ question: q, stage0: fillStage0(q), ask: glue("fill-check", q) })),
  "syntax-check": fc.constantFrom("for", "while", "do", "let", "var", "try", "throw", "switch", "function", "class", "await", "async", "yield", "new", "delete", "typeof", "in", "instanceof", "break", "continue", "if", "const", "return", "this", "x", "").map((word) => ({ question: { word }, stage0: subsetStage0(word), ask: glue("syntax-check", { word }) })),
  "type-check": fc.oneof(
    fc.record({ fresh: bool, increasing: bool, integer: bool, hasParams: bool }).map((f) => ({ question: { promise: f }, stage0: promiseStage0(f), ask: glue("type-check", { promise: f }) })),
    fc.record({ last: bool, otherwise: bool, constantCells: bool, sameColumns: bool }).map((f) => ({ question: { row: f }, stage0: rowStage0(f), ask: glue("type-check", { row: f }) })),
  ),
  "sentence-trace": fc.oneof(
    fc.record({ kind: fc.constant("sentence" as const), covered: bool, added: bool }),
    fc.record({ kind: fc.constant("key" as const), inDescription: bool }),
    fc.record({ kind: fc.constant("target" as const), exists: bool }),
    fc.record({ kind: fc.constant("embedded" as const), isComponent: bool, used: bool }),
  ).map((f) => ({ question: f, stage0: traceStage0(f), ask: glue("sentence-trace", f) })),
  "checker-verdict": fc
    .record({ kind: fc.constantFrom("property", "defined", "requires", "reach", "skipped") as fc.Arbitrary<"property">, status: fc.constantFrom("holds", "broken", "reached", "unreachable", "out-of-range", "skipped") as fc.Arbitrary<"holds"> })
    .map((f) => ({ question: f, stage0: reportedStage0(f), ask: glue("checker-verdict", f) })),
  "usage-check": fc.record({ kind: fc.constantFrom("state", "query", "command") as fc.Arbitrary<"state">, read: bool, written: bool }).map((f) => ({ question: f, stage0: usageStage0(f), ask: glue("usage-check", f) })),
  "fit-check": fc
    .record({
      value: fc.constantFrom("int", "string", "bool", "json", "enum", "atom", "record", "list", "set", "map", "optional", "any", "null", "void", "temporal") as fc.Arbitrary<"int">,
      target: fc.constantFrom("int", "string", "bool", "json", "enum", "atom", "record", "list", "set", "map", "optional", "any", "null", "void", "temporal") as fc.Arbitrary<"int">,
      base: fc.constantFrom("int", "string", "bool", "none") as fc.Arbitrary<"int">,
      subset: bool,
      sameSort: bool,
    })
    .map((f) => ({ question: f, stage0: fitStage0(f), ask: glue("fit-check", f) })),
  "gate-rules": fc.oneof(
    fc.record({ hidden: bool, toolchain: bool, toolchainIntact: bool, regular: bool, phase: fc.constantFrom("design", "wiring", "implementation") as fc.Arbitrary<"design">, isAdapter: bool, isSource: bool, input: bool, inputIntact: bool }).map((f) => ({ question: f, stage0: sandboxFileStage0(f), ask: query("SandboxFile", f) })),
    fc.record({ phase: fc.constantFrom("design", "wiring", "implementation") as fc.Arbitrary<"design">, isAdapter: bool, isSource: bool }).map((f) => ({ question: f, stage0: removedInputStage0(f), ask: query("Removed", f) })),
    fc.record({ changed: bool, existedBefore: bool }).map((f) => ({ question: f, stage0: partFileStage0(f), ask: query("PartFile", f) })),
    fc.record({ passed: bool, unimplemented: bool, error: fc.constantFrom("none", "not-implemented", "other") as fc.Arbitrary<"none"> }).map((f) => ({ question: f, stage0: wiringStage0(f), ask: query("Wiring", f) })),
    fc.record({ passed: bool, purpose: fc.constantFrom("implementation", "regression") as fc.Arbitrary<"implementation"> }).map((f) => ({ question: f, stage0: testsStage0(f), ask: query("Tests", f) })),
    fc.record({ changed: bool, usedByThis: bool, inert: bool, usedByOthers: bool }).map((f) => ({ question: f, stage0: changedFileStage0(f), ask: query("ChangedFile", f) })),
    fc.record({ executedByThis: bool, executedByOthers: bool, fileUsedByThis: bool, fileUsedByOthers: bool }).map((f) => ({ question: f, stage0: mutationSiteStage0(f), ask: query("Site", f) })),
  ),
  "text-plan": fc.oneof(
    fc
      .record({
        kind: fc.constantFrom("int", "string", "bool", "json", "enum", "atom", "optional", "list", "set", "map", "record") as fc.Arbitrary<TypeFacts8["kind"]>,
        name: fc.constantFrom("MemberId", "BookId"),
        inner: fc.constantFrom("number", "string", "A | B", "{ a: number }"),
        key: fc.constantFrom("string", "MemberId"),
        entries: fc.array(fc.record({ name: fc.constantFrom("a", "b-c", "id"), text: fc.constantFrom("number", "string | null"), plain: bool }), { maxLength: 3 }),
        members: fc.array(fc.constantFrom('"a"', '"b"', "1"), { maxLength: 3 }),
      })
      .map((f) => ({ question: f, stage0: typeText8Stage0(f), ask: query("TypeText", f) })),
    fc.record({ promise: fc.constantFrom("none", "fresh", "increasing") as fc.Arbitrary<"none">, mayFail: bool }).map((f) => ({ question: f, stage0: notes8Stage0(f), ask: query("Notes", f) })),
    fc.record({ answering: fc.nat(3), queries: fc.nat(3), routes: fc.nat(3), restarts: bool, sorts: fc.nat(3), json: bool }).map((f) => ({ question: f, stage0: sections8Stage0(f), ask: query("Sections", f) })),
  ),
};

// mutation-judge and mutation-verdict are sequences, driven like their glue
type JudgeEvent = { name: string; input: Record<string, unknown> };
const judgeEvents = fc
  .tuple(
    // a value appears in the adapter only as a number
    fc.array(fc.record({ numeric: bool, inAdapter: bool, sites: fc.array(bool, { maxLength: 3 }) }).map((v) => ({ ...v, inAdapter: v.numeric && v.inAdapter })), { maxLength: 3 }),
    fc.array(bool, { maxLength: 4 }),
    bool,
  )
  .map(([values, mutants, shared]) => [
    ...values.flatMap((v) => [{ name: "BeginValue", input: { numeric: v.numeric, inAdapter: v.inAdapter } }, ...v.sites.map((killed) => ({ name: "Site", input: { killed } })), { name: "EndValue", input: {} }]),
    ...mutants.map((killed) => ({ name: "Mutant", input: { killed } })),
    { name: "Finish", input: { shared } },
  ]);

export type Disagreement = { component: string; question: unknown; stage0: unknown; spec: unknown };

/** The questions on which the spec of a self component and its Stage 0 differ (empty when they agree on all tried). */
export async function agreement(component: string, ir: Ir8, numRuns = 500): Promise<Disagreement[]> {
  const adapter = specAdapter(ir);
  const found: Disagreement[] = [];
  const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
  if (component === "mutation-judge") {
    const { judgeStage0 } = await import("../mutation.ts");
    await fc.assert(
      fc.asyncProperty(judgeEvents, async (events: JudgeEvent[]) => {
        const stage0 = judgeStage0(events as never).map((r) => `${r.code}@${events.indexOf(r.event as never)}`);
        const reports: string[] = [];
        let index = -1;
        await adapter.setupIsolation({ verdict: { Survived: () => void reports.push(`survived@${index}`), InAdapter: () => void reports.push(`in-adapter@${index}`), Ineffective: () => void reports.push(`ineffective@${index}`) } });
        try {
          for (const event of events) {
            index++;
            await adapter.executeCommand(event);
          }
        } finally {
          await adapter.teardownIsolation();
        }
        if (!same(stage0, reports)) found.push({ component, question: events, stage0, spec: reports });
        return true;
      }),
      { numRuns, seed: 1 },
    );
    return found.slice(0, 5);
  }
  if (component === "mutation-verdict") {
    const runs = fc.array(fc.record({ kind: fc.constantFrom(3, "x", true, null), results: fc.array(fc.record({ changed: bool, enablementDiffers: bool }), { minLength: 3, maxLength: 3 }) }), { maxLength: 3 });
    const { judgeWithAdapter } = await import("./stage1.ts");
    await fc.assert(
      fc.asyncProperty(runs, async (values) => {
        const trials = values.map((v, i) => ({ where: `v${i}`, value: v.kind as string | number | boolean | null, run: async (extra: number) => v.results[extra] }));
        const stage0 = await verdictStage0(trials);
        const spec = await judgeWithAdapter(adapter, trials);
        if (!same(stage0, spec)) found.push({ component, question: values, stage0, spec });
        return true;
      }),
      { numRuns, seed: 1 },
    );
    return found.slice(0, 5);
  }
  const cases = CASES[component];
  if (!cases) return [];
  await fc.assert(
    fc.asyncProperty(cases, async (c) => {
      let spec: unknown;
      try {
        spec = await c.ask(adapter);
      } catch (error) {
        spec = { error: error instanceof Error ? error.message : String(error) };
      }
      if (typeof spec === "symbol") return true;
      if (!same(c.stage0, spec)) found.push({ component, question: c.question, stage0: c.stage0, spec });
      return true;
    }),
    { numRuns, seed: 1 },
  );
  // the same question once
  const seen = new Set<string>();
  return found.filter((d) => (seen.has(JSON.stringify(d.question)) ? false : (seen.add(JSON.stringify(d.question)), true))).slice(0, 8);
}
