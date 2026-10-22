// Property-based tests of 1.0 (DSL.md §17.13 ③): random sequences of the entries (commands and queries driven from
// outside), the expected observation computed by evaluating the IR (eval.ts), the production system driven through the
// adapter. The outside world is the harness's stand-in, answering what the implementation and the spec ask with the
// same values and keeping the promises written in the spec.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import fc from "fast-check";
import { FAILED, OutOfSpec, SpecError, answer, brokenProperties, execute, fromPlain, initialWorld, keyOf, plain } from "./eval.ts";
import type { Answers, Effect, World } from "./eval.ts";
import type { Expr, Ir8, Port, TraceStep, Type } from "./ir.ts";
import { freshStage0, increasingStage0, survivesRestartStage0 } from "../promise.ts";
import { amongStage0, numberCandidatesStage0, stringCandidatesStage0 } from "../candidates.ts";
import { observationsEqualStage0 } from "../observe.ts";
import { FrameworkError, agree, decided, recordingAsync } from "./decide.ts";
import type { Asked, Deciders8 } from "./decide.ts";

export type Adapter8 = {
  setupIsolation(ports: unknown): Promise<void>;
  teardownIsolation(): Promise<void>;
  executeCommand(command: { name: string; input: Record<string, unknown> }): Promise<unknown>;
  executeQuery?(query: { name: string; input: Record<string, unknown> }): Promise<unknown>;
  restartSystem?(): Promise<void>;
};

/** The name an entry goes by in the contract: the root's own commands and queries bare, a part's with its name (`members.Register`). */
export const entryName = (ir: Ir8, qualified: string) => (qualified.startsWith(`${ir.root}.`) ? qualified.slice(ir.root.length + 1) : qualified);

// --- What to generate ---

type Hints = { strings: string[]; numbers: number[] };
/** The numbers and strings written in the spec. Inputs mix them in: a threshold or a keyword is almost never hit at random. */
export function literalsOf(ir: Ir8): Hints {
  const strings = new Set<string>();
  const numbers = new Set<number>();
  const walk = (x: unknown) => {
    if (typeof x === "number") numbers.add(x);
    else if (Array.isArray(x)) {
      if (x[0] === "lit" && typeof x[1] === "string") strings.add(x[1]);
      else if (x[0] === "lit") walk(x[1]);
      else x.forEach(walk);
    } else if (typeof x === "object" && x !== null) Object.values(x).forEach(walk);
  };
  for (const c of Object.values(ir.components)) {
    for (const part of [c.init, c.events, c.queries, c.conditions, c.calcs, c.decisions, c.commands]) walk(part);
    // the values of enumerations, too
    const types = (t: unknown) => {
      if (typeof t === "object" && t !== null && "enum" in t) for (const v of (t as { enum: unknown[] }).enum) if (typeof v === "string") strings.add(v);
      if (typeof t === "object" && t !== null) Object.values(t).forEach(types);
    };
    types(c.state);
  }
  return { strings: [...strings].sort(), numbers: [...numbers].filter(Number.isFinite).sort((a, b) => a - b) };
}

/** A drawn atom: which one is decided when the step runs (one already seen, three times in four, or a new one). */
type RawAtom = { $atom: number };
const isRawAtom = (x: unknown): x is RawAtom => typeof x === "object" && x !== null && "$atom" in x;

/** The bounds `requires` puts on an integer parameter, from its top-level conjunction (`amount >= 1 && amount <= 100`). */
export function boundsOf(requires: Expr | undefined, param: string): { min: number | null; max: number | null } {
  const bounds: { min: number | null; max: number | null } = { min: null, max: null };
  const visit = (e: Expr | undefined) => {
    if (!Array.isArray(e)) return;
    if (e[0] === "and") return e.slice(1).forEach((x) => visit(x as Expr));
    if (!["<", "<=", ">", ">="].includes(e[0] as string)) return;
    const isParam = (x: unknown) => Array.isArray(x) && x[0] === "var" && x[1] === param;
    const constant = (x: unknown) => (typeof x === "number" ? x : Array.isArray(x) && x[0] === "neg" && typeof x[1] === "number" ? -x[1] : undefined);
    // written as param op c, or c op param (turned around)
    const [op, c] = isParam(e[1]) ? [e[0] as string, constant(e[2])] : isParam(e[2]) ? [{ "<": ">", "<=": ">=", ">": "<", ">=": "<=" }[e[0] as string]!, constant(e[1])] : [undefined, undefined];
    if (op === undefined || c === undefined) return;
    if (op === ">=" || op === ">") bounds.min = Math.max(bounds.min ?? -Infinity, op === ">" ? c + 1 : c);
    else bounds.max = Math.min(bounds.max ?? Infinity, op === "<" ? c - 1 : c);
  };
  visit(requires);
  return bounds;
}

function arbitraryOf(type: Type, hints: Hints, bounds: { min: number | null; max: number | null } = { min: null, max: null }): fc.Arbitrary<unknown> {
  if (type === "bool") return fc.boolean();
  if (type === "json") return fc.jsonValue({ maxDepth: 2 }).map((v) => JSON.parse(JSON.stringify(v)) as unknown);
  if (type === "int") {
    // within what `requires` allows: a value outside it is outside the spec, and the step would only be skipped
    const { min, max } = bounds.min !== null && bounds.max !== null && bounds.min > bounds.max ? { min: null, max: null } : bounds;
    const { limits, thresholds } = decided("input-candidates", { kind: "numbers", integer: true, min, max, around: hints.numbers }, numberCandidatesStage0(true, min, max, hints.numbers));
    const base = fc.integer({ min: min ?? Math.min(-1000, max ?? -1000), max: max ?? Math.max(1000, min ?? 1000) });
    const known = [...new Set([...limits, ...thresholds])];
    return known.length ? fc.oneof({ weight: 2, arbitrary: base }, { weight: 3, arbitrary: fc.constantFrom(...known) }) : base;
  }
  if (type === "string") {
    const { known, lengths } = decided("input-candidates", { kind: "strings", texts: hints.strings, numbers: hints.numbers }, stringCandidatesStage0(hints.strings, hints.numbers));
    const choices: fc.WeightedArbitrary<unknown>[] = [{ weight: 2, arbitrary: fc.string() }];
    if (known.length) choices.push({ weight: 2, arbitrary: fc.constantFrom(...known) });
    if (lengths.length) choices.push({ weight: 1, arbitrary: fc.constantFrom(...lengths).map((n) => "x".repeat(n)) });
    return choices.length === 1 ? fc.string() : fc.oneof(...choices);
  }
  if ("enum" in type) return fc.constantFrom(...type.enum);
  if ("atom" in type) return fc.nat().map((n): RawAtom => ({ $atom: n }));
  if ("optional" in type) return fc.option(arbitraryOf(type.optional, hints), { nil: null, freq: 4 });
  if ("list" in type) return fc.array(arbitraryOf(type.list, hints), { maxLength: 4 });
  if ("set" in type) return fc.array(arbitraryOf(type.set, hints), { maxLength: 4 });
  if ("map" in type) return fc.array(fc.tuple(arbitraryOf(type.map[0], hints), arbitraryOf(type.map[1], hints)), { maxLength: 4 });
  return fc.record(Object.fromEntries(Object.entries(type.record).map(([k, t]) => [k, arbitraryOf(t, hints)])));
}

/** Atoms of every sort seen so far in a trial, and new ones. */
class Atoms {
  private seen = new Map<string, string[]>();
  private next = new Map<string, number>();
  /** One already seen (three times in four), or a new one. Which, is decided by input-candidates (Stage 0: candidates.ts). */
  pick(sort: string, n: number): string {
    const pool = this.seen.get(sort) ?? [];
    const question = { kind: "among", pick: n % 4 === 0 ? null : n >> 2, usable: pool.map(() => true) };
    const position = decided("input-candidates", question, amongStage0(question.pick, question.usable));
    return position === null ? this.make(sort) : pool[position];
  }
  make(sort: string): string {
    const k = this.next.get(sort) ?? 0;
    this.next.set(sort, k + 1);
    const atom = `${sort}-${k}`;
    this.remember(sort, atom);
    return atom;
  }
  remember(sort: string, atom: string) {
    const pool = this.seen.get(sort) ?? [];
    if (!pool.includes(atom)) this.seen.set(sort, [...pool, atom]);
  }
}

/** A drawn value as a value of its type: atoms picked, sets and maps built. */
function resolveRaw(raw: unknown, type: Type, atoms: Atoms): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof type === "string" || "enum" in type) return raw;
  if ("atom" in type) {
    if (typeof raw === "string") {
      atoms.remember(type.atom, raw);
      return raw;
    }
    return atoms.pick(type.atom, (raw as RawAtom).$atom);
  }
  if ("optional" in type) return resolveRaw(raw, type.optional, atoms);
  if ("list" in type) return (raw as unknown[]).map((x) => resolveRaw(x, type.list, atoms));
  if ("set" in type) return fromPlain((raw as unknown[]).map((x) => resolveRaw(x, type.set, atoms)), type);
  if ("map" in type) {
    const pairs = (raw as [unknown, unknown][]).map(([k, v]) => ({ key: resolveRaw(k, type.map[0], atoms), value: resolveRaw(v, type.map[1], atoms) }));
    return fromPlain(pairs, type);
  }
  return Object.fromEntries(Object.entries(type.record).map(([k, t]) => [k, resolveRaw((raw as Record<string, unknown>)[k], t, atoms)]));
}

/** An answer for a fixed trace that does not say (the trace did not depend on it). */
function defaultOf(type: Type, atoms: Atoms): unknown {
  if (type === "int") return 0;
  if (type === "string") return "";
  if (type === "bool") return false;
  if (type === "json") return null;
  if ("enum" in type) return type.enum[0];
  if ("atom" in type) return atoms.make(type.atom);
  if ("optional" in type) return null;
  if ("list" in type || "set" in type || "map" in type) return resolveRaw([], type, atoms);
  return Object.fromEntries(Object.entries(type.record).map(([k, t]) => [k, defaultOf(t, atoms)]));
}

// --- Steps ---

type Entry = { qualified: string; component: string; name: string; kind: "command" | "query"; params: Record<string, Type>; output?: Type };
export function entriesOf(ir: Ir8): Entry[] {
  const make = (qualified: string, kind: "command" | "query"): Entry => {
    const [component, name] = qualified.split(".") as [string, string];
    const c = ir.components[component];
    const def = kind === "command" ? c.commands![name] : c.queries![name];
    return { qualified, component, name, kind, params: def.params, output: kind === "command" ? (def as { output?: Type }).output : (def as { result: Type }).result };
  };
  return [...ir.entries.commands.map((q) => make(q, "command")), ...ir.entries.queries.map((q) => make(q, "query"))];
}

type OutsideQuery = { id: string; port: Port };
export function outsideQueries(ir: Ir8): OutsideQuery[] {
  return Object.entries(ir.components).flatMap(([component, c]) =>
    Object.entries(c.external?.queries ?? {}).map(([name, port]) => ({ id: `${component}.${name}`, port })),
  );
}
const restartsIn = (ir: Ir8) => Object.values(ir.components).some((c) => c.durable);

export type RawStep = {
  entry: number;
  params: Record<string, unknown>;
  /** per outside query: the drawn answer (a function of the arguments for a query with parameters) */
  answers: Record<string, unknown>;
  deltas: Record<string, number>;
  failures: Record<string, unknown>;
  restart: boolean;
  /**
   * Parameters drawn for every entry, and where to start looking: when the chosen entry is outside the spec in the
   * current state (`requires`), the step runs the next entry, from \`fallback\` on, that is inside it (what 0.3 did by
   * choosing among the enabled commands). Without it, deep states were rarely reached in a few steps.
   */
  alternatives?: Record<string, unknown>[];
  fallback?: number;
  /** A step of a fixed trace (an example, or a trace Alloy found): the answers of the outside world as given, promises already kept. */
  fixed?: true;
};

/** A trace in the common format (an example, or a trace from the checker) as steps to replay. */
export function fixedSteps(ir: Ir8, trace: TraceStep[]): RawStep[] | undefined {
  const entries = entriesOf(ir);
  const steps: RawStep[] = [];
  let answers: Record<string, unknown> = {};
  for (const step of trace) {
    if (step.event === "answers") {
      answers = { ...answers, ...(step.answers ?? {}) };
      continue;
    }
    const index = entries.findIndex((e) => entryName(ir, e.qualified) === step.event || e.qualified === step.event);
    if (index < 0) return undefined;
    const given = { ...answers, ...(step.answers ?? {}) };
    const failures = Object.fromEntries(Object.entries(given).filter(([, v]) => v === "(failed)").map(([k]) => [k, true]));
    steps.push({ entry: index, params: step.params, answers: given, deltas: {}, failures, restart: false, fixed: true });
  }
  return steps;
}

export function stepArbitrary(ir: Ir8, hints: Hints = literalsOf(ir)): fc.Arbitrary<RawStep> {
  const entries = entriesOf(ir);
  const outside = outsideQueries(ir);
  // a path segment of a route (`/things/:id`) cannot be "." or "..": URLs normalize them away, so HTTP cannot carry them (outside the spec)
  const inPath = (entry: Entry) => new Set([...(ir.components[entry.component].routes?.[entry.name] ?? "").matchAll(/:(\w+)/g)].map((m) => m[1]));
  const paramsOf = (entry: Entry) => {
    const path = inPath(entry);
    const c = ir.components[entry.component];
    const requires = entry.kind === "command" ? c.commands?.[entry.name]?.requires : c.queries?.[entry.name]?.requires;
    const of = (k: string, t: Type) => arbitraryOf(t, hints, boundsOf(requires, k));
    return fc.record(Object.fromEntries(Object.entries(entry.params).map(([k, t]) => [k, path.has(k) ? of(k, t).filter((v) => v !== "." && v !== "..") : of(k, t)])));
  };
  const choose = fc.oneof(
    ...entries.map((entry, index) => ({
      weight: entry.kind === "command" ? 3 : 1,
      arbitrary: fc.record({ entry: fc.constant(index), params: paramsOf(entry) }),
    })),
  );
  const alternatives = fc.tuple(...entries.map(paramsOf));
  const answers = fc.record(
    Object.fromEntries(outside.map(({ id, port }) => [id, Object.keys(port.params).length > 0 ? fc.func(arbitraryOf(port.result, hints)) : arbitraryOf(port.result, hints)])),
  );
  const positives = hints.numbers.filter((n) => n > 0 && n <= 100_000);
  // a number of the spec, or one more: "more than N days" is reached by N + 1, not by N
  const delta = positives.length ? fc.oneof(fc.nat(3), fc.constantFrom(...positives), fc.constantFrom(...positives.map((n) => n + 1))) : fc.nat(3);
  const deltas = fc.record(Object.fromEntries(outside.filter(({ port }) => port.promise === "increasing").map(({ id }) => [id, delta])));
  const failing = fc.integer({ min: 0, max: 3 }).map((n) => n === 0);
  const failures = fc.record(
    Object.fromEntries(outside.filter(({ port }) => port.mayFail).map(({ id, port }) => [id, Object.keys(port.params).length > 0 ? fc.func(failing) : failing])),
  );
  const restart = restartsIn(ir) ? fc.integer({ min: 0, max: 5 }).map((n) => n === 0) : fc.constant(false);
  return fc.record({ choice: choose, answers, deltas, failures, restart, alternatives, fallback: fc.nat(entries.length - 1) }).map(({ choice, answers: a, deltas: d, failures: f, restart: r, alternatives: others, fallback }) => ({
    entry: choice.entry,
    params: choice.params,
    answers: a,
    deltas: d,
    failures: f,
    restart: r,
    alternatives: others,
    fallback,
  }));
}

export const MAX_STEPS = 8;
export const sequences = (ir: Ir8) => fc.array(stepArbitrary(ir), { maxLength: MAX_STEPS });
/** Random sequences, and (one in two) a fixed trace followed by a few random steps: what happens after a state that is hard to reach. */
export function sequencesFrom(ir: Ir8, fixed: RawStep[][], step: fc.Arbitrary<RawStep> = stepArbitrary(ir)): fc.Arbitrary<RawStep[]> {
  const random = fc.array(step, { maxLength: MAX_STEPS });
  if (fixed.length === 0) return random;
  const continued = fc.tuple(fc.constantFrom(...fixed), fc.array(step, { minLength: 1, maxLength: 4 })).map(([prefix, rest]) => [...prefix, ...rest]);
  return fc.oneof({ weight: 1, arbitrary: random }, { weight: 1, arbitrary: continued });
}

// --- The outside world during a trial ---

/** What the stand-ins remember across steps (and restarts): the last answer of an `increasing` query, what a `fresh` one answered. */
type Memory = { last: Record<string, number>; used: Record<string, unknown[]> };

/**
 * The answers of one step, the same for the spec and the implementation. A query without parameters gets its answer
 * at the start of the step, asked or not (so that two readings of a spec draw the same values); one with parameters,
 * when it is first asked with those arguments.
 */
function stepAnswers(ir: Ir8, raw: RawStep, memory: Memory, atoms: Atoms): { answers: Answers; asked: Record<string, unknown> } {
  const cache = new Map<string, unknown>();
  const asked: Record<string, unknown> = {};
  const ports = new Map(outsideQueries(ir).map((q) => [q.id, q.port]));
  const draw = (id: string, port: Port, args: Record<string, unknown>): unknown => {
    const hasParams = Object.keys(port.params).length > 0;
    const failure = raw.failures[id];
    const failed = hasParams ? typeof failure === "function" && (failure as (x: unknown) => boolean)(plain(args)) : failure === true;
    if (failed) return FAILED;
    if (raw.fixed) {
      // as given: a map from the argument to the answer for a query with a parameter, the value otherwise
      const given = raw.answers[id];
      if (given === undefined) return defaultOf(port.result, atoms);
      if (!hasParams) {
        const value = resolveRaw(given, port.result, atoms);
        if (port.promise === "increasing") memory.last[id] = value as number;
        if (port.promise === "fresh") memory.used[id] = [...(memory.used[id] ?? []), value];
        return value;
      }
      const key = keyOf(plain(Object.values(args)[0]));
      const found = (given as { key: unknown; value: unknown }[]).find((pair) => keyOf(pair.key) === key);
      return found ? resolveRaw(found.value, port.result, atoms) : defaultOf(port.result, atoms);
    }
    const drawn = hasParams ? (raw.answers[id] as (x: unknown) => unknown)(plain(args)) : raw.answers[id];
    let value = resolveRaw(drawn, port.result, atoms);
    if (port.promise === "increasing") {
      const question = { kind: "increasing", drawn: value as number, previous: memory.last[id] ?? null, delta: raw.deltas[id] ?? 0, max: null };
      value = decided("promise-keeper", question, increasingStage0(question.drawn, question.previous, question.delta, null));
      memory.last[id] = value as number;
    } else if (port.promise === "fresh") {
      const used = memory.used[id] ?? [];
      value = typeof port.result === "object" && "atom" in port.result ? atoms.make(port.result.atom) : decided("promise-keeper", { kind: "fresh", drawn: value, used }, freshStage0(value, used));
      memory.used[id] = [...used, value];
    }
    return value;
  };
  for (const [id, port] of [...ports].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (Object.keys(port.params).length === 0) cache.set(`${id}(${keyOf({})})`, draw(id, port, {}));
  }
  const answers: Answers = (component, query, args) => {
    const id = `${component}.${query}`;
    const port = ports.get(id);
    if (!port) throw new SpecError(`外の世界 ${component} に問い合わせ "${query}" がありません`);
    const key = `${id}(${keyOf(args)})`;
    if (!cache.has(key)) cache.set(key, draw(id, port, args));
    const value = cache.get(key);
    asked[Object.keys(port.params).length > 0 ? key : id] = value === FAILED ? "(failed)" : plain(value);
    return value;
  };
  return { answers, asked };
}

// --- The spec, step by step ---

export type Step8 = { name: string; input: Record<string, unknown>; answers: Record<string, unknown>; events: string[] };
export type Observed8 = { state: null; effects: { port: string; args: unknown }[]; output?: unknown };
export type PbtResult8 =
  | { status: "pass"; seed: number; numRuns: number; coverage: Coverage }
  | { status: "fail"; seed: number; path: string; numRuns: number; numShrinks: number; steps: Step8[]; expected: Observed8; actual: Observed8 | { error: string } }
  | { status: "error"; message: string; steps?: Step8[] };

/** How often each event happened, and which never did (DSL.md §17.13 ⑤). */
export type Coverage = { events: Record<string, number>; never: string[] };

const messageOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

function normalized(value: unknown, type: Type | undefined): unknown {
  if (type === undefined || value === undefined) return value === undefined ? null : plain(value);
  try {
    return plain(fromPlain(plain(value), type));
  } catch {
    return plain(value);
  }
}

export type Planned = { entry: Entry; step: Step8; expected: Observed8; answers: Answers };

/** The spec of one IR, run one step at a time from its initial state. */
export class Simulation {
  readonly ir: Ir8;
  readonly entries: Entry[];
  readonly steps: Step8[] = [];
  private atoms = new Atoms();
  private memory: Memory = { last: {}, used: {} };
  private world: World;
  private states: World[];
  private events: { component: string; command: string; args: Record<string, unknown> }[] = [];
  private coverage?: Record<string, number>;
  constructor(ir: Ir8, coverage?: Record<string, number>) {
    this.ir = ir;
    this.entries = entriesOf(ir);
    this.world = initialWorld(ir);
    this.states = [this.world];
    this.coverage = coverage;
  }
  /** A restart: what is durable stays, the rest starts again. The outside world remembers what it answered. */
  restart(): void {
    const initial = initialWorld(this.ir);
    const survives = (durable: boolean) => decided("promise-keeper", { kind: "survives", durable }, survivesRestartStage0(durable));
    this.world = Object.fromEntries(Object.entries(this.world).map(([id, state]) => [id, survives(this.ir.components[id].durable === true) ? state : initial[id]]));
    this.steps.push({ name: "(restart)", input: {}, answers: {}, events: [] });
  }
  /** One step. Undefined when the step is outside the spec (`requires` does not hold). A spec error is thrown, with the steps so far. */
  step(raw: RawStep): Planned | undefined {
    const drawn = stepAnswers(this.ir, raw, this.memory, this.atoms);
    const first = this.tryEntry(raw.entry, raw.params, drawn);
    if (first || !raw.alternatives) return first;
    const n = this.entries.length;
    for (let k = 0; k < n; k++) {
      const index = ((raw.fallback ?? 0) + k) % n;
      if (index === raw.entry) continue;
      const planned = this.tryEntry(index, raw.alternatives[index] ?? {}, drawn);
      if (planned) return planned;
    }
    return undefined;
  }
  private tryEntry(index: number, params: Record<string, unknown>, { answers, asked }: { answers: Answers; asked: Record<string, unknown> }): Planned | undefined {
    const ir = this.ir;
    const entry = this.entries[index];
    const args = Object.fromEntries(Object.entries(entry.params).map(([k, t]) => [k, resolveRaw(params[k], t, this.atoms)]));
    const name = entryName(ir, entry.qualified);
    let output: unknown;
    let effects: Effect[] = [];
    let happened: string[] = [];
    try {
      if (entry.kind === "command") {
        const result = execute(ir, this.world, entry.component, entry.name, args, answers);
        output = result.output;
        effects = result.effects;
        happened = result.events;
        this.events.push({ component: entry.component, command: entry.name, args });
        this.world = result.world;
      } else {
        output = answer(ir, this.world, entry.component, entry.name, args, answers);
        this.events.push({ component: entry.component, command: `?${entry.name}`, args });
      }
    } catch (error) {
      if (error instanceof OutOfSpec) return undefined;
      if (error instanceof SpecError) {
        this.steps.push({ name, input: plain(args) as Record<string, unknown>, answers: asked, events: [] });
        throw Object.assign(error, { steps: this.steps });
      }
      throw error;
    }
    this.states.push(this.world);
    for (const event of happened) if (this.coverage) this.coverage[event] = (this.coverage[event] ?? 0) + 1;
    const step: Step8 = { name, input: plain(args) as Record<string, unknown>, answers: asked, events: happened };
    this.steps.push(step);
    // invariants and temporal properties of the spec, on the trace so far
    const broken = brokenProperties(ir, { states: this.states, events: this.events });
    if (broken.length) throw Object.assign(new SpecError(`性質 ${broken.join(", ")} が成り立ちません`), { steps: this.steps });
    const expectedEffects = effects.map((e) => {
      const [component, port] = e.port.split(".");
      return { port: e.port, args: normalized(e.args, { record: ir.components[component].external!.commands[port].params }) };
    });
    const expected: Observed8 = { state: null, effects: expectedEffects, ...(entry.output !== undefined ? { output: normalized(output, entry.output) } : {}) };
    return { entry, step, expected, answers };
  }
}

/** stopAt: a trial that ends in an exception carrying this text (production code not written yet) ends there and passes. */
export type TrialOptions = { adapter?: Adapter8; coverage?: Record<string, number>; stopAt?: string };

/**
 * Runs one trial. With an adapter, compares the production system with the spec step by step and returns the first
 * mismatch; without one, runs the spec alone (spec errors and broken properties are thrown as SpecError).
 */
export async function trial(ir: Ir8, raw: RawStep[], options: TrialOptions = {}): Promise<{ steps: Step8[]; expected: Observed8; actual: Observed8 | { error: string } } | undefined> {
  const adapter = options.adapter;
  const sim = new Simulation(ir, options.coverage);
  let current: { answers: Answers; asked: Record<string, unknown> } | undefined;
  let recorded: { port: string; args: unknown }[] = [];
  // a query with a parameter asked about something the specification does not ask about in this step (while it asks the
  // same query about something else): the implementation asked about the wrong thing. Fails even if production code
  // swallows the exception
  let wrongAsk: string | undefined;
  const outside = Object.entries(ir.components).filter(([, c]) => c.external);
  const ports: Record<string, unknown> = Object.fromEntries(
    outside.map(([id, c]) => [
      id,
      {
        ...Object.fromEntries(
          Object.entries(c.external!.queries).map(([name, port]) => [
            name,
            (input?: Record<string, unknown>) => {
              if (!current) throw new Error(`ports.${id}.${name}() was called outside a command; ask while executing one`);
              const args = Object.fromEntries(Object.keys(port.params).map((p) => [p, fromPlain(input?.[p], port.params[p])]));
              if (Object.keys(port.params).length > 0) {
                const key = `${id}.${name}(${keyOf(args)})`;
                const specKeys = Object.keys(current.asked).filter((k) => k.startsWith(`${id}.${name}(`));
                if (specKeys.length > 0 && !specKeys.includes(key) && wrongAsk === undefined) {
                  wrongAsk = `ports.${id}.${name} was asked about ${JSON.stringify(plain(args))}, but in this step the specification asks it about ${specKeys.map((k) => k.slice(id.length + name.length + 1)).join(", ")}`;
                }
              }
              const value = current.answers(id, name, args);
              if (value === FAILED) throw new Error(`ports.${id}.${name}: the dependency is unavailable`);
              return structuredClone(plain(value));
            },
          ]),
        ),
        ...Object.fromEntries(
          Object.entries(c.external!.commands).map(([name, command]) => [
            name,
            (input?: Record<string, unknown>) => {
              recorded.push({ port: `${id}.${name}`, args: normalized(input ?? {}, { record: command.params }) });
            },
          ]),
        ),
      },
    ]),
  );
  const storageDir = adapter && restartsIn(ir) ? mkdtempSync(join(tmpdir(), "clp-storage-")) : undefined;
  if (storageDir) ports.storage = join(storageDir, "data.sqlite");
  let expected: Observed8 = { state: null, effects: [] };
  try {
    if (adapter) await adapter.setupIsolation(ports);
    try {
      for (const rawStep of raw) {
        if (rawStep.restart) {
          sim.restart();
          if (adapter) {
            if (!adapter.restartSystem) return { steps: sim.steps, expected, actual: { error: "adapter.restartSystem() is missing: this system keeps data across restarts, so the adapter must be able to restart it" } };
            current = undefined;
            await adapter.restartSystem();
          }
        }
        const planned = sim.step(rawStep);
        if (!planned) continue;
        expected = planned.expected;
        if (!adapter) continue;
        const { entry, step } = planned;
        current = { answers: planned.answers, asked: planned.step.answers };
        recorded = [];
        wrongAsk = undefined;
        const command = { name: step.name, input: structuredClone(step.input) };
        const returned = entry.kind === "command" ? await adapter.executeCommand(command) : await adapter.executeQuery!(command);
        current = undefined;
        const actual: Observed8 = { state: null, effects: recorded, ...(entry.output !== undefined ? { output: normalized(returned, entry.output) } : {}) };
        if (wrongAsk !== undefined) return { steps: sim.steps, expected, actual: { error: wrongAsk } };
        const answers = entry.output !== undefined;
        if (!decided("observation-compare", { expected, actual, answers }, observationsEqualStage0(expected, actual, answers))) return { steps: sim.steps, expected, actual };
      }
    } finally {
      try {
        if (adapter) await adapter.teardownIsolation();
      } finally {
        if (storageDir) rmSync(storageDir, { recursive: true, force: true });
      }
    }
  } catch (error) {
    if (error instanceof SpecError) throw error;
    if (options.stopAt !== undefined && messageOf(error).includes(options.stopAt)) return undefined;
    return { steps: sim.steps, expected, actual: { error: messageOf(error) } };
  }
  return undefined;
}

export const DEFAULT_RUNS = 5000;

/** Verifies a production system against the IR. */
export async function check8(
  ir: Ir8,
  adapter: Adapter8,
  params: { seed: number; path?: string; numRuns?: number; traces?: { event: string; steps: TraceStep[] }[]; stopAt?: string },
  deciders?: Deciders8,
): Promise<PbtResult8> {
  if (entriesOf(ir).length === 0) return { status: "error", message: "検証するコマンドも問い合わせもありません" };
  if (ir.entries.queries.length > 0 && !adapter.executeQuery) return { status: "error", message: "adapter.executeQuery がありません" };
  const coverage: Record<string, number> = {};
  // every decision of a trial is put to Stage 1 before the trial counts (R4); the answers are cached across trials
  const cache = new Map<string, unknown>();
  const checked = async (raw: RawStep[], counting = true) => {
    const { result, asked } = await recordingAsync(() => trial(ir, raw, { adapter, ...(counting ? { coverage } : {}), ...(params.stopAt ? { stopAt: params.stopAt } : {}) }));
    await agree(asked, deciders, cache);
    return result;
  };
  const run = async (raw: RawStep[]) => (await checked(raw)) === undefined;
  const building = await recordingAsync(async () => sequencesFrom(ir, []));
  await agree(building.asked, deciders, cache);
  // fixed traces first (DSL.md §17.13 ②): the shortest ones Alloy found to every event, and the author's examples, shortest first
  const fixed = (params.traces ?? [])
    .map((trace) => ({ event: trace.event, raw: fixedSteps(ir, trace.steps) }))
    .filter((trace): trace is { event: string; raw: RawStep[] } => trace.raw !== undefined)
    .sort((a, b) => a.raw.length - b.raw.length);
  try {
    for (const trace of fixed) {
      const failure = await checked(trace.raw);
      if (failure) return { status: "fail", seed: params.seed, path: `trace:${trace.event}`, numRuns: 0, numShrinks: 0, ...failure };
    }
    // the examples the author wrote come first, then random sequences
    const details = await fc.check(fc.asyncProperty(sequencesFrom(ir, fixed.map((t) => t.raw)), run), { seed: params.seed, numRuns: params.numRuns ?? DEFAULT_RUNS, ...(params.path ? { path: params.path } : {}) });
    if (!details.failed) return { status: "pass", seed: details.seed, numRuns: details.numRuns, coverage: coverageOf(ir, coverage) };
    if (!details.counterexample) return { status: "error", message: "反例を特定できませんでした" };
    const failure = await checked(details.counterexample[0], false);
    if (!failure) return { status: "error", message: "反例を再現できませんでした（本番システムが非決定的な可能性があります）" };
    // shrinking with the checker (④): a shorter trace that reaches the event the counterexample ended in, if it fails too
    const last = failure.steps.at(-1)?.events.at(-1);
    for (const trace of fixed.filter((t) => t.event === last && t.raw.length < failure.steps.length)) {
      const shorter = await checked(trace.raw, false);
      if (shorter) return { status: "fail", seed: details.seed, path: `trace:${trace.event}`, numRuns: details.numRuns, numShrinks: details.numShrinks, ...shorter };
    }
    return { status: "fail", seed: details.seed, path: details.counterexamplePath ?? "", numRuns: details.numRuns, numShrinks: details.numShrinks, ...failure };
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    if (cause instanceof SpecError) return { status: "error", message: `仕様の誤り: ${cause.message}`, steps: (cause as SpecError & { steps?: Step8[] }).steps };
    if (cause instanceof FrameworkError) return { status: "error", message: `フレームワークの誤り: ${cause.message}` };
    throw error;
  }
}

export function coverageOf(ir: Ir8, counts: Record<string, number>): Coverage {
  const all = Object.entries(ir.components).flatMap(([id, c]) => Object.keys(c.events ?? {}).map((e) => `${id}.${e}`));
  return { events: Object.fromEntries(all.map((e) => [e, counts[e] ?? 0])), never: all.filter((e) => !counts[e]) };
}

/** The spec run alone (DSL.md §17.13 ①, the part without Alloy): no case missing, no two at once, no missing key, properties hold. */
export async function selfCheck8(ir: Ir8, params: { seed: number; numRuns?: number }, deciders?: Deciders8): Promise<{ ok: true; coverage: Coverage } | { ok: false; message: string; steps: Step8[] }> {
  const coverage: Record<string, number> = {};
  const cache = new Map<string, unknown>();
  try {
    await fc.assert(
      fc.asyncProperty(sequences(ir), async (raw) => {
        const { asked } = await recordingAsync(() => trial(ir, raw, { coverage }));
        await agree(asked, deciders, cache);
      }),
      { seed: params.seed, numRuns: params.numRuns ?? 300 },
    );
    return { ok: true, coverage: coverageOf(ir, coverage) };
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause ?? error;
    if (cause instanceof SpecError) return { ok: false, message: cause.message, steps: (cause as SpecError & { steps?: Step8[] }).steps ?? [] };
    if (cause instanceof FrameworkError) return { ok: false, message: `フレームワークの誤り: ${cause.message}`, steps: [] };
    const message = messageOf(cause);
    const match = /Got error: (SpecError: .*)/s.exec(error instanceof Error ? error.message : "");
    return { ok: false, message: match ? match[1].split("\n")[0] : message, steps: [] };
  }
}

/** The examples the author wrote, run on the spec: each expectation must hold. */
export function checkExamples(ir: Ir8): { example: string; message: string }[] {
  const problems: { example: string; message: string }[] = [];
  for (const [name, example] of Object.entries(ir.examples ?? {})) {
    let world = initialWorld(ir);
    const fixed: Record<string, unknown> = {};
    const answers: Answers = (component, query) => {
      const id = `${component}.${query}`;
      if (id in fixed) return fixed[id];
      throw new SpecError(`具体例 ${name}: ${id} の答えが決まっていません（${component}.${query}.returns(…) で決めます）`);
    };
    try {
      for (const step of example.steps) {
        if ("expect" in step) {
          const [component, port] = step.expect.event.split(".");
          const c = ir.components[component];
          const params = typedArgs(step.expect.params, c.commands?.[port]?.params ?? c.queries?.[port]?.params ?? {});
          let output: unknown;
          let type: Type | undefined;
          if (c.commands?.[port]) {
            const result = execute(ir, world, component, port, params, answers);
            world = result.world;
            output = result.output;
            type = c.commands[port].output;
          } else {
            output = answer(ir, world, component, port, params, answers);
            type = c.queries?.[port]?.result;
          }
          const want = normalized(step.expect.output, type);
          if (!isDeepStrictEqual(normalized(output, type), want)) {
            problems.push({ example: name, message: `${step.expect.event}(${JSON.stringify(step.expect.params)}) の答えは ${JSON.stringify(normalized(output, type))} で、具体例は ${JSON.stringify(want)} です` });
            break;
          }
        } else if (step.answers) Object.assign(fixed, step.answers);
        else {
          const [component, command] = step.event.split(".");
          const result = execute(ir, world, component, command, typedArgs(step.params, ir.components[component].commands?.[command]?.params ?? {}), answers);
          world = result.world;
        }
      }
    } catch (error) {
      problems.push({ example: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return problems;
}
function typedArgs(params: Record<string, unknown>, types: Record<string, Type>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, types[k] ? fromPlain(v, types[k]) : v]));
}
