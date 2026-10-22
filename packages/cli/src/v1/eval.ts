// The oracle of 1.0 (DSL.md §17.15): what a spec says happens is computed by evaluating the expressions of its IR,
// never by running code a person or an LLM wrote. The same IR is what the agent implements from and what Alloy checks.
//
// A world is the state of every component inside the one being verified. One step executes one command (or answers
// one query): the event whose guard holds is chosen, its assignments and calls are computed from the state before the
// step, the parts it calls change in the same step, and the commands it calls on the outside world are recorded.

import type { ComponentIr, Expr, Ir8, Type } from "./ir.ts";
import { chooseCaseStage0 } from "../choose.ts";
import { decided } from "./decide.ts";
import { callStage0 } from "./outcome.ts";

/** A spec that cannot be run as written: no case holds, a missing key is read, a promise or an invariant is broken. Never the implementer's problem. */
export class SpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpecError";
  }
}
/** A step the spec does not cover (`requires` does not hold). Not generated, not checked. */
export class OutOfSpec extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutOfSpec";
  }
}

// --- Values ---

/** A set: its members, keyed by their canonical text. */
export class VSet {
  readonly items: ReadonlyMap<string, unknown>;
  constructor(items: Iterable<unknown> = []) {
    const map = new Map<string, unknown>();
    for (const item of items) map.set(keyOf(item), item);
    this.items = new Map([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  values(): unknown[] {
    return [...this.items.values()];
  }
  has(value: unknown) {
    return this.items.has(keyOf(value));
  }
}
/** A map (a relation where each key has at most one value). */
export class VMap {
  readonly entries: ReadonlyMap<string, readonly [unknown, unknown]>;
  constructor(entries: Iterable<readonly [unknown, unknown]> = []) {
    const map = new Map<string, readonly [unknown, unknown]>();
    for (const [k, v] of entries) map.set(keyOf(k), [k, v]);
    this.entries = new Map([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
  pairs(): (readonly [unknown, unknown])[] {
    return [...this.entries.values()];
  }
  get(key: unknown): readonly [unknown, unknown] | undefined {
    return this.entries.get(keyOf(key));
  }
}
/** The answer of a query of the outside world that failed this time (`mayFail`). Only `failed(…)` may read it. */
export const FAILED: unique symbol = Symbol("failed");

export function keyOf(value: unknown): string {
  if (value instanceof VSet) return `#set[${[...value.items.keys()].join(",")}]`;
  if (value instanceof VMap) return `#map[${[...value.entries.keys()].map((k) => `${k}=${keyOf(value.entries.get(k)![1])}`).join(",")}]`;
  if (Array.isArray(value)) return `[${value.map(keyOf).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${keyOf((value as Record<string, unknown>)[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
export const equal = (a: unknown, b: unknown) => keyOf(a) === keyOf(b);

/** A value as the production system gives and receives it: sets as lists in a fixed order, maps as `{ key, value }` lists. */
export function plain(value: unknown): unknown {
  if (value instanceof VSet) return value.values().map(plain);
  if (value instanceof VMap) return value.pairs().map(([key, v]) => ({ key: plain(key), value: plain(v) }));
  if (Array.isArray(value)) return value.map(plain);
  if (typeof value === "object" && value !== null) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  return value;
}
/** The other way: a plain value read as a value of the type (sets and maps from lists). */
export function fromPlain(value: unknown, type: Type): unknown {
  if (value === null || value === undefined) return null;
  if (typeof type === "string") return value;
  if ("optional" in type) return fromPlain(value, type.optional);
  if ("set" in type) return new VSet((value as unknown[]).map((v) => fromPlain(v, type.set)));
  if ("map" in type) return new VMap((value as { key: unknown; value: unknown }[]).map((p) => [fromPlain(p.key, type.map[0]), fromPlain(p.value, type.map[1])] as const));
  if ("list" in type) return (value as unknown[]).map((v) => fromPlain(v, type.list));
  if ("record" in type) return Object.fromEntries(Object.entries(type.record).map(([k, t]) => [k, fromPlain((value as Record<string, unknown>)[k], t)]));
  return value;
}

// --- Evaluation ---

export type World = Record<string, Record<string, unknown>>;
/** What the outside world answers during one step. Same question, same answer, within a step. */
export type Answers = (component: string, query: string, args: Record<string, unknown>) => unknown;
export type Effect = { port: string; args: Record<string, unknown> };

type Env = {
  ir: Ir8;
  world: World;
  component: string;
  vars: Record<string, unknown>;
  answers: Answers;
  /** Temporal formulas: the trace and the position being looked at. */
  trace?: TraceView;
  position?: number;
};
export type TraceView = { states: World[]; events: { component: string; command: string; args: Record<string, unknown> }[] };

const fail = (message: string): never => {
  throw new SpecError(message);
};
const comp = (env: Env, id = env.component): ComponentIr => env.ir.components[id] ?? fail(`部品 "${id}" がありません`);

function readable(value: unknown, what: string): unknown {
  if (value === FAILED) fail(`${what}: 失敗した問い合わせの答えを読んでいます（failed(…) で確かめてから使います）`);
  return value;
}

export function evaluate(e: Expr | unknown, env: Env): unknown {
  if (e === null || typeof e === "number" || typeof e === "boolean") return e;
  if (!Array.isArray(e)) return fail(`式ではありません: ${JSON.stringify(e)}`);
  const [op, ...a] = e as [string, ...unknown[]];
  const ev = (x: unknown) => readable(evaluate(x, env), op);
  const int = (x: unknown) => {
    const v = ev(x);
    if (typeof v !== "number") fail(`${op}: 整数が要る所に ${JSON.stringify(plain(v))} があります`);
    return v as number;
  };
  const bool = (x: unknown) => {
    const v = ev(x);
    if (typeof v !== "boolean") fail(`${op}: 真偽値が要る所に ${JSON.stringify(plain(v))} があります`);
    return v as boolean;
  };
  const str = (x: unknown) => {
    const v = ev(x);
    if (typeof v !== "string") fail(`${op}: 文字列が要る所に ${JSON.stringify(plain(v))} があります`);
    return v as string;
  };
  const collection = (x: unknown): unknown[] => {
    const v = ev(x);
    if (v instanceof VSet) return v.values();
    if (Array.isArray(v)) return v;
    if (v instanceof VMap) return v.pairs().map((p) => p);
    return fail(`${op}: 集まりが要る所に ${JSON.stringify(plain(v))} があります`);
  };
  // a function over a collection: one binder for sets and lists, two (key, value) for maps
  const lambda = (coll: unknown, binders: string[], body: unknown) => {
    const v = ev(coll);
    const items: unknown[][] = v instanceof VMap ? v.pairs().map((p) => [...p]) : (v instanceof VSet ? v.values() : (v as unknown[])).map((x) => [x]);
    return { v, items, run: (item: unknown[]) => evaluate(body, { ...env, vars: { ...env.vars, ...Object.fromEntries(binders.map((b, i) => [b, item[i]])) } }) };
  };
  switch (op) {
    case "lit":
      return a[0];
    case "var": {
      const name = a[0] as string;
      if (!(name in env.vars)) fail(`名前 "${name}" に値がありません`);
      return env.vars[name];
    }
    case "state": {
      const state = env.world[env.component];
      if (!state || !(a[0] as string in state)) fail(`状態 "${String(a[0])}" がありません`);
      return state[a[0] as string];
    }
    case "and":
      return a.every((x) => bool(x));
    case "or":
      return a.some((x) => bool(x));
    case "not":
      return !bool(a[0]);
    case "implies":
      return !bool(a[0]) || bool(a[1]);
    case "ite":
      return bool(a[0]) ? evaluate(a[1], env) : evaluate(a[2], env);
    case "=":
      return equal(ev(a[0]), ev(a[1]));
    case "<":
      return int(a[0]) < int(a[1]);
    case "<=":
      return int(a[0]) <= int(a[1]);
    case ">":
      return int(a[0]) > int(a[1]);
    case ">=":
      return int(a[0]) >= int(a[1]);
    case "+":
      return int(a[0]) + int(a[1]);
    case "-":
      return int(a[0]) - int(a[1]);
    case "*":
      return int(a[0]) * int(a[1]);
    case "div": {
      const d = int(a[1]);
      if (d === 0) fail("0 で割っています");
      return Math.floor(int(a[0]) / d);
    }
    case "mod": {
      const d = int(a[1]);
      if (d === 0) fail("0 で割った余りを求めています");
      return int(a[0]) % d;
    }
    case "neg":
      return -int(a[0]);
    case "min":
      return Math.min(int(a[0]), int(a[1]));
    case "max":
      return Math.max(int(a[0]), int(a[1]));
    case "abs":
      return Math.abs(int(a[0]));
    case "nonNull": {
      const v = ev(a[0]);
      if (v === null) fail(`! と書いた値が null です`);
      return v;
    }
    case "??": {
      const v = ev(a[0]);
      return v === null ? evaluate(a[1], env) : v;
    }
    case "concat": {
      const parts = a.map((x) => ev(x));
      if (parts.every((p) => typeof p === "string")) return parts.join("");
      if (parts.every((p) => Array.isArray(p))) return (parts as unknown[][]).flat();
      return fail(`concat: 文字列どうしか並びどうしを、つなぎます`);
    }
    case "join":
      return (ev(a[0]) as string[]).join(str(a[1]));
    case "str":
      return String(ev(a[0]));
    case "strlen":
      return [...str(a[0])].length;
    case "trim":
      return str(a[0]).trim();
    case "lower":
      return str(a[0]).toLowerCase();
    case "upper":
      return str(a[0]).toUpperCase();
    case "startsWith":
      return str(a[0]).startsWith(str(a[1]));
    case "endsWith":
      return str(a[0]).endsWith(str(a[1]));
    case "substr":
      return str(a[0]).includes(str(a[1]));
    case "record":
      return Object.fromEntries(Object.entries(a[0] as Record<string, unknown>).map(([k, x]) => [k, ev(x)]));
    case "field": {
      const r = ev(a[0]);
      if (typeof r !== "object" || r === null || Array.isArray(r)) return fail(`field: 組が要る所に ${JSON.stringify(plain(r))} があります`);
      return (r as Record<string, unknown>)[a[1] as string] ?? null;
    }
    case "with": {
      const r = ev(a[0]) as Record<string, unknown>;
      return { ...r, ...Object.fromEntries(Object.entries(a[1] as Record<string, unknown>).map(([k, x]) => [k, ev(x)])) };
    }
    case "list":
      return a.map((x) => ev(x));
    case "len":
      return collection(a[0]).length;
    case "at": {
      const list = collection(a[0]);
      const i = int(a[1]);
      if (i < 0 || i >= list.length) fail(`at: 長さ ${list.length} の並びの ${i} 番目を読んでいます`);
      return list[i];
    }
    case "emptySet":
      return new VSet();
    case "emptyMap":
      return new VMap();
    case "set":
      return new VSet(a.map((x) => ev(x)));
    case "in": {
      const x = ev(a[0]);
      const s = ev(a[1]);
      if (s instanceof VSet) return s.has(x);
      if (Array.isArray(s)) return s.some((y) => equal(x, y));
      return fail(`in: 集合が要る所に ${JSON.stringify(plain(s))} があります`);
    }
    case "card":
      return collection(a[0]).length;
    case "add": {
      const s = ev(a[0]) as VSet;
      return new VSet([...s.values(), ev(a[1])]);
    }
    case "remove": {
      const s = ev(a[0]) as VSet;
      const x = ev(a[1]);
      return new VSet(s.values().filter((y) => !equal(x, y)));
    }
    case "dom":
      return new VSet((ev(a[0]) as VMap).pairs().map(([k]) => k));
    case "ran":
      return new VSet((ev(a[0]) as VMap).pairs().map(([, v]) => v));
    case "apply": {
      const m = ev(a[0]) as VMap;
      const k = ev(a[1]);
      const found = m.get(k);
      if (!found) return fail(`Map にキー ${JSON.stringify(plain(k))} がありません（has(…) で確かめてから get(…) します）`);
      return found[1];
    }
    case "override": {
      const m = ev(a[0]) as VMap;
      return new VMap([...m.pairs(), [ev(a[1]), ev(a[2])] as const]);
    }
    case "dsub": {
      const m = ev(a[0]) as VMap;
      const k = ev(a[1]);
      return new VMap(m.pairs().filter(([key]) => !equal(key, k)));
    }
    case "some": {
      const { items, run } = lambda(a[0], a[1] as string[], a[2]);
      return items.some((item) => run(item) === true);
    }
    case "every": {
      const { items, run } = lambda(a[0], a[1] as string[], a[2]);
      return items.every((item) => run(item) === true);
    }
    case "count": {
      const { items, run } = lambda(a[0], a[1] as string[], a[2]);
      return items.filter((item) => run(item) === true).length;
    }
    case "sum": {
      const { items, run } = lambda(a[0], a[1] as string[], a[2]);
      return items.reduce<number>((total, item) => total + (run(item) as number), 0);
    }
    case "filter": {
      const { v, items, run } = lambda(a[0], a[1] as string[], a[2]);
      const kept = items.filter((item) => run(item) === true);
      if (v instanceof VMap) return new VMap(kept.map(([k, x]) => [k, x] as const));
      if (v instanceof VSet) return new VSet(kept.map(([x]) => x));
      return kept.map(([x]) => x);
    }
    case "map": {
      const { v, items, run } = lambda(a[0], a[1] as string[], a[2]);
      const mapped = items.map((item) => run(item));
      return v instanceof VSet ? new VSet(mapped) : mapped;
    }
    case "find": {
      const { items, run } = lambda(a[0], a[1] as string[], a[2]);
      return items.find((item) => run(item) === true)?.[0] ?? null;
    }
    case "cond": {
      const condition = comp(env).conditions?.[a[0] as string] ?? fail(`条件 "${String(a[0])}" がありません`);
      return bool(callWith(condition.is, a[1] as Record<string, unknown>, env));
    }
    case "calc": {
      const calc = comp(env).calcs?.[a[0] as string] ?? fail(`計算 "${String(a[0])}" がありません`);
      return callWith(calc.is, a[1] as Record<string, unknown>, env);
    }
    case "decide": {
      const table = comp(env).decisions?.[a[0] as string] ?? fail(`決定表 "${String(a[0])}" がありません`);
      const inner = { ...env, vars: argValues(a[1] as Record<string, unknown>, env) };
      for (const row of table.rows) {
        if (evaluate(row.when, inner) === true) return Object.fromEntries(Object.entries(row.then).map(([k, x]) => [k, evaluate(x, inner)]));
      }
      return fail(`決定表 "${String(a[0])}" のどの行にも当たりません`);
    }
    case "ask": {
      const [id, port, args] = a as [string, string, Record<string, unknown>];
      const target = comp(env, id);
      const values = argValues(args, env);
      if (target.external) return env.answers(id, port, values);
      const query = target.queries?.[port] ?? fail(`${id} に問い合わせ "${port}" がありません`);
      const inner: Env = { ...env, component: id, vars: values };
      if (query.requires !== undefined && evaluate(query.requires, inner) !== true) fail(`${id}.${port} の requires が成り立たない引数で尋ねています: ${JSON.stringify(plain(values))}`);
      return evaluate(query.is, inner);
    }
    case "failed":
      return evaluate(a[0], env) === FAILED;
    case "outputOf": {
      const [id, command, args] = a as [string, string, Record<string, unknown>];
      const event = chooseEvent({ ...env, component: id, vars: argValues(args, env) }, command);
      const ev2 = comp(env, id).events![event];
      return ev2.output === undefined ? null : evaluate(ev2.output, { ...env, component: id, vars: argValues(args, env) });
    }
    // temporal operators, over a finite trace (Alloy's convention: the event at a position is the one leaving it)
    case "always":
    case "eventually":
    case "after":
    case "once":
    case "historically":
    case "until":
    case "on":
      return temporal(op, a, env);
    default:
      return fail(`知らない演算 "${op}"`);
  }
}

function argValues(args: Record<string, unknown>, env: Env): Record<string, unknown> {
  return Object.fromEntries(Object.entries(args).map(([k, x]) => [k, evaluate(x, env)]));
}
function callWith(body: Expr, args: Record<string, unknown>, env: Env): unknown {
  return evaluate(body, { ...env, vars: { ...env.vars, ...argValues(args, env) } });
}

function temporal(op: string, a: unknown[], env: Env): unknown {
  const trace = env.trace ?? fail(`${op} は、性質の検査の中だけで評価できます`);
  const at = env.position ?? 0;
  const last = trace.states.length - 1;
  const atPos = (j: number, x: unknown) => evaluate(x, { ...env, world: trace.states[j], position: j }) === true;
  switch (op) {
    case "always":
      for (let j = at; j <= last; j++) if (!atPos(j, a[0])) return false;
      return true;
    case "eventually":
      // a finite trace cannot refute "eventually": checked by Alloy only
      return true;
    case "after":
      return at >= last ? true : atPos(at + 1, a[0]);
    case "once":
      for (let j = at; j >= 0; j--) if (atPos(j, a[0])) return true;
      return false;
    case "historically":
      for (let j = at; j >= 0; j--) if (!atPos(j, a[0])) return false;
      return true;
    case "until":
      for (let j = at; j <= last; j++) {
        if (atPos(j, a[1])) return true;
        if (!atPos(j, a[0])) return false;
      }
      return true;
    case "on": {
      const [command, binds, body] = a as [string, Record<string, string>, unknown];
      const event = trace.events[at];
      if (!event || event.component !== env.component || event.command !== command) return true;
      const vars = { ...env.vars, ...Object.fromEntries(Object.entries(binds).map(([param, name]) => [name, event.args[param]])) };
      return evaluate(body, { ...env, vars }) === true;
    }
  }
  return fail(`知らない時相の演算 "${op}"`);
}

/**
 * The event of a command whose guard holds. Which one is decided by step-choice (Stage 0: choose.ts): the named cases
 * are asked, at most one may hold, and none holding means the `otherwise` event, which must then hold too.
 */
export function chooseEvent(env: Env, command: string): string {
  const c = comp(env);
  const names = c.commands?.[command]?.events ?? fail(`${env.component} にコマンド "${command}" がありません`);
  const local = (name: string) => name.slice(command.length + 1);
  const holds = (name: string) => evaluate(c.events![`${command}.${name}`].guard, env) === true;
  const otherwise = names.find((name) => local(name) === "otherwise");
  const named = names.map(local).filter((name) => name !== "otherwise");
  const holding = named.filter(holds);
  const choice = decided("step-choice", { names: named, holding }, chooseCaseStage0(named, (name) => holding.includes(name)));
  const where = `${env.component}.${command} (引数 ${JSON.stringify(plain(env.vars))})`;
  if (choice.chosen === null) fail(`${where}: 場合 ${choice.conflict.join(" と ")} が同時に成り立ちます`);
  if (choice.chosen !== "otherwise") return `${command}.${choice.chosen}`;
  if (otherwise === undefined || evaluate(c.events![otherwise].guard, env) !== true) fail(`${where}: どの場合にも当たりません`);
  return otherwise!;
}

/** The world at the start: every component's initial values. */
export function initialWorld(ir: Ir8): World {
  const world: World = {};
  for (const [id, c] of Object.entries(ir.components)) {
    if (c.external) continue;
    const env: Env = { ir, world: {}, component: id, vars: {}, answers: () => fail("初めの値は、外の世界に尋ねられません") };
    world[id] = Object.fromEntries(Object.entries(c.init ?? {}).map(([field, e]) => [field, evaluate(e, env)]));
  }
  return world;
}

export type StepResult = { world: World; output: unknown; effects: Effect[]; events: string[] };

/**
 * Executes one command of a component. `entry`: driven from outside (a `requires` that does not hold is a step outside
 * the spec, `OutOfSpec`); otherwise it was called by another component (it is a spec error).
 */
export function execute(ir: Ir8, world: World, component: string, command: string, args: Record<string, unknown>, answers: Answers, entry = true): StepResult {
  const touched = new Set<string>();
  const effects: Effect[] = [];
  const events: string[] = [];
  const next: World = { ...world };
  const run = (id: string, cmd: string, values: Record<string, unknown>, isEntry: boolean): unknown => {
    touched.add(id);
    const c = ir.components[id] ?? fail(`部品 "${id}" がありません`);
    const def = c.commands?.[cmd] ?? fail(`${id} にコマンド "${cmd}" がありません`);
    const env: Env = { ir, world, component: id, vars: values, answers };
    if (def.requires !== undefined && evaluate(def.requires, env) !== true) {
      if (isEntry) throw new OutOfSpec(`${id}.${cmd}: requires が成り立たない引数 ${JSON.stringify(plain(values))}`);
      fail(`${id}.${cmd} を、requires が成り立たない引数 ${JSON.stringify(plain(values))} で呼んでいます（呼ぶ側が確かめていません）`);
    }
    const name = chooseEvent(env, cmd);
    events.push(`${id}.${name}`);
    const event = c.events![name];
    const assigned = Object.fromEntries(Object.entries(event.assign).map(([field, e]) => [field, evaluate(e, env)]));
    const calls = event.calls.map((call) => ({ call, guard: (call.when === undefined ? "none" : evaluate(call.when, env) === true ? "holds" : "not") as "none" | "holds" | "not" }));
    const output = event.output === undefined ? undefined : evaluate(event.output, env);
    if (output === FAILED) fail(`${id}.${cmd}: 失敗した問い合わせの答えを返しています`);
    next[id] = { ...world[id], ...assigned };
    for (const { call, guard } of calls) {
      const facts = { external: ir.components[call.component]?.external !== undefined, guard, touched: touched.has(call.component) };
      const decision = decided("outcome-apply", facts, callStage0(facts));
      if (decision === "skip") continue;
      if (decision === "twice") fail(`${call.component} が、1つのステップの中で2回呼ばれています`);
      const callArgs = argValues(call.args, env);
      if (decision === "effect") effects.push({ port: `${call.component}.${call.command}`, args: callArgs });
      else run(call.component, call.command, callArgs, false);
    }
    return output;
  };
  const output = run(component, command, args, entry);
  return { world: next, output, effects, events };
}

/** The answer of a query of a component (an observation, the state does not change). */
export function answer(ir: Ir8, world: World, component: string, query: string, args: Record<string, unknown>, answers: Answers): unknown {
  const c = ir.components[component];
  const def = c?.queries?.[query] ?? fail(`${component} に問い合わせ "${query}" がありません`);
  const env: Env = { ir, world, component, vars: args, answers };
  if (def.requires !== undefined && evaluate(def.requires, env) !== true) throw new OutOfSpec(`${component}.${query}: requires が成り立たない引数`);
  const value = evaluate(def.is, env);
  if (value === FAILED) fail(`${component}.${query}: 失敗した問い合わせの答えを返しています`);
  return value;
}

/** Properties of every component, after a trace: invariants at every state, temporal properties from the start. */
export function brokenProperties(ir: Ir8, trace: TraceView): string[] {
  const broken: string[] = [];
  for (const [id, c] of Object.entries(ir.components)) {
    for (const [name, property] of Object.entries(c.properties ?? {})) {
      const env: Env = { ir, world: trace.states[0], component: id, vars: {}, answers: () => fail("性質の中では、外の世界に尋ねられません"), trace, position: 0 };
      if (evaluate(property.is, env) !== true) broken.push(`${id}.${name}`);
    }
  }
  return broken;
}
