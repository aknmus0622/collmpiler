// The Alloy 6 checker (DSL.md §17.11–§17.14): IR version 8 written as an Alloy 6 module, run with the Alloy
// command line (Java), and the answers read back in the common trace format.
//
// What it is used for:
//   ① the spec's validity before any implementation: properties (invariants and temporal ones), every value that is
//     read is defined (a key is in a map when it is read), a component is called only with arguments its `requires`
//     accepts, every event can happen;
//   ② targeted traces: for every event, the shortest sequence of entries that makes it happen, replayed by the PBT
//     (the cases random sequences almost never reach);
//   ④ shrinking: the shortest trace that reaches the event a counterexample ended in.
//
// What the profile does not cover (lists, records, JSON, string operations other than equality, numbers beyond 7
// bits) is reported as out of range, and that component is left to the PBT.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ComponentIr, Expr, Ir8, TraceStep, Type } from "./ir.ts";
import { entriesOf, entryName } from "./pbt.ts";
import { stableStringify8 } from "./generate.ts";

// --- The checker interface (DSL.md §17.12) ---

/**
 * The scope of the analysis (outside the IR; DSL.md §17.16). Properties are checked over `steps` steps with `atoms`
 * atoms of each kind; a trace to an event is searched for up to `traceSteps` steps, and an event not reached so is
 * searched for again with `wideAtoms` atoms up to `maxTraceSteps` steps (a limit of five books needs six books).
 */
export type Analysis = { atoms: number; bitwidth?: number; steps: number; traceSteps: number; wideAtoms: number; maxTraceSteps: number };
export const DEFAULT_ANALYSIS: Analysis = { atoms: 3, steps: 6, traceSteps: 8, wideAtoms: 6, maxTraceSteps: 12 };
export type GeneratedFiles = Record<string, string>;
export type Verdict =
  | { command: string; kind: "property" | "defined" | "requires"; status: "holds" | "broken" | "out-of-range"; what: string; trace?: TraceStep[] }
  | { command: string; kind: "reach"; status: "reached" | "unreachable" | "out-of-range"; what: string; trace?: TraceStep[] };
export type CheckResult = { checker: string; skipped?: string[]; verdicts: Verdict[] };
export interface Checker {
  name: string;
  emit(ir: Ir8, analysis: Analysis): { files: GeneratedFiles; commands: CommandInfo[]; skipped: string[] };
  run(files: GeneratedFiles): { output: string; receipt?: unknown };
  read(raw: { receipt?: unknown }, commands: CommandInfo[], ir: Ir8): Verdict[];
}
export type CommandInfo = { name: string; kind: Verdict["kind"]; what: string; event?: string; body: string };

// --- Names ---

const safe = (s: string) => s.replace(/[^A-Za-z0-9_]/g, "_");
const comp = (id: string) => `c_${safe(id)}`;
const field = (id: string, f: string) => `f_${safe(id)}_${safe(f)}`;
const sort = (name: string) => `s_${safe(name)}`;
const param = (name: string) => `p_${safe(name)}`;
const entry = (qualified: string) => `k_${safe(qualified)}`;
const stepField = (qualified: string, p: string) => `x_${safe(qualified)}_${safe(p)}`;
const envField = (id: string) => `env_${safe(id)}`;

class OutOfProfile extends Error {}
const unsupported = (what: string): never => {
  throw new OutOfProfile(what);
};

// --- Types ---

type Ctx = {
  ir: Ir8;
  /** The component whose state `["state", f]` reads. */
  component: string;
  /** Names bound in scope: parameter names → Alloy names. */
  vars: Map<string, string>;
  strings: Map<string, string>;
  /** Unprimed (before the step) or primed. */
  primed?: boolean;
};

function sigOf(t: Type): string {
  if (t === "int") return "Int";
  if (t === "bool") return "Bool";
  if (t === "string") return "Str";
  if (t === "json") return unsupported("JSON の値");
  if ("enum" in t) {
    if (t.enum.every((v) => typeof v === "string")) return "Str";
    if (t.enum.every((v) => typeof v === "number")) return "Int";
    return "Bool";
  }
  if ("atom" in t) return sort(t.atom);
  if ("optional" in t) return sigOf(t.optional);
  return unsupported(`型 ${JSON.stringify(t)}`);
}
/** A field or parameter declaration: `one X`, `lone X`, `set X`, `K -> lone V`. */
function declOf(t: Type): string {
  if (typeof t === "object" && "optional" in t) return `lone ${sigOf(t.optional)}`;
  if (typeof t === "object" && "set" in t) return `set ${sigOf(t.set)}`;
  if (typeof t === "object" && "map" in t) return `${sigOf(t.map[0])} -> lone ${sigOf(t.map[1])}`;
  return `one ${sigOf(t)}`;
}

// --- Expressions ---

const isBoolType = (t: Type | undefined) => t === "bool" || (typeof t === "object" && "enum" in t && t.enum.every((v) => typeof v === "boolean"));

/** An expression as an Alloy formula (it must be boolean). */
function formula(e: Expr | unknown, cx: Ctx): string {
  if (e === true) return "(some Bool)";
  if (e === false) return "(no Bool)";
  if (!Array.isArray(e)) return unsupported(`条件 ${JSON.stringify(e)}`);
  const [op, ...a] = e as [string, ...unknown[]];
  const f = (x: unknown) => formula(x, cx);
  const t = (x: unknown) => term(x, cx);
  switch (op) {
    case "and":
      return `(${a.map(f).join(" and ")})`;
    case "or":
      return `(${a.map(f).join(" or ")})`;
    case "not":
      return `(not ${f(a[0])})`;
    case "implies":
      return `(${f(a[0])} implies ${f(a[1])})`;
    case "ite":
      return `(${f(a[0])} implies ${f(a[1])} else ${f(a[2])})`;
    case "=":
      return isBoolExpr(a[0], cx) ? `(${f(a[0])} iff ${f(a[1])})` : `(${t(a[0])} = ${t(a[1])})`;
    case "<":
    case "<=":
    case ">":
    case ">=":
      return `(${t(a[0])} ${op} ${t(a[1])})`;
    case "in":
      return `(${t(a[0])} in ${t(a[1])})`;
    case "failed":
      return `(some ${failedOf(a[0], cx)})`;
    case "always":
    case "eventually":
    case "after":
    case "once":
    case "historically":
      return `(${op} ${f(a[0])})`;
    case "until":
      return `(${f(a[0])} until ${f(a[1])})`;
    case "on": {
      const [command, binds, body] = a as [string, Record<string, string>, unknown];
      const qualified = `${cx.component}.${command}`;
      const vars = new Map(cx.vars);
      const quantified: string[] = [];
      const def = cx.ir.components[cx.component].commands?.[command];
      for (const [p, name] of Object.entries(binds)) {
        vars.set(name, `b_${safe(name)}`);
        quantified.push(`b_${safe(name)}: ${sigOf(def?.params[p] ?? "int")}`);
      }
      const match = [`Step.event = ${entry(qualified)}`, ...Object.entries(binds).map(([p, name]) => `Step.${stepField(qualified, p)} = b_${safe(name)}`)].join(" and ");
      const inner = formula(body, { ...cx, vars });
      return quantified.length ? `(all ${quantified.join(", ")} | (${match}) implies ${inner})` : `((${match}) implies ${inner})`;
    }
    case "some":
    case "every": {
      const [coll, binders, body] = a as [unknown, string[], unknown];
      const { decls, vars, guard } = bind(coll, binders, cx);
      const inner = formula(body, { ...cx, vars });
      return op === "some" ? `(some ${decls} | ${guard ? `${guard} and ` : ""}${inner})` : `(all ${decls} | ${guard ? `${guard} implies ` : ""}${inner})`;
    }
    case "cond": {
      const [name, args] = a as [string, Record<string, unknown>];
      const c = cx.ir.components[cx.component].conditions?.[name] ?? unsupported(`条件 ${name}`);
      return withArgs(c.is, c.params, args, cx, formula);
    }
    case "ask":
    case "outputOf":
    case "field":
    case "var":
    case "state":
    case "apply":
    case "decide":
    case "calc":
    case "??":
      return `(${t(e)} = True)`;
    default:
      return unsupported(`演算 ${op}（条件として）`);
  }
}

function isBoolExpr(e: unknown, cx: Ctx): boolean {
  if (typeof e === "boolean") return true;
  if (!Array.isArray(e)) return false;
  const op = e[0];
  if (["and", "or", "not", "implies", "<", "<=", ">", ">=", "in", "failed", "cond", "some", "every"].includes(op)) return true;
  if (op === "=") return true;
  if (op === "state") return isBoolType(cx.ir.components[cx.component].state?.[e[1] as string]);
  return false;
}

/** The domain a binder ranges over. */
function bind(coll: unknown, binders: string[], cx: Ctx): { decls: string; vars: Map<string, string>; guard?: string } {
  const vars = new Map(cx.vars);
  const type = typeOfColl(coll, cx);
  const c = term(coll, cx);
  if (type === "map") {
    const [k, v] = binders;
    const kn = `b_${safe(k)}`;
    vars.set(k, kn);
    if (v !== undefined) vars.set(v, `(${kn}.${c})`);
    return { decls: `${kn}: ${c}.univ`, vars };
  }
  const [x] = binders;
  vars.set(x, `b_${safe(x)}`);
  return { decls: `b_${safe(x)}: ${c}`, vars };
}
function typeOfColl(coll: unknown, cx: Ctx): "set" | "map" {
  if (Array.isArray(coll)) {
    if (coll[0] === "state") {
      const t = cx.ir.components[cx.component].state?.[coll[1] as string];
      if (t && typeof t === "object" && "map" in t) return "map";
      if (t && typeof t === "object" && "list" in t) unsupported("並び (List)");
      return "set";
    }
    if (["override", "dsub", "emptyMap"].includes(coll[0] as string)) return "map";
    if (coll[0] === "filter") return typeOfColl(coll[1], cx);
  }
  return "set";
}

// The body of a named condition, calculation or another component's requires, with its parameters bound to arguments
// (read where they are written, `cx`); the body is read in `inside` (another component's state, for a requires)
function withArgs(body: Expr, params: Record<string, Type>, args: Record<string, unknown>, cx: Ctx, as: (e: unknown, cx: Ctx) => string, inside: Ctx = cx): string {
  const lets = Object.keys(params).map((p) => `l_${safe(p)} = ${term(args[p], cx)}`);
  const vars = new Map(inside === cx ? cx.vars : []);
  for (const p of Object.keys(params)) vars.set(p, `l_${safe(p)}`);
  const inner = as(body, { ...inside, vars });
  return lets.length ? `(let ${lets.join(", ")} | ${inner})` : inner;
}

function failedOf(ask: unknown, cx: Ctx): string {
  if (!Array.isArray(ask) || ask[0] !== "ask") return unsupported("failed の中身");
  const [, id, port] = ask as [string, string, string];
  return `Env.${envField(`${id}.${port}`)}_failed`;
}

/** An expression as an Alloy term (a value). */
function term(e: Expr | unknown, cx: Ctx): string {
  if (typeof e === "number") return e < 0 ? `minus[0, ${-e}]` : String(e);
  if (typeof e === "boolean") return e ? "True" : "False";
  if (e === null) return "none";
  if (!Array.isArray(e)) return unsupported(`値 ${JSON.stringify(e)}`);
  const [op, ...a] = e as [string, ...unknown[]];
  const t = (x: unknown) => term(x, cx);
  switch (op) {
    case "lit": {
      if (typeof a[0] !== "string") return unsupported("組や並びの定数");
      const name = cx.strings.get(a[0]) ?? unsupported(`文字列 ${a[0]}`);
      return name;
    }
    case "var":
      return cx.vars.get(a[0] as string) ?? unsupported(`名前 ${String(a[0])}`);
    case "state":
      return `(${comp(cx.component)}.${field(cx.component, a[0] as string)}${cx.primed ? "'" : ""})`;
    case "+":
      return `plus[${t(a[0])}, ${t(a[1])}]`;
    case "-":
      return `minus[${t(a[0])}, ${t(a[1])}]`;
    case "*":
      return `mul[${t(a[0])}, ${t(a[1])}]`;
    case "div":
      return `div[${t(a[0])}, ${t(a[1])}]`;
    case "mod":
      return `rem[${t(a[0])}, ${t(a[1])}]`;
    case "neg":
      return `minus[0, ${t(a[0])}]`;
    case "min":
      return `(${t(a[0])} < ${t(a[1])} => ${t(a[0])} else ${t(a[1])})`;
    case "max":
      return `(${t(a[0])} > ${t(a[1])} => ${t(a[0])} else ${t(a[1])})`;
    case "abs":
      return `(${t(a[0])} < 0 => minus[0, ${t(a[0])}] else ${t(a[0])})`;
    case "ite":
      return `(${formula(a[0], cx)} => ${t(a[1])} else ${t(a[2])})`;
    case "??":
      return `(some ${t(a[0])} => ${t(a[0])} else ${t(a[1])})`;
    case "nonNull":
      return t(a[0]);
    case "emptySet":
    case "emptyMap":
      return "none";
    case "set":
      return a.length === 0 ? "none" : `(${a.map(t).join(" + ")})`;
    case "card":
      return `#${t(a[0])}`;
    case "add":
      return `(${t(a[0])} + ${t(a[1])})`;
    case "remove":
      return `(${t(a[0])} - ${t(a[1])})`;
    case "dom":
      return `(${t(a[0])}.univ)`;
    case "ran":
      return `(univ.${t(a[0])})`;
    case "apply":
      return `(${t(a[1])}.${t(a[0])})`;
    case "override":
      return `(${t(a[0])} ++ ${t(a[1])} -> ${t(a[2])})`;
    case "dsub":
      return `(${t(a[0])} - ${t(a[1])} -> univ)`;
    case "count":
    case "filter": {
      const [coll, binders, body] = a as [unknown, string[], unknown];
      const kind = typeOfColl(coll, cx);
      const { decls, vars } = bind(coll, binders, cx);
      const inner = formula(body, { ...cx, vars });
      if (kind === "map") {
        const k = `b_${safe(binders[0])}`;
        const set = `{ ${decls} | ${inner} }`;
        return op === "count" ? `#${set}` : `(${set} <: ${t(coll)})`;
        void k;
      }
      const set = `{ ${decls} | ${inner} }`;
      return op === "count" ? `#${set}` : set;
    }
    case "sum": {
      const [coll, binders, body] = a as [unknown, string[], unknown];
      const { decls, vars } = bind(coll, binders, cx);
      return `(sum ${decls} | ${term(body, { ...cx, vars })})`;
    }
    case "cond":
      return `(${formula(e, cx)} => True else False)`;
    case "and":
    case "or":
    case "not":
    case "implies":
    case "=":
    case "<":
    case "<=":
    case ">":
    case ">=":
    case "in":
    case "some":
    case "every":
    case "failed":
      return `(${formula(e, cx)} => True else False)`;
    case "calc": {
      const [name, args] = a as [string, Record<string, unknown>];
      const c = cx.ir.components[cx.component].calcs?.[name] ?? unsupported(`計算 ${name}`);
      return withArgs(c.is, c.params, args, cx, term);
    }
    case "field": {
      const [inner, column] = a as [unknown, string];
      if (Array.isArray(inner) && inner[0] === "decide") {
        const [, name, args] = inner as [string, string, Record<string, unknown>];
        const table = cx.ir.components[cx.component].decisions?.[name] ?? unsupported(`決定表 ${name}`);
        const lets = Object.keys(table.params).map((p) => `l_${safe(p)} = ${term(args[p], cx)}`);
        const vars = new Map(cx.vars);
        for (const p of Object.keys(table.params)) vars.set(p, `l_${safe(p)}`);
        const inner2: Ctx = { ...cx, vars };
        let body = "";
        for (let i = table.rows.length - 1; i >= 0; i--) {
          const value = term(table.rows[i].then[column], inner2);
          body = i === table.rows.length - 1 ? value : `(${formula(table.rows[i].when, inner2)} => ${value} else ${body})`;
        }
        return lets.length ? `(let ${lets.join(", ")} | ${body})` : body;
      }
      return unsupported("組のフィールド");
    }
    case "ask": {
      const [id, port, args] = a as [string, string, Record<string, unknown>];
      const target = cx.ir.components[id];
      if (target.external) {
        const def = target.external.queries[port];
        const env = `Env.${envField(`${id}.${port}`)}`;
        const params = Object.keys(def.params);
        if (params.length === 0) return env;
        if (params.length > 1) return unsupported("引数が2つ以上ある外の世界の問い合わせ");
        return `(${term(args[params[0]], cx)}.${env})`;
      }
      const query = target.queries?.[port] ?? unsupported(`問い合わせ ${id}.${port}`);
      const outer = { ...cx };
      const lets = Object.keys(query.params).map((p) => `l_${safe(p)} = ${term(args[p], outer)}`);
      const vars = new Map<string, string>();
      for (const p of Object.keys(query.params)) vars.set(p, `l_${safe(p)}`);
      const inner = isBoolType(query.result) ? `(${formula(query.is, { ...cx, component: id, vars })} => True else False)` : term(query.is, { ...cx, component: id, vars });
      return lets.length ? `(let ${lets.join(", ")} | ${inner})` : inner;
    }
    case "outputOf": {
      const [id, command, args] = a as [string, string, Record<string, unknown>];
      return `${outFun(id, command)}[${Object.keys(cx.ir.components[id].commands![command].params).map((p) => term(args[p], cx)).join(", ")}]`;
    }
    default:
      return unsupported(`演算 ${op}`);
  }
}

const outFun = (id: string, command: string) => `out_${safe(id)}_${safe(command)}`;
const eventPred = (id: string, event: string) => `ev_${safe(id)}_${safe(event)}`;
const commandPred = (id: string, command: string) => `cmd_${safe(id)}_${safe(command)}`;
const unchanged = (id: string) => `same_${safe(id)}`;

// --- The module ---

function literalStrings(ir: Ir8): string[] {
  const found = new Set<string>();
  const walk = (x: unknown) => {
    if (Array.isArray(x)) {
      if (x[0] === "lit" && typeof x[1] === "string") found.add(x[1]);
      else x.forEach(walk);
    } else if (typeof x === "object" && x !== null) {
      if ("enum" in x) for (const v of (x as { enum: unknown[] }).enum) if (typeof v === "string") found.add(v);
      Object.values(x).forEach(walk);
    }
  };
  walk(ir.components);
  return [...found].sort();
}

function bitwidthOf(ir: Ir8, analysis: Analysis): number | undefined {
  if (analysis.bitwidth) return analysis.bitwidth;
  let max = 3;
  const walk = (x: unknown) => {
    if (typeof x === "number") max = Math.max(max, Math.abs(x));
    else if (Array.isArray(x)) {
      if (x[0] === "lit") return;
      x.forEach(walk);
    } else if (typeof x === "object" && x !== null) Object.values(x).forEach(walk);
  };
  walk(Object.values(ir.components).map((c) => [c.init, c.events, c.queries, c.conditions, c.calcs, c.decisions, c.properties, c.commands]));
  // the largest constant and its sign; an overflow is excluded from the instances (-n), not wrapped around
  const needed = Math.ceil(Math.log2(max + 1)) + 1;
  return needed <= 7 ? Math.max(needed, 4) : undefined;
}

/** The module and its commands, with the scope of each command. */
export function renderAlloy(header: string, commands: CommandInfo[], scope: (info: CommandInfo) => string): string {
  return `${header}${commands.map((info) => `${info.kind === "reach" ? "run" : "check"} ${info.name} { ${info.body} } ${scope(info)}`).join("\n")}\n`;
}

export function emitAlloy(ir: Ir8, analysis: Analysis = DEFAULT_ANALYSIS): { text: string; header: string; bitwidth: number; commands: CommandInfo[]; skipped: string[] } {
  const skipped: string[] = [];
  const bitwidth = bitwidthOf(ir, analysis);
  if (bitwidth === undefined) return { text: "", header: "", bitwidth: 0, commands: [], skipped: ["仕様の中の数が 7 ビット (−64〜63) に収まりません。Alloy では確かめず、PBT に任せます"] };
  const strings = new Map(literalStrings(ir).map((s, i) => [s, `str_${i}`]));
  const lines: string[] = [`module spec`, ``, `abstract sig Bool {}`, `one sig True, False extends Bool {}`, `sig Str {}`];
  if (strings.size) lines.push(`one sig ${[...strings.values()].join(", ")} extends Str {}`);
  for (const s of ir.sorts) lines.push(`sig ${sort(s)} {}`);
  const internal = Object.entries(ir.components).filter(([, c]) => !c.external);
  const cx0 = (component: string, vars = new Map<string, string>()): Ctx => ({ ir, component, vars, strings });
  const entries = entriesOf(ir).filter((e) => e.kind === "command");
  try {
    // state
    for (const [id, c] of internal) {
      const fields = Object.entries(c.state ?? {}).map(([f, t]) => `var ${field(id, f)}: ${declOf(t)}`);
      lines.push(`one sig ${comp(id)} {${fields.length ? ` ${fields.join(", ")} ` : ""}}`);
    }
    // the outside world: one answer per step for each query (a function of the arguments, for one with a parameter)
    const envFields: string[] = [];
    const envFacts: string[] = [];
    for (const [id, c] of Object.entries(ir.components)) {
      for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
        const name = envField(`${id}.${port}`);
        const params = Object.values(q.params);
        if (params.length > 1) unsupported(`引数が2つ以上ある外の世界の問い合わせ ${id}.${port}`);
        envFields.push(params.length === 0 ? `var ${name}: ${declOf(q.result)}` : `var ${name}: ${sigOf(params[0])} -> ${declOf(q.result).replace(/^one /, "one ")}`);
        if (q.mayFail) envFields.push(`var ${name}_failed: lone Bool`);
        if (q.promise === "increasing") envFacts.push(`always (Env.${name}' >= Env.${name})`);
        if (q.promise === "fresh") envFacts.push(`always (all v: Env.${name} | after always Env.${name} != v)`);
      }
    }
    lines.push(`one sig Env {${envFields.length ? ` ${envFields.join(", ")} ` : ""}}`);
    // which entry happened, and with what (to read traces back)
    const stepFields = [`var event: lone Entry`, ...entries.flatMap((e) => Object.entries(e.params).map(([p, t]) => `var ${stepField(e.qualified, p)}: lone ${sigOf(t)}`))];
    lines.push(`abstract sig Entry {}`);
    if (entries.length) lines.push(`one sig ${entries.map((e) => entry(e.qualified)).join(", ")} extends Entry {}`);
    lines.push(`one sig Step { ${stepFields.join(", ")} }`);
    // named conditions as predicates are inlined (with let); outputs of commands called by others as functions
    for (const [id, c] of internal) {
      lines.push(`pred ${unchanged(id)} { ${Object.keys(c.state ?? {}).map((f) => `${comp(id)}.${field(id, f)}' = ${comp(id)}.${field(id, f)}`).join(" and ") || "some Bool"} }`);
    }
    const touchedBy = (id: string, command: string, seen = new Set<string>()): Set<string> => {
      const found = new Set<string>([id]);
      const c = ir.components[id];
      for (const e of c.commands![command].events) {
        for (const call of c.events![e].calls) {
          if (ir.components[call.component]?.external || seen.has(`${call.component}.${call.command}`)) continue;
          seen.add(`${call.component}.${call.command}`);
          for (const x of touchedBy(call.component, call.command, seen)) found.add(x);
        }
      }
      return found;
    };
    // the parts a command may touch (itself and every part it calls, transitively)
    for (const [id, c] of internal) {
      for (const [name, def] of Object.entries(c.commands ?? {})) {
        const vars = new Map(Object.keys(def.params).map((p) => [p, param(p)]));
        const decls = Object.entries(def.params).map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
        // each event
        for (const eventName of def.events) {
          const event = c.events![eventName];
          const cx = cx0(id, vars);
          const body: string[] = [formula(event.guard, cx)];
          for (const f of Object.keys(c.state ?? {})) {
            body.push(f in event.assign ? `${comp(id)}.${field(id, f)}' = ${term(event.assign[f], cx)}` : `${comp(id)}.${field(id, f)}' = ${comp(id)}.${field(id, f)}`);
          }
          // calls of parts in the same step; a part not called stays as it is
          // a part called only under a condition stays as it is otherwise, and so does every part it would call;
          // a part the command may touch but this event does not call stays as it is
          const sameAll = (ids: Iterable<string>) => [...ids].map(unchanged).join(" and ") || "some Bool";
          const covered = new Set<string>([id]);
          for (const call of event.calls) {
            if (ir.components[call.component]?.external) continue;
            const target = ir.components[call.component].commands![call.command];
            const args = Object.keys(target.params).map((p) => term(call.args[p], cx)).join(", ");
            const reach = touchedBy(call.component, call.command);
            for (const x of reach) covered.add(x);
            const when = call.when === undefined ? undefined : formula(call.when, cx);
            body.push(when === undefined ? `${commandPred(call.component, call.command)}[${args}]` : `(${when} implies ${commandPred(call.component, call.command)}[${args}] else (${sameAll(reach)}))`);
          }
          const untouched = [...touchedBy(id, name)].filter((x) => !covered.has(x));
          if (untouched.length) body.push(sameAll(untouched));
          lines.push(`pred ${eventPred(id, eventName)}[${decls.join(", ")}] {\n  ${body.join("\n  ")}\n}`);
        }
        lines.push(`pred ${commandPred(id, name)}[${decls.join(", ")}] {\n  ${def.requires !== undefined ? `${formula(def.requires, cx0(id, vars))} and ` : ""}(${def.events.map((e) => `${eventPred(id, e)}[${Object.keys(def.params).map(param).join(", ")}]`).join(" or ")})\n}`);
        if (def.output) {
          const outs = def.events.map((e) => c.events![e]);
          const cx = cx0(id, vars);
          let body = "";
          for (let i = outs.length - 1; i >= 0; i--) {
            const value = outs[i].output === undefined ? "none" : term(outs[i].output, cx);
            body = i === outs.length - 1 ? value : `(${formula(outs[i].guard, cx)} => ${value} else ${body})`;
          }
          lines.push(`fun ${outFun(id, name)}[${decls.join(", ")}]: ${declOf(def.output).replace(/^one /, "")} { ${body} }`);
        }
      }
    }
    // the parts each entry may touch: all others stay unchanged
    const steps: string[] = [];
    for (const e of entries) {
      const touched = touchedBy(e.component, e.name);
      const params = Object.entries(e.params);
      const decls = params.map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
      const record = [`Step.event = ${entry(e.qualified)}`, ...params.map(([p]) => `Step.${stepField(e.qualified, p)} = ${param(p)}`)];
      const others = internal.filter(([id]) => !touched.has(id)).map(([id]) => `${unchanged(id)}`);
      const otherFields = entries.flatMap((x) => (x === e ? [] : Object.keys(x.params).map((p) => `no Step.${stepField(x.qualified, p)}`)));
      const inner = [`${commandPred(e.component, e.name)}[${params.map(([p]) => param(p)).join(", ")}]`, ...record, ...others, ...otherFields].join(" and ");
      steps.push(params.length ? `(some ${decls.join(", ")} | ${inner})` : `(${inner})`);
    }
    const stutter = [...internal.map(([id]) => unchanged(id)), "no Step.event", ...entries.flatMap((x) => Object.keys(x.params).map((p) => `no Step.${stepField(x.qualified, p)}`))].join(" and ");
    const init = internal.flatMap(([id, c]) => Object.entries(c.init ?? {}).map(([f, e]) => (Array.isArray(e) && (e[0] === "emptySet" || e[0] === "emptyMap") ? `no ${comp(id)}.${field(id, f)}` : `${comp(id)}.${field(id, f)} = ${term(e, cx0(id))}`)));
    lines.push(`fact initial_values { ${init.join(" and ") || "some Bool"} }`);
    lines.push(`fact transitions { always (${[`(${stutter})`, ...steps].join("\n  or ")}) }`);
    for (const f of envFacts) lines.push(`fact { ${f} }`);
  } catch (error) {
    if (error instanceof OutOfProfile) return { text: "", header: "", bitwidth: 0, commands: [], skipped: [`Alloy で書けないものがあります (${error.message})。Alloy では確かめず、PBT に任せます`] };
    throw error;
  }

  // commands: properties, definedness, requires of calls, reachability of every event
  const commands: CommandInfo[] = [];
  let n = 0;
  const add = (kind: CommandInfo["kind"], what: string, body: string, event?: string) => {
    commands.push({ name: `c${n++}`, kind, what, body, ...(event ? { event } : {}) });
  };
  // decision rows remembered by an event, and calls made only under a condition (as the inside of `eventually`)
  const rowSteps: { name: string; step: string }[] = [];
  const callSteps: { name: string; step: string; event: string }[] = [];
  const tryBody = (make: () => string): string | undefined => {
    try {
      return make();
    } catch (error) {
      if (error instanceof OutOfProfile) {
        skipped.push(error.message);
        return undefined;
      }
      throw error;
    }
  };
  for (const [id, c] of internal) {
    for (const [name, property] of Object.entries(c.properties ?? {})) {
      const body = tryBody(() => formula(property.is, cx0(id)));
      if (body) add("property", `${id}.${name}`, body);
    }
    for (const [command, def] of Object.entries(c.commands ?? {})) {
      const vars = new Map(Object.keys(def.params).map((p) => [p, param(p)]));
      const decls = Object.entries(def.params).map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
      const quantify = (inner: string) => (decls.length ? `always (all ${decls.join(", ")} | ${inner})` : `always (${inner})`);
      const requires = def.requires === undefined ? undefined : tryBody(() => formula(def.requires!, cx0(id, vars)));
      for (const eventName of def.events) {
        const event = c.events![eventName];
        const guard = tryBody(() => formula(event.guard, cx0(id, vars)));
        if (!guard) continue;
        // every key read is there: guards are read with the requires, the rest under the guard
        for (const [where, expr, under] of [
          ["guard", event.guard, requires],
          ...Object.entries(event.assign).map(([f, e]) => [`this.${f}`, e, requires ? `${requires} and ${guard}` : guard] as const),
          ...(event.output !== undefined ? [["output", event.output, requires ? `${requires} and ${guard}` : guard] as const] : []),
        ] as [string, Expr, string | undefined][]) {
          for (const obligation of definedness(expr, cx0(id, vars))) {
            add("defined", `${id}.${eventName} の ${where}: ${obligation.what}`, quantify(`${[under, ...obligation.context].filter(Boolean).join(" and ") || "some Bool"} implies ${obligation.holds}`));
          }
        }
        // a part is called only with arguments its requires accepts
        for (const call of event.calls) {
          const target = ir.components[call.component];
          const callee = target?.commands?.[call.command];
          if (!callee?.requires) continue;
          const body = tryBody(() => {
            const cx = cx0(id, vars);
            const when = call.when === undefined ? "" : ` and ${formula(call.when, cx)}`;
            const args: Record<string, unknown> = call.args;
            const check = withArgs(callee.requires!, callee.params, args, cx, formula, { ...cx, component: call.component });
            return quantify(`(${requires ? `${requires} and ` : ""}${guard}${when}) implies ${check}`);
          });
          if (body) add("requires", `${id}.${eventName} が ${call.component}.${call.command} を呼ぶとき`, body);
        }
        // the event can happen (for an entry: a trace that drives it, for the PBT to replay; a part's command is
        // reached through the entries that call it)
        const qualified = `${id}.${command}`;
        if (!entries.some((e) => e.qualified === qualified)) continue;
        const reachBody = tryBody(() => {
          const inner = `${requires ? `${requires} and ` : ""}${guard}`;
          return `eventually (${decls.length ? `some ${decls.join(", ")} | ` : ""}Step.event = ${entry(qualified)} and ${[...Object.keys(def.params).map((p) => `Step.${stepField(qualified, p)} = ${param(p)}`), inner].join(" and ")})`;
        });
        if (reachBody) add("reach", `${id}.${eventName}`, reachBody, `${id}.${eventName}`);
        // each row of a decision table the event reads: a trace where the event happens with that row chosen
        const remembered = new Set(decisionsIn({ ...event, guard: true, output: undefined, calls: [] }, c).map(([table]) => table));
        for (const [table, args] of decisionsIn(event, c)) {
          const rows = c.decisions![table].rows;
          rows.forEach((_, r) => {
            const body = tryBody(() => {
              const cx = cx0(id, vars);
              const chosen = rows.slice(0, r + 1).map((row, i) => {
                const when = row.when === true ? "(some Bool)" : withArgs(row.when, c.decisions![table].params, args, cx, formula);
                return i === r ? when : `not ${when}`;
              });
              const inner = `${requires ? `${requires} and ` : ""}${guard} and ${chosen.join(" and ")}`;
              return `eventually (${decls.length ? `some ${decls.join(", ")} | ` : ""}Step.event = ${entry(qualified)} and ${[...Object.keys(def.params).map((p) => `Step.${stepField(qualified, p)} = ${param(p)}`), inner].join(" and ")})`;
            });
            if (body) add("reach", `${id}.${eventName}@${table}[${r}]`, body, `${id}.${eventName}`);
            // a row whose values the event remembers: they show later, so also a trace that goes on to each call
            // made only under a condition (a due date, then a late return that charges a fee)
            if (body && remembered.has(table)) rowSteps.push({ name: `${id}.${eventName}@${table}[${r}]`, step: body.slice("eventually ".length) });
          });
        }
        // a call made only under a condition: a trace where it is made
        for (const call of event.calls) {
          if (call.when === undefined) continue;
          const body = tryBody(() => {
            const inner = `${requires ? `${requires} and ` : ""}${guard} and ${formula(call.when!, cx0(id, vars))}`;
            return `eventually (${decls.length ? `some ${decls.join(", ")} | ` : ""}Step.event = ${entry(qualified)} and ${[...Object.keys(def.params).map((p) => `Step.${stepField(qualified, p)} = ${param(p)}`), inner].join(" and ")})`;
          });
          if (body) add("reach", `${id}.${eventName}+${call.component}.${call.command}`, body, `${id}.${eventName}`);
          if (body) callSteps.push({ name: `${id}.${eventName}+${call.component}.${call.command}`, step: body.slice("eventually ".length), event: `${id}.${eventName}` });
        }
      }
    }
  }
  for (const row of rowSteps) {
    for (const call of callSteps) add("reach", `${row.name}→${call.name}`, `eventually (${row.step} and after eventually ${call.step})`, call.event);
  }
  const header = `${lines.join("\n")}\n`;
  const text = renderAlloy(header, commands, (info) => scopeOf(info, analysis, bitwidth, analysis.atoms));
  return { text, header, bitwidth, commands, skipped };
}
const scopeOf = (info: CommandInfo, analysis: Analysis, bitwidth: number, atoms: number, maxSteps = analysis.traceSteps) =>
  `for ${atoms} but ${bitwidth} Int, ${info.kind === "reach" ? `1..${maxSteps}` : analysis.steps} steps`;

/** The decision tables an event reads (through its guard, its conditions, its assignments and its answer), with the arguments. */
function decisionsIn(event: { guard: Expr; assign: Record<string, Expr>; output?: Expr; calls: { args: Record<string, Expr>; when?: Expr }[] }, c: ComponentIr): [string, Record<string, unknown>][] {
  const found = new Map<string, Record<string, unknown>>();
  const seen = new Set<string>();
  const walk = (x: unknown) => {
    if (!Array.isArray(x)) {
      if (typeof x === "object" && x !== null) Object.values(x).forEach(walk);
      return;
    }
    if (x[0] === "decide" && !found.has(x[1] as string)) found.set(x[1] as string, x[2] as Record<string, unknown>);
    // a named condition or calculation: its body, when its arguments are its own parameters (the usual case)
    if ((x[0] === "cond" || x[0] === "calc") && !seen.has(`${x[0]}:${x[1]}`)) {
      seen.add(`${x[0]}:${x[1]}`);
      const named = x[0] === "cond" ? c.conditions?.[x[1] as string] : c.calcs?.[x[1] as string];
      const args = x[2] as Record<string, unknown>;
      if (named && Object.entries(args).every(([p, a]) => Array.isArray(a) && a[0] === "var" && a[1] === p)) walk(named.is);
    }
    x.forEach(walk);
  };
  walk([event.guard, event.assign, event.output, event.calls]);
  return [...found];
}

/** Places an expression reads a key of a map: each must be there, given what was checked before it (short-circuit). */
function definedness(e: unknown, cx: Ctx, context: string[] = []): { what: string; holds: string; context: string[] }[] {
  if (!Array.isArray(e)) return [];
  const [op, ...a] = e as [string, ...unknown[]];
  const found: { what: string; holds: string; context: string[] }[] = [];
  const sub = (x: unknown, more: string[] = []) => found.push(...definedness(x, cx, [...context, ...more]));
  try {
    if (op === "apply") {
      sub(a[0]);
      sub(a[1]);
      found.push({ what: `キー ${JSON.stringify(a[1])} が ${JSON.stringify(a[0])} にある`, holds: `(${term(a[1], cx)} in ${term(a[0], cx)}.univ)`, context });
      return found;
    }
    if (op === "and") {
      a.forEach((x, i) => sub(x, a.slice(0, i).map((y) => formula(y, cx))));
      return found;
    }
    if (op === "or") {
      a.forEach((x, i) => sub(x, a.slice(0, i).map((y) => `not ${formula(y, cx)}`)));
      return found;
    }
    if (op === "implies") {
      sub(a[0]);
      sub(a[1], [formula(a[0], cx)]);
      return found;
    }
    if (op === "ite") {
      sub(a[0]);
      sub(a[1], [formula(a[0], cx)]);
      sub(a[2], [`not ${formula(a[0], cx)}`]);
      return found;
    }
    if (["some", "every", "count", "filter", "sum", "map", "find", "lit", "cond", "calc", "ask", "outputOf", "on"].includes(op)) return found;
    if (op === "field" && Array.isArray(a[0]) && a[0][0] === "decide") return found;
    for (const x of a) if (typeof x === "object" && x !== null && !Array.isArray(x)) Object.values(x).forEach((y) => sub(y));
    else sub(x);
  } catch (error) {
    if (!(error instanceof OutOfProfile)) throw error;
  }
  return found;
}

// --- Running Alloy ---

const ALLOY_VERSION = "6.2.0";
const ALLOY_URL = `https://github.com/AlloyTools/org.alloytools.alloy/releases/download/v${ALLOY_VERSION}/org.alloytools.alloy.dist.jar`;
/** Where the Alloy jar is: `CLP_ALLOY_JAR`, or the user's cache (downloaded once, `clp` asks for nothing else). */
export function alloyJar(): string {
  if (process.env.CLP_ALLOY_JAR) return process.env.CLP_ALLOY_JAR;
  const dir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp");
  const jar = join(dir, `alloy-${ALLOY_VERSION}.jar`);
  if (existsSync(jar)) return jar;
  mkdirSync(dir, { recursive: true });
  const fetched = spawnSync("curl", ["-sfL", "-o", jar, ALLOY_URL], { encoding: "utf8", timeout: 300_000 });
  if (fetched.status !== 0 || !existsSync(jar)) {
    rmSync(jar, { force: true });
    throw new Error(`Alloy ${ALLOY_VERSION} を取得できませんでした (${ALLOY_URL})。手元の jar を CLP_ALLOY_JAR で指定してください`);
  }
  return jar;
}

export function javaAvailable(): boolean {
  return spawnSync("java", ["-version"], { encoding: "utf8" }).status === 0;
}

function runAlloy(text: string): { receipt?: { commands: Record<string, { solution?: { instances: unknown[] }[]; type: string }> }; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "clp-alloy-"));
  try {
    writeFileSync(join(dir, "spec.als"), text);
    // a native solver when the platform has one (several times faster), SAT4J otherwise
    const exec = (solver: string[]) =>
      spawnSync("java", ["-Djava.awt.headless=true", "-jar", alloyJar(), "exec", "-f", "-q", "-t", "json", "-o", join(dir, "out"), "-n", ...solver, join(dir, "spec.als")], { encoding: "utf8", timeout: 1_800_000 });
    let run = exec(["-s", "glucose"]);
    const receipt = join(dir, "out", "receipt.json");
    if (!existsSync(receipt) && /solver|glucose|UnsatisfiedLink/i.test(`${run.stdout}${run.stderr}`)) run = exec([]);
    if (!existsSync(receipt)) {
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}${run.error?.message ?? ""}`;
      // the message, without the stack trace
      const message = output.split("\n").filter((line) => !/^\s*at |WARNING|Picked up/.test(line)).join("\n").trim();
      return { output: message.replaceAll(join(dir, "spec.als"), "spec.als") };
    }
    return { receipt: JSON.parse(readFileSync(receipt, "utf8")), output: run.stdout ?? "" };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** An Alloy instance (one trace) as the common trace format: which entry happened at each step, with what, and what the outside world answered. */
function traceOf(instances: { values: Record<string, Record<string, string[][]>> }[], ir: Ir8, untilEvent?: string): TraceStep[] {
  const entries = entriesOf(ir).filter((e) => e.kind === "command");
  const atom = (name: string) => name.replace(/^(.*)\$(\d+)$/, (_, base: string, n: string) => `${base.replace(/^s_/, "")}-a${n}`);
  const strings = new Map(literalStrings(ir).map((s, i) => [`str_${i}$0`, s]));
  const value = (raw: string, type: Type): unknown => {
    if (type === "int") return Number(raw);
    if (type === "bool") return raw.startsWith("True");
    if (typeof type === "object" && "optional" in type) return value(raw, type.optional);
    if (typeof type === "object" && "enum" in type && type.enum.every((v) => typeof v === "number")) return Number(raw);
    if (strings.has(raw)) return strings.get(raw);
    return atom(raw);
  };
  const steps: TraceStep[] = [];
  for (const instance of instances) {
    const step = instance.values.Step$0 ?? {};
    const event = step.event?.[0]?.[0];
    if (!event) continue;
    const e = entries.find((x) => entry(x.qualified) === event.replace(/\$\d+$/, ""));
    if (!e) continue;
    const params = Object.fromEntries(Object.entries(e.params).map(([p, t]) => [p, value(step[stepField(e.qualified, p)]?.[0]?.[0] ?? "", t)]));
    const env = instance.values.Env$0 ?? {};
    const answers: Record<string, unknown> = {};
    for (const [id, c] of Object.entries(ir.components)) {
      for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
        const raw = env[envField(`${id}.${port}`)];
        if (!raw?.length) continue;
        if (Object.keys(q.params).length === 0) answers[`${id}.${port}`] = value(raw[0][0], q.result);
        else answers[`${id}.${port}`] = raw.map(([k, v]) => ({ key: value(k, Object.values(q.params)[0]), value: value(v, q.result) }));
        if (env[`${envField(`${id}.${port}`)}_failed`]?.length) answers[`${id}.${port}`] = "(failed)";
      }
    }
    steps.push({ event: entryName(ir, e.qualified), params, ...(Object.keys(answers).length ? { answers } : {}) });
    void untilEvent;
  }
  return steps;
}

export const alloy6: Checker = {
  name: "alloy6",
  emit(ir, analysis) {
    const { text, commands, skipped } = emitAlloy(ir, analysis);
    const files: GeneratedFiles = text ? { "spec.als": text } : {};
    return { files, commands, skipped };
  },
  run(files) {
    return files["spec.als"] ? runAlloy(files["spec.als"]) : { output: "" };
  },
  read(raw, commands, ir) {
    const receipt = raw.receipt as { commands?: Record<string, { solution?: { instances: { values: Record<string, Record<string, string[][]>> }[] }[] }> } | undefined;
    return commands.map((info): Verdict => {
      const result = receipt?.commands?.[info.name];
      const solution = result?.solution?.[0];
      const trace = solution ? traceOf(solution.instances, ir) : undefined;
      if (info.kind === "reach") return { command: info.name, kind: "reach", what: info.what, status: !result ? "out-of-range" : solution ? "reached" : "unreachable", ...(trace ? { trace } : {}) };
      return { command: info.name, kind: info.kind, what: info.what, status: !result ? "out-of-range" : solution ? "broken" : "holds", ...(trace ? { trace } : {}) };
    });
  },
};

const EMITTER = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");

/** Runs the checker on an IR, with a cache keyed by the IR and the analysis (the result is a function of both). */
export function checkWithAlloy(ir: Ir8, analysis: Analysis = DEFAULT_ANALYSIS): CheckResult {
  // the key covers how the module is written, too (this file), so a fix here is never hidden by an old result
  const key = createHash("sha256").update(stableStringify8({ ir, analysis, checker: alloy6.name, emitter: EMITTER })).digest("hex");
  const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-results");
  const cached = join(cacheDir, `${key}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")) as CheckResult;
  const { files, commands, skipped } = alloy6.emit(ir, analysis);
  const raw = alloy6.run(files);
  if (files["spec.als"] && !raw.receipt) {
    return { checker: alloy6.name, skipped: [...skipped, `Alloy を実行できませんでした: ${raw.output.trim().slice(-800)}`], verdicts: [] };
  }
  let verdicts = alloy6.read(raw, commands, ir);
  // events not reached in the small scope: searched for again, with more atoms and longer traces
  const missed = verdicts.filter((v) => v.kind === "reach" && v.status === "unreachable").map((v) => v.command);
  if (missed.length > 0) {
    const { header, bitwidth } = emitAlloy(ir, analysis);
    const again = commands.filter((c) => missed.includes(c.name));
    const wide = alloy6.run({ "spec.als": renderAlloy(header, again, (info) => scopeOf(info, analysis, bitwidth, analysis.wideAtoms, analysis.maxTraceSteps)) });
    if (wide.receipt) {
      const found = new Map(alloy6.read(wide, again, ir).map((v) => [v.command, v]));
      verdicts = verdicts.map((v) => found.get(v.command) ?? v);
    }
  }
  const result: CheckResult = { checker: alloy6.name, ...(skipped.length ? { skipped } : {}), verdicts };
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cached, JSON.stringify(result));
  return result;
}

export type { ComponentIr };
