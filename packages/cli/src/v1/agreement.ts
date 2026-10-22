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

/** One kind of question: how its inputs are drawn, and the question (Stage 0's answer, how to ask) for an input. */
type Variant = { inputs: fc.Arbitrary<unknown>; toCase: (input: never) => Case };
const variant = <I>(inputs: fc.Arbitrary<I>, toCase: (input: I) => Case): Variant => ({ inputs, toCase: toCase as (input: never) => Case });

export const VARIANTS: Record<string, Variant[]> = {
  "step-choice": [
    variant(
      fc.uniqueArray(fc.constantFrom<string>("a", "b", "c", "d"), { maxLength: 4 }).chain((names) => fc.subarray(names).map((holding) => ({ names, holding }))),
      (question) => ({ question, stage0: chooseCaseStage0(question.names, (n) => question.holding.includes(n)), ask: glue("step-choice", question) }),
    ),
  ],
  "promise-keeper": [
    variant(fc.record({ drawn: fc.integer({ min: -1000, max: 1000 }), previous: fc.option(fc.integer({ min: -1000, max: 1000 }), { nil: null }), delta: fc.integer({ min: 0, max: 100 }) }), (q) => {
      const question = { kind: "increasing", ...q, max: null };
      return { question, stage0: increasingStage0(q.drawn, q.previous, q.delta, null), ask: glue("promise-keeper", question) };
    }),
    variant(
      fc.oneof(
        fc.record({ drawn: fc.integer({ min: 0, max: 4 }) as fc.Arbitrary<number | string>, used: fc.array(fc.integer({ min: 0, max: 4 }) as fc.Arbitrary<number | string>, { maxLength: 4 }) }),
        fc.record({ drawn: fc.constantFrom("a", "b", "a#1") as fc.Arbitrary<number | string>, used: fc.array(fc.constantFrom("a", "b", "a#1", "a#2") as fc.Arbitrary<number | string>, { maxLength: 4 }) }),
      ),
      (q) => {
        const question = { kind: "fresh", ...q };
        return { question, stage0: freshStage0(q.drawn, q.used), ask: glue("promise-keeper", question) };
      },
    ),
    variant(bool, (durable) => ({ question: { kind: "survives", durable }, stage0: survivesRestartStage0(durable), ask: glue("promise-keeper", { kind: "survives", durable }) })),
  ],
  "input-candidates": [
    variant(fc.record({ texts: fc.array(fc.constantFrom("a", "b", "", "Gold"), { maxLength: 4 }), numbers: fc.array(fc.constantFrom(-2, 0, 1, 2, 99, 100, 10000, 10001), { maxLength: 4 }) }), (q) => {
      const question = { kind: "strings", ...q };
      return { question, stage0: stringCandidatesStage0(q.texts, q.numbers), ask: glue("input-candidates", question) };
    }),
    variant(
      fc.record({ integer: bool, min: fc.option(fc.integer({ min: -4, max: 13 }), { nil: null }), max: fc.option(fc.integer({ min: -4, max: 13 }), { nil: null }), around: fc.array(fc.integer({ min: -4, max: 13 }), { maxLength: 4 }) }),
      (q) => {
        const question = { kind: "numbers", ...q };
        return { question, stage0: numberCandidatesStage0(q.integer, q.min, q.max, q.around), ask: glue("input-candidates", question) };
      },
    ),
    variant(fc.record({ pick: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }), usable: fc.array(bool, { maxLength: 5 }) }), (q) => {
      const question = { kind: "among", ...q };
      return { question, stage0: amongStage0(q.pick, q.usable), ask: glue("input-candidates", question) };
    }),
  ],
  "observation-compare": [
    variant(
      fc
        .record({
          expected: fc.record({ state: fc.constant(null), effects: fc.array(fc.record({ port: fc.constantFrom("a.X", "a.Y"), args: fc.constantFrom({}, { n: 1 }, { n: 2 }) }), { maxLength: 2 }), output: fc.constantFrom(null, "ok", 1, { r: "x" }) }),
          actual: fc.record({ state: fc.constant(null), effects: fc.array(fc.record({ port: fc.constantFrom("a.X", "a.Y"), args: fc.constantFrom({}, { n: 1 }, { n: 2 }) }), { maxLength: 2 }), output: fc.constantFrom(null, "ok", 1, { r: "x" }) }),
          answers: bool,
        })
        // as plain JSON: fc.record's objects are not what an observation is (isDeepStrictEqual compares prototypes)
        .map((drawn) => JSON.parse(JSON.stringify(drawn)) as typeof drawn),
      (q) => ({ question: q, stage0: observationsEqualStage0(q.expected, q.actual, q.answers), ask: glue("observation-compare", q) }),
    ),
  ],
  "outcome-apply": [
    variant(fc.record({ external: bool, guard: fc.constantFrom("none", "holds", "not") as fc.Arbitrary<"none" | "holds" | "not">, touched: bool }), (q) => ({ question: q, stage0: callStage0(q), ask: glue("outcome-apply", q) })),
  ],
  "overlay-check": [
    variant(fc.record({ existing: fc.constantFrom("none", "prose", "code", "interpretation") as fc.Arbitrary<"none">, sameHeading: bool, closedHeading: bool, layer1Only: bool }), (q) => ({ question: q, stage0: overlayStage0(q), ask: glue("overlay-check", q) })),
  ],
  "fill-check": [
    variant(
      fc.record({ kind: fc.constantFrom("is", "does", "value") as fc.Arbitrary<"is">, inline: bool, entry: fc.constantFrom("none", "elsewhere", "prose", "method", "expression") as fc.Arbitrary<"none">, byInterpretation: bool }),
      (q) => ({ question: q, stage0: fillStage0(q), ask: glue("fill-check", q) }),
    ),
  ],
  "syntax-check": [
    variant(
      fc.constantFrom("for", "while", "do", "let", "var", "try", "throw", "switch", "function", "class", "await", "async", "yield", "new", "delete", "typeof", "in", "instanceof", "break", "continue", "if", "const", "return", "this", "x", ""),
      (word) => ({ question: { word }, stage0: subsetStage0(word), ask: glue("syntax-check", { word }) }),
    ),
  ],
  "type-check": [
    variant(fc.record({ fresh: bool, increasing: bool, integer: bool, hasParams: bool }), (f) => ({ question: { promise: f }, stage0: promiseStage0(f), ask: glue("type-check", { promise: f }) })),
    variant(fc.record({ last: bool, otherwise: bool, constantCells: bool, sameColumns: bool }), (f) => ({ question: { row: f }, stage0: rowStage0(f), ask: glue("type-check", { row: f }) })),
  ],
  "sentence-trace": [
    variant(
      fc.oneof(
        fc.record({ kind: fc.constant("sentence" as const), covered: bool, added: bool }),
        fc.record({ kind: fc.constant("key" as const), inDescription: bool }),
        fc.record({ kind: fc.constant("target" as const), exists: bool }),
        fc.record({ kind: fc.constant("embedded" as const), isComponent: bool, used: bool }),
      ),
      (f) => ({ question: f, stage0: traceStage0(f), ask: glue("sentence-trace", f) }),
    ),
  ],
  "checker-verdict": [
    variant(
      fc.record({ kind: fc.constantFrom("property", "defined", "requires", "reach", "skipped") as fc.Arbitrary<"property">, status: fc.constantFrom("holds", "broken", "reached", "unreachable", "out-of-range", "skipped") as fc.Arbitrary<"holds"> }),
      (f) => ({ question: f, stage0: reportedStage0(f), ask: glue("checker-verdict", f) }),
    ),
  ],
  "usage-check": [
    variant(fc.record({ kind: fc.constantFrom("state", "query", "command") as fc.Arbitrary<"state">, read: bool, written: bool }), (f) => ({ question: f, stage0: usageStage0(f), ask: glue("usage-check", f) })),
  ],
  "fit-check": [
    variant(
      fc.record({
        value: fc.constantFrom("int", "string", "bool", "json", "enum", "atom", "record", "list", "set", "map", "optional", "any", "null", "void", "temporal") as fc.Arbitrary<"int">,
        target: fc.constantFrom("int", "string", "bool", "json", "enum", "atom", "record", "list", "set", "map", "optional", "any", "null", "void", "temporal") as fc.Arbitrary<"int">,
        base: fc.constantFrom("int", "string", "bool", "none") as fc.Arbitrary<"int">,
        subset: bool,
        sameSort: bool,
      }),
      (f) => ({ question: f, stage0: fitStage0(f), ask: glue("fit-check", f) }),
    ),
  ],
  "gate-rules": [
    variant(
      fc.record({ hidden: bool, toolchain: bool, toolchainIntact: bool, regular: bool, phase: fc.constantFrom("design", "wiring", "implementation") as fc.Arbitrary<"design">, isAdapter: bool, isSource: bool, input: bool, inputIntact: bool }),
      (f) => ({ question: f, stage0: sandboxFileStage0(f), ask: query("SandboxFile", f) }),
    ),
    variant(fc.record({ phase: fc.constantFrom("design", "wiring", "implementation") as fc.Arbitrary<"design">, isAdapter: bool, isSource: bool }), (f) => ({ question: f, stage0: removedInputStage0(f), ask: query("Removed", f) })),
    variant(fc.record({ changed: bool, existedBefore: bool }), (f) => ({ question: f, stage0: partFileStage0(f), ask: query("PartFile", f) })),
    variant(fc.record({ passed: bool, unimplemented: bool, error: fc.constantFrom("none", "not-implemented", "other") as fc.Arbitrary<"none"> }), (f) => ({ question: f, stage0: wiringStage0(f), ask: query("Wiring", f) })),
    variant(fc.record({ passed: bool, purpose: fc.constantFrom("implementation", "regression") as fc.Arbitrary<"implementation"> }), (f) => ({ question: f, stage0: testsStage0(f), ask: query("Tests", f) })),
    variant(fc.record({ changed: bool, usedByThis: bool, inert: bool, usedByOthers: bool }), (f) => ({ question: f, stage0: changedFileStage0(f), ask: query("ChangedFile", f) })),
    variant(fc.record({ executedByThis: bool, executedByOthers: bool, fileUsedByThis: bool, fileUsedByOthers: bool }), (f) => ({ question: f, stage0: mutationSiteStage0(f), ask: query("Site", f) })),
  ],
  "text-plan": [
    variant(
      fc.record({
        kind: fc.constantFrom("int", "string", "bool", "json", "enum", "atom", "optional", "list", "set", "map", "record") as fc.Arbitrary<TypeFacts8["kind"]>,
        name: fc.constantFrom("MemberId", "BookId"),
        inner: fc.constantFrom("number", "string", "A | B", "{ a: number }"),
        key: fc.constantFrom("string", "MemberId"),
        // up to 12: a record or an enumeration of any size is written whole
        entries: fc.array(fc.record({ name: fc.constantFrom("a", "b-c", "id"), text: fc.constantFrom("number", "string | null"), plain: bool }), { maxLength: 12 }),
        members: fc.array(fc.constantFrom('"a"', '"b"', "1"), { maxLength: 12 }),
      }),
      (f) => ({ question: f, stage0: typeText8Stage0(f), ask: query("TypeText", f) }),
    ),
    variant(fc.record({ promise: fc.constantFrom("none", "fresh", "increasing") as fc.Arbitrary<"none">, mayFail: bool }), (f) => ({ question: f, stage0: notes8Stage0(f), ask: query("Notes", f) })),
    variant(fc.record({ answering: fc.nat(3), queries: fc.nat(3), routes: fc.nat(3), restarts: bool, sorts: fc.nat(3), json: bool }), (f) => ({ question: f, stage0: sections8Stage0(f), ask: query("Sections", f) })),
  ],
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
const same = (a: unknown, b: unknown) => isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));

/** The components whose questions are sequences: how one is drawn, and both answers to it. */
const SEQUENCES: Record<string, { inputs: fc.Arbitrary<unknown>; answers: (adapter: Adapter8, input: never) => Promise<{ stage0: unknown; spec: unknown }> }> = {
  "mutation-judge": {
    inputs: judgeEvents,
    answers: async (adapter, events: JudgeEvent[]) => {
      const { judgeStage0 } = await import("../mutation.ts");
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
      return { stage0, spec: reports };
    },
  },
  "mutation-verdict": {
    inputs: fc.array(fc.record({ kind: fc.constantFrom(3, "x", true, null), results: fc.array(fc.record({ changed: bool, enablementDiffers: bool }), { minLength: 3, maxLength: 3 }) }), { maxLength: 3 }),
    answers: async (adapter, values: { kind: unknown; results: { changed: boolean; enablementDiffers: boolean }[] }[]) => {
      const { judgeWithAdapter } = await import("./stage1.ts");
      const trials = values.map((v, i) => ({ where: `v${i}`, value: v.kind as string | number | boolean | null, run: async (extra: number) => v.results[extra] }));
      return { stage0: await verdictStage0(trials), spec: await judgeWithAdapter(adapter, trials) };
    },
  },
};

/** A case of a case file (R3): which kind of question (for components with several), and its input. */
export type CaseInput = { variant?: number; input: unknown };

/** Both answers to one case: Stage 0's, and the adapter's (the spec's, or generated code's). */
async function answersTo(component: string, adapter: Adapter8, c: CaseInput): Promise<{ question: unknown; stage0: unknown; spec: unknown } | undefined> {
  const sequence = SEQUENCES[component];
  if (sequence) return { question: c.input, ...(await sequence.answers(adapter, c.input as never)) };
  const v = VARIANTS[component]?.[c.variant ?? 0];
  if (!v) throw new Error(`${component} に、問いの種類 ${c.variant ?? 0} はありません`);
  const built = v.toCase(c.input as never);
  let spec: unknown;
  try {
    spec = await built.ask(adapter);
  } catch (error) {
    spec = { error: error instanceof Error ? error.message : String(error) };
  }
  // a question outside the component's domain (stage1.ts's OUT): Stage 0 decides it
  if (typeof spec === "symbol") return undefined;
  return { question: built.question, stage0: built.stage0, spec };
}

/** Inputs drawn for a case file: every kind of question, the same inputs for the same seed. */
export function sampleCases(component: string, perVariant = 60, seed = 1): CaseInput[] {
  const sequence = SEQUENCES[component];
  if (sequence) return fc.sample(sequence.inputs, { numRuns: perVariant * 3, seed }).map((input) => ({ input: JSON.parse(JSON.stringify(input)) }));
  const variants = VARIANTS[component];
  if (!variants) throw new Error(`${component} には、問いがありません`);
  const unique = (inputs: unknown[]) => [...new Map(inputs.map((x) => [JSON.stringify(x), JSON.parse(JSON.stringify(x ?? null)) as unknown])).values()];
  return variants.flatMap((v, index) => unique(fc.sample(v.inputs, { numRuns: perVariant, seed })).map((input) => (variants.length > 1 ? { variant: index, input } : { input })));
}

/** The cases on which an adapter (generated code) and Stage 0 differ. */
export async function disagreementsOn(component: string, adapter: Adapter8, cases: CaseInput[]): Promise<Disagreement[]> {
  const found: Disagreement[] = [];
  for (const c of cases) {
    const answered = await answersTo(component, adapter, c);
    if (answered && !same(answered.stage0, answered.spec)) found.push({ component, ...answered });
  }
  return found;
}

/** The questions on which the spec of a self component and its Stage 0 differ (empty when they agree on all tried). */
export async function agreement(component: string, ir: Ir8, numRuns = 500): Promise<Disagreement[]> {
  const adapter = specAdapter(ir);
  const found: Disagreement[] = [];
  const sequence = SEQUENCES[component];
  const variants = VARIANTS[component];
  if (!sequence && !variants) return [];
  const inputs: fc.Arbitrary<CaseInput> = sequence
    ? sequence.inputs.map((input) => ({ input }))
    : fc.oneof(...variants.map((v, index) => v.inputs.map((input) => ({ variant: index, input }))));
  await fc.assert(
    fc.asyncProperty(inputs, async (c) => {
      found.push(...(await disagreementsOn(component, adapter, [c])));
      return true;
    }),
    { numRuns, seed: 1 },
  );
  // the same question once
  const seen = new Set<string>();
  return found.filter((d) => (seen.has(JSON.stringify(d.question)) ? false : (seen.add(JSON.stringify(d.question)), true))).slice(0, 8);
}
