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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { ComponentIr, Expr, Ir8, TraceStep, Type } from "./ir.ts";
import { entriesOf, entryName } from "./pbt.ts";
import { stableStringify8 } from "./generate.ts";
import { intsOf, relevanceOf } from "./abstraction.ts";
import type { Ints } from "./abstraction.ts";

// --- The checker interface (DSL.md §17.12) ---

/**
 * The scope of the analysis (outside the IR; DSL.md §17.16). Properties are checked over `steps` steps with `atoms`
 * atoms of each kind; a trace to an event is searched for up to `traceSteps` steps, and an event not reached so is
 * searched for again with `wideAtoms` atoms up to `maxTraceSteps` steps (a limit of five books needs six books).
 */
export type Analysis = { atoms: number; bitwidth?: number; steps: number; traceSteps: number; wideAtoms: number; maxTraceSteps: number };
export const DEFAULT_ANALYSIS: Analysis = { atoms: 3, steps: 6, traceSteps: 8, wideAtoms: 6, maxTraceSteps: 12 };
export type GeneratedFiles = Record<string, string>;
/**
 * How far a verdict reaches: `exhaustive` — every input (a query of a component with no state and finite inputs);
 * `partial` — some events were left out of the module (a trace that is found is real; one that is not may exist);
 * otherwise bounded by the scope of the analysis.
 */
export type Bound = "exhaustive" | "partial";
export type Verdict =
  | { command: string; kind: "property" | "defined" | "requires"; status: "holds" | "broken" | "out-of-range"; what: string; trace?: TraceStep[]; bound?: Bound }
  | { command: string; kind: "reach"; status: "reached" | "unreachable" | "out-of-range"; what: string; trace?: TraceStep[]; bound?: Bound };
export type CheckResult = { checker: string; skipped?: string[]; verdicts: Verdict[] };
export interface Checker {
  name: string;
  emit(ir: Ir8, analysis: Analysis): { files: GeneratedFiles; commands: CommandInfo[]; skipped: string[] };
  run(files: GeneratedFiles): { output: string; receipt?: unknown };
  read(raw: { receipt?: unknown }, commands: CommandInfo[], ir: Ir8): Verdict[];
}
export type CommandInfo = { name: string; kind: Verdict["kind"]; what: string; event?: string; body: string; bound?: Bound };

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
  /** What the module could not declare (`state:<id>.<field>`, `env:<id>.<port>`, `out:<id>.<command>`): reading it is out of the profile. */
  missing?: Set<string>;
  /** How the spec's numbers are written (replaced by small ones in the same order when they do not fit). */
  ints?: Ints;
  /** Lists in the state, as sets of slots (`<id>.<field>`); the names bound to a slot, and the list it is of. */
  lists?: Map<string, ListInfo>;
  slotVars?: Map<string, string>;
  /** Strings carry their length and their trimmed form (the spec uses `length` or `trim`). */
  stringOps?: boolean;
};

/**
 * A list in the state (DSL.md §17.20, E): the checks never look at its order (an operation that does is out of the
 * profile), so it is a set of slots, each holding one element in mutable fields (`v` for an element that is not a
 * record). Two equal elements are two slots, so counting them is exact.
 */
type ListInfo = { slot: string; fields: Record<string, Type>; record: boolean };
const elemField = (key: string, k: string) => `e_${safe(key)}_${safe(k)}`;
/** The list a collection expression ranges over (a list field, or a filter of one). */
function listOf(coll: unknown, cx: Ctx): string | undefined {
  if (!Array.isArray(coll)) return undefined;
  if (coll[0] === "state") {
    const key = `${cx.component}.${coll[1]}`;
    return cx.lists?.has(key) ? key : undefined;
  }
  if (coll[0] === "filter") return listOf(coll[1], cx);
  return undefined;
}
/**
 * Parameters with records taken apart (DSL.md §17.20, E): a record given to a command is its fields, one parameter
 * each (`body.title`), so no record is ever compared as a whole. A field that is itself a record is left as it is (and
 * cannot be declared).
 */
function flatParams(params: Record<string, Type>): Record<string, Type> {
  const out: Record<string, Type> = {};
  for (const [p, t] of Object.entries(params)) {
    if (typeof t === "object" && "record" in t) for (const [k, kt] of Object.entries(t.record)) out[`${p}.${k}`] = kt;
    else out[p] = t;
  }
  return out;
}
/** The arguments of a call, for the parameters taken apart. */
const argTerms = (params: Record<string, Type>, args: Record<string, unknown>, cx: Ctx): string[] =>
  Object.keys(flatParams(params)).map((p) => (p.includes(".") ? fieldTerm(args[p.split(".")[0]], p.slice(p.indexOf(".") + 1), cx) : term(args[p], cx)));
/** A field of a record that is not in a list: of a record written out, of a parameter taken apart, of an answer read. */
function fieldTerm(inner: unknown, k: string, cx: Ctx): string {
  if (Array.isArray(inner)) {
    if (inner[0] === "record") return term((inner[1] as Record<string, unknown>)[k], cx);
    if (inner[0] === "var" && cx.vars.has(`${inner[1]}.${k}`)) return cx.vars.get(`${inner[1]}.${k}`)!;
    if (inner[0] === "outputOf") {
      const [, id, command, args] = inner as [string, string, string, Record<string, unknown>];
      if (cx.missing?.has(`out:${id}.${command}.${k}`) || cx.missing?.has(`out:${id}.${command}`)) return unsupported(`${id}.${command} の答えの ${k}`);
      return `${outFun(id, command)}_${safe(k)}[${argTerms(cx.ir.components[id].commands![command].params, args, cx).join(", ")}]`;
    }
  }
  return unsupported("組のフィールド");
}
const slotOf = (e: unknown, cx: Ctx): string | undefined => (Array.isArray(e) && e[0] === "var" ? cx.slotVars?.get(e[1] as string) : undefined);

/** A number of the spec as written in the module. */
function intTerm(n: number, ints: Ints | undefined): string {
  const v = ints ? ints.toAlloy(n) : n;
  if (v === undefined) return unsupported(`数 ${n}`);
  return v < 0 ? `minus[0, ${-v}]` : String(v);
}

function sigOf(t: Type): string {
  if (t === "int") return "Int";
  if (t === "bool") return "Bool";
  if (t === "string") return "Str";
  // a JSON value the checks only pass on and compare: a number, a string, a truth value, or an atom with nothing inside
  if (t === "json") return JSON_VALUE;
  if ("enum" in t) {
    if (t.enum.every((v) => typeof v === "string")) return "Str";
    if (t.enum.every((v) => typeof v === "number")) return "Int";
    return "Bool";
  }
  if ("atom" in t) return sort(t.atom);
  if ("optional" in t) return sigOf(t.optional);
  return unsupported(`型 ${JSON.stringify(t)}`);
}
const JSON_VALUE = "(Json + Int + Str + Bool)";
/** A field or parameter declaration: `one X`, `lone X`, `set X`, `K -> lone V`. */
function declOf(t: Type): string {
  // null is a JSON value too
  if (t === "json") return `lone ${JSON_VALUE}`;
  if (typeof t === "object" && "optional" in t) return `lone ${sigOf(t.optional)}`;
  if (typeof t === "object" && "set" in t) return `set ${sigOf(t.set)}`;
  if (typeof t === "object" && "map" in t) return `${sigOf(t.map[0])} -> lone ${sigOf(t.map[1])}`;
  return `one ${sigOf(t)}`;
}

/** What a value of an enumerated type may be (Alloy declares it as any `Str` or `Int`): a formula, or undefined. */
function typingOf(name: string, t: Type, strings: Map<string, string>, ints?: Ints): string | undefined {
  if (typeof t === "object" && "optional" in t) return typingOf(name, t.optional, strings, ints);
  if (typeof t !== "object" || !("enum" in t)) return undefined;
  if (t.enum.every((v) => typeof v === "string")) return `${name} in (${t.enum.map((v) => strings.get(v as string)!).join(" + ")})`;
  if (t.enum.every((v) => typeof v === "number")) return `${name} in (${t.enum.map((v) => intTerm(v as number, ints)).join(" + ")})`;
  return undefined;
}
/** The typing of parameters, as a conjunction ("" when there is nothing to say). */
const typingOfParams = (params: Record<string, Type>, strings: Map<string, string>, ints?: Ints, name: (p: string) => string = param) =>
  Object.entries(params)
    .flatMap(([p, t]) => typingOf(name(p), t, strings, ints) ?? [])
    .join(" and ");
const finiteType = (t: Type): boolean => t === "bool" || (typeof t === "object" && (("enum" in t) || ("optional" in t && finiteType(t.optional))));

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
      // two records are equal by their fields; two slots are equal only when they are the same slot
      if ([a[0], a[1]].some((x) => { const key = slotOf(x, cx); return key !== undefined && cx.lists!.get(key)!.record; })) return unsupported("組どうしの比較");
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
  const list = listOf(coll, cx);
  if (list !== undefined) cx.slotVars?.set(x, list);
  else cx.slotVars?.delete(x);
  return { decls: `b_${safe(x)}: ${c}`, vars };
}
function typeOfColl(coll: unknown, cx: Ctx): "set" | "map" {
  if (Array.isArray(coll)) {
    if (coll[0] === "state") {
      const t = cx.ir.components[cx.component].state?.[coll[1] as string];
      if (t && typeof t === "object" && "map" in t) return "map";
      if (t && typeof t === "object" && "list" in t && listOf(coll, cx) === undefined) unsupported("並び (List)");
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
  if (typeof e === "number") return intTerm(e, cx.ints);
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
    case "var": {
      const name = cx.vars.get(a[0] as string) ?? unsupported(`名前 ${String(a[0])}`);
      const key = slotOf(e, cx);
      if (key === undefined) return name;
      // an element of a list: its value (a record is read through its fields)
      if (cx.lists!.get(key)!.record) return unsupported("並びの要素の組そのもの");
      return `(${name}.${elemField(key, "v")})`;
    }
    case "len": {
      if (listOf(a[0], cx) === undefined) return unsupported("並び (List) の長さ");
      return `#${t(a[0])}`;
    }
    case "strlen":
      if (!cx.stringOps) return unsupported("文字列の長さ");
      return `(${t(a[0])}.len)`;
    case "trim":
      if (!cx.stringOps) return unsupported("文字列の trim");
      return `(${t(a[0])}.trimmed)`;
    case "state":
      if (cx.missing?.has(`state:${cx.component}.${a[0]}`)) return unsupported(`状態 ${cx.component}.${a[0]} (その型)`);
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
      const key = slotOf(inner, cx);
      if (key !== undefined) return `(${cx.vars.get((inner as string[])[1])}.${elemField(key, column)})`;
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
      return fieldTerm(inner, column, cx);
    }
    case "ask": {
      const [id, port, args] = a as [string, string, Record<string, unknown>];
      const target = cx.ir.components[id];
      if (target.external) {
        if (cx.missing?.has(`env:${id}.${port}`)) return unsupported(`外の世界の問い合わせ ${id}.${port}`);
        const def = target.external.queries[port];
        const env = `Env.${envField(`${id}.${port}`)}`;
        const params = Object.keys(def.params);
        if (params.length === 0) return env;
        if (params.length > 1) return unsupported("引数が2つ以上ある外の世界の問い合わせ");
        return `(${term(args[params[0]], cx)}.(${env}))`;
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
      if (cx.missing?.has(`out:${id}.${command}`)) return unsupported(`${id}.${command} の答え`);
      if (typeof cx.ir.components[id].commands![command].output === "object" && "record" in (cx.ir.components[id].commands![command].output as object)) return unsupported(`${id}.${command} の答えの組そのもの`);
      return `${outFun(id, command)}[${argTerms(cx.ir.components[id].commands![command].params, args, cx).join(", ")}]`;
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

const usesStringOps = (ir: Ir8): boolean => JSON.stringify(ir.components).includes('["strlen",') || JSON.stringify(ir.components).includes('["trim",');
/** The string constants of the module: the spec's, and with `length` / `trim`, the empty string and every constant trimmed. */
function stringsOf(ir: Ir8): string[] {
  const found = literalStrings(ir);
  if (!usesStringOps(ir)) return found;
  return [...new Set([...found, "", ...found.map((s) => s.trim())])].sort();
}
/** The integers of the module (the lengths of the string constants are constants too, when lengths are compared). */
function moduleInts(ir: Ir8, fixed?: number) {
  const relevance = relevanceOf(ir);
  if (usesStringOps(ir)) for (const s of stringsOf(ir)) relevance.numbers.add([...s].length).add(0);
  return { relevance, made: intsOf(relevance, fixed) };
}

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

/** The module and its commands, with the scope of each command. */
export function renderAlloy(header: string, commands: CommandInfo[], scope: (info: CommandInfo) => string): string {
  return `${header}${commands.map((info) => `${info.kind === "reach" ? "run" : "check"} ${info.name} { ${info.body} } ${scope(info)}`).join("\n")}\n`;
}

export function emitAlloy(ir: Ir8, analysis: Analysis = DEFAULT_ANALYSIS): { text: string; header: string; bitwidth: number; commands: CommandInfo[]; skipped: string[]; constants?: number } {
  const skipped: string[] = [];
  // only what the checks look at is kept, and its numbers made to fit (abstraction.ts)
  const { relevance, made } = moduleInts(ir, analysis.bitwidth);
  if ("reason" in made) return { text: "", header: "", bitwidth: 0, commands: [], skipped: [made.reason] };
  const ints = made;
  const bitwidth = ints.bitwidth;
  const stringOps = usesStringOps(ir);
  const strings = new Map(stringsOf(ir).map((s, i) => [s, `str_${i}`]));
  const lines: string[] = [`module spec`, ``, `abstract sig Bool {}`, `one sig True, False extends Bool {}`, stringOps ? `sig Str { len: one Int, trimmed: one Str }` : `sig Str {}`, `sig Json {}`];
  if (strings.size) lines.push(`one sig ${[...strings.values()].join(", ")} extends Str {}`);
  if (stringOps) {
    // what every string is (its trimmed form is trimmed, no longer than it; only the empty string has length 0), and what each constant is
    const facts = [`all s: Str | s.len >= 0 and s.trimmed.trimmed = s.trimmed and s.trimmed.len <= s.len and (s.len = 0 iff s = ${strings.get("")})`];
    for (const [text, name] of strings) facts.push(`${name}.len = ${intTerm([...text].length, ints)} and ${name}.trimmed = ${strings.get(text.trim())}`);
    lines.push(`fact strings { ${facts.join(" and ")} }`);
  }
  for (const s of ir.sorts) lines.push(`sig ${sort(s)} {}`);
  const internal = Object.entries(ir.components).filter(([, c]) => !c.external);
  // lists in the state, as sets of slots
  const lists = new Map<string, ListInfo>();
  for (const [id, c] of internal) {
    for (const [f, t] of Object.entries(c.state ?? {})) {
      if (typeof t !== "object" || !("list" in t)) continue;
      const elem = t.list;
      const record = typeof elem === "object" && "record" in elem;
      lists.set(`${id}.${f}`, { slot: `Slot_${safe(id)}_${safe(f)}`, fields: record ? (elem as { record: Record<string, Type> }).record : { v: elem }, record });
    }
  }
  const slotVars = new Map<string, string>();
  // what cannot be declared is left out, and whatever reads it is left out with it (DSL.md §17.20)
  const missing = new Set<string>();
  const cx0 = (component: string, vars = new Map<string, string>()): Ctx => ({ ir, component, vars, strings, missing, ints, lists, slotVars, stringOps });
  /** The slots of a list keep what they hold (all of them, or all but `except`). */
  const slotsKept = (key: string, except?: string) =>
    Object.keys(lists.get(key)!.fields)
      .map((k) => `(all s: ${lists.get(key)!.slot}${except ? ` - (${except})` : ""} | s.${elemField(key, k)}' = s.${elemField(key, k)})`)
      .join(" and ");
  /** A state field stays as it is. */
  const same = (id: string, f: string) => {
    const now = `${comp(id)}.${field(id, f)}`;
    return lists.has(`${id}.${f}`) ? `${now}' = ${now} and ${slotsKept(`${id}.${f}`)}` : `${now}' = ${now}`;
  };
  /** A list field written: the operations on lists the checks can follow (a filter, a map, appending, a choice between them). */
  const listWritten = (id: string, f: string, e: unknown, cx: Ctx): string => {
    const key = `${id}.${f}`;
    const info = lists.get(key)!;
    const now = `${comp(id)}.${field(id, f)}`;
    const isThis = (x: unknown) => Array.isArray(x) && x[0] === "state" && x[1] === f;
    if (!Array.isArray(e)) return unsupported("並びへの代入");
    if (isThis(e)) return same(id, f);
    if (e[0] === "ite") return `(${formula(e[1], cx)} implies (${listWritten(id, f, e[2], cx)}) else (${listWritten(id, f, e[3], cx)}))`;
    if (e[0] === "filter" && isThis(e[1])) return `${now}' = ${term(e, cx)} and ${slotsKept(key)}`;
    // a field of the element an expression gives (a record, a record with fields changed, a choice, the element itself)
    const elementField = (x: unknown, k: string, inner: Ctx): string => {
      if (!info.record) return term(x, inner);
      if (Array.isArray(x)) {
        if (x[0] === "record") return term((x[1] as Record<string, unknown>)[k], inner);
        if (x[0] === "with") return k in (x[2] as Record<string, unknown>) ? term((x[2] as Record<string, unknown>)[k], inner) : elementField(x[1], k, inner);
        if (x[0] === "ite") return `(${formula(x[1], inner)} => ${elementField(x[2], k, inner)} else ${elementField(x[3], k, inner)})`;
        if (x[0] === "var" && slotOf(x, inner) === key) return `(${inner.vars.get(x[1] as string)}.${elemField(key, k)})`;
      }
      return unsupported("並びの要素の組");
    };
    if (e[0] === "map" && isThis(e[1])) {
      const [binder] = e[2] as string[];
      const { decls, vars } = bind(e[1], [binder], cx);
      const inner = { ...cx, vars };
      const b = vars.get(binder)!;
      const fields = Object.keys(info.fields).map((k) => `${b}.${elemField(key, k)}' = ${elementField(e[3], k, inner)}`);
      return `${now}' = ${now} and (all ${decls} | ${fields.join(" and ")}) and ${slotsKept(key, now)}`;
    }
    if (e[0] === "concat" && isThis(e[1]) && Array.isArray(e[2]) && e[2][0] === "list") {
      const items = (e[2] as unknown[]).slice(1);
      if (items.length === 0) return same(id, f);
      const fresh = items.map((_, i) => `n_${i}`);
      const holds = items.flatMap((item, i) => Object.keys(info.fields).map((k) => `${fresh[i]}.${elemField(key, k)}' = ${elementField(item, k, cx)}`));
      return `(some ${fresh.length > 1 ? "disj " : ""}${fresh.join(", ")}: ${info.slot} - ${now} | ${now}' = ${now} + ${fresh.join(" + ")} and ${holds.join(" and ")} and ${slotsKept(key, fresh.join(" + "))})`;
    }
    // a list written out: exactly that many slots, holding those elements
    if (e[0] === "list") {
      const items = (e as unknown[]).slice(1);
      if (items.length === 0) return `no ${now}' and ${slotsKept(key)}`;
      const fresh = items.map((_, i) => `n_${i}`);
      const holds = items.flatMap((item, i) => Object.keys(info.fields).map((k) => `${fresh[i]}.${elemField(key, k)}' = ${elementField(item, k, cx)}`));
      return `(some ${fresh.length > 1 ? "disj " : ""}${fresh.join(", ")}: ${info.slot} | ${now}' = ${fresh.join(" + ")} and ${holds.join(" and ")} and ${slotsKept(key, fresh.join(" + "))})`;
    }
    return unsupported(`並びへの代入 (${e[0]})`);
  };
  // a state field no check reads (only answers and the outside world do) is not declared; writing it is left out
  for (const [id, c] of internal) for (const f of Object.keys(c.state ?? {})) if (!relevance.fields.has(`${id}.${f}`)) missing.add(`state:${id}.${f}`);
  /** Whether an expression the checks do not need can still be written as it is (its numbers fit, unreplaced). */
  const writable = (x: unknown): boolean => {
    if (ints.embedded) return false;
    const limit = 2 ** (bitwidth - 1);
    const walk = (y: unknown): boolean => (typeof y === "number" ? Math.abs(y) < limit : Array.isArray(y) ? y[0] === "lit" || y.every(walk) : y && typeof y === "object" ? Object.values(y).every(walk) : true);
    return walk(x);
  };
  const declared = (id: string, c: ComponentIr) => Object.keys(c.state ?? {}).filter((f) => !missing.has(`state:${id}.${f}`));
  /** Events left out (something in them cannot be written); a module without them checks fewer behaviours. */
  const dropped = new Set<string>();
  const reasons = new Map<string, string>();
  const declare = (key: string, make: () => string): string | undefined => {
    try {
      return make();
    } catch (error) {
      if (!(error instanceof OutOfProfile)) throw error;
      missing.add(key);
      reasons.set(key, error.message);
      return undefined;
    }
  };
  // a command whose parameters cannot be declared is left out with its events
  const dropCommand = (id: string, name: string) => {
    missing.add(`cmd:${id}.${name}`);
    for (const e of ir.components[id].commands![name].events) dropped.add(`${id}.${e}`);
  };
  for (const [id, c] of internal) {
    for (const [name, def] of Object.entries(c.commands ?? {})) {
      if (declare(`params:${id}.${name}`, () => Object.values(flatParams(def.params)).map(declOf).join()) === undefined) dropCommand(id, name);
    }
  }
  const entries = entriesOf(ir).filter((e) => e.kind === "command" && !missing.has(`cmd:${e.qualified}`));
  /** The entries that may ask a query of the outside world (through what they call, and the named parts they read): more is safe. */
  const entriesAsking = (id: string, port: string): string[] => {
    const needle = JSON.stringify(["ask", id, port]).slice(0, -1);
    const named = new Set<string>();
    // names whose bodies ask it (conditions, calculations, decisions, queries), to a fixed point
    for (let before = -1; before !== named.size; ) {
      before = named.size;
      for (const [cid, c] of Object.entries(ir.components)) {
        const bodies: [string, unknown][] = [
          ...Object.entries(c.conditions ?? {}).map(([n, x]) => [`["cond","${n}"`, x] as [string, unknown]),
          ...Object.entries(c.calcs ?? {}).map(([n, x]) => [`["calc","${n}"`, x] as [string, unknown]),
          ...Object.entries(c.decisions ?? {}).map(([n, x]) => [`["decide","${n}"`, x] as [string, unknown]),
          ...Object.entries(c.queries ?? {}).map(([n, x]) => [`["ask","${cid}","${n}"`, x] as [string, unknown]),
        ];
        for (const [key, body] of bodies) {
          const text = JSON.stringify(body);
          if (text.includes(needle) || [...named].some((n) => text.includes(n))) named.add(key);
        }
      }
    }
    const asks = (x: unknown) => {
      const text = JSON.stringify(x);
      return text.includes(needle) || [...named].some((n) => text.includes(n));
    };
    const commandAsks = (cid: string, name: string, seen = new Set<string>()): boolean => {
      if (seen.has(`${cid}.${name}`)) return false;
      seen.add(`${cid}.${name}`);
      const c = ir.components[cid];
      return (c.commands?.[name]?.events ?? []).some((e) => asks(c.events![e]) || c.events![e].calls.some((call) => !ir.components[call.component]?.external && commandAsks(call.component, call.command, seen)));
    };
    return entries.filter((e) => commandAsks(e.component, e.name)).map((e) => e.qualified);
  };
  try {
    // state
    for (const [id, c] of internal) {
      const fields = Object.entries(c.state ?? {}).flatMap(([f, t]) => {
        if (missing.has(`state:${id}.${f}`)) return [];
        const list = lists.get(`${id}.${f}`);
        if (list) {
          const slot = declare(`state:${id}.${f}`, () => `sig ${list.slot} { ${Object.entries(list.fields).map(([k, kt]) => `var ${elemField(`${id}.${f}`, k)}: ${declOf(kt).replace(/^one /, "lone ")}`).join(", ")} }`);
          if (slot === undefined) return [];
          lines.push(slot);
          return [`var ${field(id, f)}: set ${list.slot}`];
        }
        return declare(`state:${id}.${f}`, () => `var ${field(id, f)}: ${declOf(t)}`) ?? [];
      });
      lines.push(`one sig ${comp(id)} {${fields.length ? ` ${fields.join(", ")} ` : ""}}`);
    }
    // the outside world: one answer per step for each query (a function of the arguments, for one with a parameter)
    const envFields: string[] = [];
    const envFacts: string[] = [];
    for (const [id, c] of Object.entries(ir.components)) {
      for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
        const name = envField(`${id}.${port}`);
        const params = Object.values(q.params);
        const decl = declare(`env:${id}.${port}`, () => {
          if (params.length > 1) unsupported(`引数が2つ以上ある外の世界の問い合わせ ${id}.${port}`);
          return params.length === 0 ? `var ${name}: ${declOf(q.result)}` : `var ${name}: ${sigOf(params[0])} -> ${declOf(q.result).replace(/^one /, "one ")}`;
        });
        if (decl === undefined) continue;
        envFields.push(decl);
        const answers = params.length === 0 ? `Env.${name}` : `univ.(Env.${name})`;
        const typing = typingOf(answers, q.result, strings, ints);
        if (typing) envFacts.push(`always (${typing})`);
        if (q.mayFail) envFields.push(`var ${name}_failed: lone Bool`);
        if (q.promise === "increasing") envFacts.push(`always (Env.${name}' >= Env.${name})`);
        // fresh: never an answer given before, at a step that may ask it (the stand-in remembers what it answered)
        if (q.promise === "fresh") {
          const askers = entriesAsking(id, port);
          envFields.push(`var ${name}_used: set ${sigOf(q.result)}`);
          envFacts.push(`no Env.${name}_used`);
          // (`some`: a step without an event is in every set)
          const asks = askers.length ? `(some Step.event and Step.event in (${askers.map(entry).join(" + ")}))` : "(no Bool)";
          envFacts.push(`always (${asks} implies (Env.${name} not in Env.${name}_used and Env.${name}_used' = Env.${name}_used + Env.${name}) else Env.${name}_used' = Env.${name}_used)`);
        }
      }
    }
    lines.push(`one sig Env {${envFields.length ? ` ${envFields.join(", ")} ` : ""}}`);
    // which entry happened, and with what (to read traces back)
    // with lengths, a string input's length and trimmed form are recorded too (Alloy reports only what changes in time)
    const companions = (e: (typeof entries)[number]) =>
      stringOps
        ? Object.entries(flatParams(e.params))
            .filter(([, t]) => t === "string")
            .flatMap(([p]) => [
              { name: stepField(e.qualified, `${p}__len`), sig: "Int", of: `${param(p)}.len` },
              { name: stepField(e.qualified, `${p}__trim`), sig: "Str", of: `${param(p)}.trimmed` },
              { name: stepField(e.qualified, `${p}__trimlen`), sig: "Int", of: `${param(p)}.trimmed.len` },
            ])
        : [];
    const stepFields = [
      `var event: lone Entry`,
      ...entries.flatMap((e) => [...Object.entries(flatParams(e.params)).map(([p, t]) => `var ${stepField(e.qualified, p)}: lone ${sigOf(t)}`), ...companions(e).map((c) => `var ${c.name}: lone ${c.sig}`)]),
    ];
    lines.push(`abstract sig Entry {}`);
    if (entries.length) lines.push(`one sig ${entries.map((e) => entry(e.qualified)).join(", ")} extends Entry {}`);
    lines.push(`one sig Step { ${stepFields.join(", ")} }`);
    // named conditions as predicates are inlined (with let); outputs of commands called by others as functions
    for (const [id, c] of internal) {
      lines.push(`pred ${unchanged(id)} { ${declared(id, c).map((f) => same(id, f)).join(" and ") || "some Bool"} }`);
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
    // the answers other components read, before any event that reads them
    for (const [id, c] of internal) {
      for (const [name, def] of Object.entries(c.commands ?? {})) {
        if (missing.has(`cmd:${id}.${name}`)) continue;
        const vars = new Map(Object.keys(flatParams(def.params)).map((p) => [p, param(p)]));
        const decls = Object.entries(flatParams(def.params)).map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
        // the answer, when another component reads it
        // a record answer: one function per field
        if (def.output && relevance.outputs.has(`${id}.${name}`) && typeof def.output === "object" && "record" in def.output) {
          for (const [k, kt] of Object.entries(def.output.record)) {
            const fun = declare(`out:${id}.${name}.${k}`, () => {
              const cx = cx0(id, vars);
              const outs = def.events.map((e) => c.events![e]);
              let body = "";
              for (let i = outs.length - 1; i >= 0; i--) {
                const value = outs[i].output === undefined || outs[i].output === null ? "none" : fieldTerm(outs[i].output, k, cx);
                body = i === outs.length - 1 ? value : `(${formula(outs[i].guard, cx)} => ${value} else ${body})`;
              }
              return `fun ${outFun(id, name)}_${safe(k)}[${decls.join(", ")}]: ${declOf(kt).replace(/^one /, "")} { ${body} }`;
            });
            if (fun !== undefined) lines.push(fun);
          }
        } else if (def.output && relevance.outputs.has(`${id}.${name}`)) {
          const fun = declare(`out:${id}.${name}`, () => {
            const outs = def.events.map((e) => c.events![e]);
            const cx = cx0(id, vars);
            let body = "";
            for (let i = outs.length - 1; i >= 0; i--) {
              const value = outs[i].output === undefined ? "none" : term(outs[i].output, cx);
              body = i === outs.length - 1 ? value : `(${formula(outs[i].guard, cx)} => ${value} else ${body})`;
            }
            return `fun ${outFun(id, name)}[${decls.join(", ")}]: ${declOf(def.output!).replace(/^one /, "")} { ${body} }`;
          });
          if (fun !== undefined) lines.push(fun);
        }
      }
    }
    // the parts a command may touch (itself and every part it calls, transitively)
    for (const [id, c] of internal) {
      for (const [name, def] of Object.entries(c.commands ?? {})) {
        if (missing.has(`cmd:${id}.${name}`)) continue;
        const vars = new Map(Object.keys(flatParams(def.params)).map((p) => [p, param(p)]));
        const decls = Object.entries(flatParams(def.params)).map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
        // each event (one that cannot be written is left out, and said so)
        for (const eventName of def.events) {
          const written = declare(`event:${id}.${eventName}`, () => {
          const event = c.events![eventName];
          const cx = cx0(id, vars);
          const body: string[] = [formula(event.guard, cx)];
          for (const f of declared(id, c)) {
            if (!(f in event.assign)) body.push(same(id, f));
            else if (lists.has(`${id}.${f}`)) body.push(listWritten(id, f, event.assign[f], cx));
            else body.push(`${comp(id)}.${field(id, f)}' = ${term(event.assign[f], cx)}`);
          }
          // calls of parts in the same step; a part not called stays as it is
          // a part called only under a condition stays as it is otherwise, and so does every part it would call;
          // a part the command may touch but this event does not call stays as it is
          const sameAll = (ids: Iterable<string>) => [...ids].map(unchanged).join(" and ") || "some Bool";
          const covered = new Set<string>([id]);
          for (const call of event.calls) {
            if (ir.components[call.component]?.external) continue;
            if (missing.has(`cmd:${call.component}.${call.command}`)) unsupported(`${call.component}.${call.command} の引数`);
            const target = ir.components[call.component].commands![call.command];
            const args = argTerms(target.params, call.args, cx).join(", ");
            const reach = touchedBy(call.component, call.command);
            for (const x of reach) covered.add(x);
            const when = call.when === undefined ? undefined : formula(call.when, cx);
            body.push(when === undefined ? `${commandPred(call.component, call.command)}[${args}]` : `(${when} implies ${commandPred(call.component, call.command)}[${args}] else (${sameAll(reach)}))`);
          }
          const untouched = [...touchedBy(id, name)].filter((x) => !covered.has(x));
          if (untouched.length) body.push(sameAll(untouched));
          return `pred ${eventPred(id, eventName)}[${decls.join(", ")}] {\n  ${body.join("\n  ")}\n}`;
          });
          if (written === undefined) dropped.add(`${id}.${eventName}`);
          else lines.push(written);
        }
        const kept = def.events.filter((e) => !dropped.has(`${id}.${e}`));
        const typing = typingOfParams(flatParams(def.params), strings, ints);
        const requires = def.requires === undefined ? undefined : declare(`requires:${id}.${name}`, () => formula(def.requires!, cx0(id, vars)));
        // a requires that cannot be written: the command is left out
        const happens = kept.length === 0 || (def.requires !== undefined && requires === undefined) ? "(no Bool)" : `(${kept.map((e) => `${eventPred(id, e)}[${Object.keys(flatParams(def.params)).map(param).join(", ")}]`).join(" or ")})`;
        if (happens === "(no Bool)") for (const e of def.events) dropped.add(`${id}.${e}`);
        lines.push(`pred ${commandPred(id, name)}[${decls.join(", ")}] {\n  ${[typing, requires].filter(Boolean).map((x) => `${x} and `).join("")}${happens}\n}`);
      }
    }
    // the parts each entry may touch: all others stay unchanged
    const steps: string[] = [];
    for (const e of entries) {
      const touched = touchedBy(e.component, e.name);
      const params = Object.entries(flatParams(e.params));
      const decls = params.map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
      const record = [`Step.event = ${entry(e.qualified)}`, ...params.map(([p]) => `Step.${stepField(e.qualified, p)} = ${param(p)}`), ...companions(e).map((c) => `Step.${c.name} = ${c.of}`)];
      const others = internal.filter(([id]) => !touched.has(id)).map(([id]) => `${unchanged(id)}`);
      const otherFields = entries.flatMap((x) => (x === e ? [] : [...Object.keys(flatParams(x.params)).map((p) => `no Step.${stepField(x.qualified, p)}`), ...companions(x).map((c) => `no Step.${c.name}`)]));
      const inner = [`${commandPred(e.component, e.name)}[${params.map(([p]) => param(p)).join(", ")}]`, ...record, ...others, ...otherFields].join(" and ");
      steps.push(params.length ? `(some ${decls.join(", ")} | ${inner})` : `(${inner})`);
    }
    const stutter = [...internal.map(([id]) => unchanged(id)), "no Step.event", ...entries.flatMap((x) => [...Object.keys(flatParams(x.params)).map((p) => `no Step.${stepField(x.qualified, p)}`), ...companions(x).map((c) => `no Step.${c.name}`)])].join(" and ");
    const init = internal.flatMap(([id, c]) => Object.entries(c.init ?? {}).filter(([f]) => !missing.has(`state:${id}.${f}`)).map(([f, e]) => (Array.isArray(e) && (e[0] === "emptySet" || e[0] === "emptyMap" || (e[0] === "list" && e.length === 1)) ? `no ${comp(id)}.${field(id, f)}` : `${comp(id)}.${field(id, f)} = ${term(e, cx0(id))}`)));
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
  // events left out make every verdict partial: what is found is real, what is not found may still exist
  for (const event of [...dropped].sort()) {
    const reason = reasons.get(`event:${event}`) ?? [...reasons.entries()].find(([k]) => k.startsWith("cmd:") || k.startsWith("params:") || k.startsWith("requires:"))?.[1];
    skipped.push(`${event} を除いて確かめます${reason ? ` (${reason})` : ""}`);
  }
  const partial = dropped.size > 0;
  // a query of a component without state or outside world, over inputs of finite types: every input is tried
  const stateless = internal.every(([id, c]) => declared(id, c).length === 0) && Object.values(ir.components).every((c) => Object.keys(c.external?.queries ?? {}).length === 0);
  const add = (kind: CommandInfo["kind"], what: string, body: string, event?: string, exhaustive = false) => {
    const bound: Bound | undefined = partial ? "partial" : exhaustive ? "exhaustive" : undefined;
    commands.push({ name: `c${n++}`, kind, what, body, ...(event ? { event } : {}), ...(bound ? { bound } : {}) });
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
    // queries (DSL.md §17.20): every value read is defined, and every case of the answer is given for some input
    for (const [query, def] of Object.entries(c.queries ?? {})) {
      const decls = tryBody(() => Object.entries(flatParams(def.params)).map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`).join(", "));
      if (decls === undefined) continue;
      const vars = new Map(Object.keys(flatParams(def.params)).map((p) => [p, param(p)]));
      const exhaustive = stateless && Object.values(flatParams(def.params)).every(finiteType);
      const requires = def.requires === undefined ? undefined : tryBody(() => formula(def.requires!, cx0(id, vars)));
      if (def.requires !== undefined && requires === undefined) continue;
      const pre = [typingOfParams(flatParams(def.params), strings, ints), requires].filter(Boolean);
      const some = (inner: string) => `eventually (${decls ? `some ${decls} | ` : ""}${[...pre, inner].join(" and ")})`;
      for (const obligation of relevance.asked.has(`${id}.${query}`) || writable(def.is) ? definedness(def.is, cx0(id, vars)) : []) {
        const under = [...pre, ...obligation.context].join(" and ") || "some Bool";
        add("defined", `${id}.${query}: ${obligation.what}`, decls ? `always (all ${decls} | ${under} implies ${obligation.holds})` : `always (${under} implies ${obligation.holds})`, undefined, exhaustive);
      }
      const cases = casesOf(def.is, c);
      if (cases.length < 2) continue;
      cases.forEach((one, i) => {
        const body = tryBody(() => some(one.path.map((condition) => condition(cx0(id, vars))).join(" and ") || "some Bool"));
        if (body) add("reach", `${id}.${query} の答え ${one.label ?? `${i + 1}/${cases.length}`}`, body, undefined, exhaustive);
      });
    }
    for (const [command, def] of Object.entries(c.commands ?? {})) {
      if (missing.has(`cmd:${id}.${command}`)) continue;
      const vars = new Map(Object.keys(flatParams(def.params)).map((p) => [p, param(p)]));
      const decls = Object.entries(flatParams(def.params)).map(([p, t]) => `${param(p)}: ${declOf(t).replace(/^one /, "")}`);
      const quantify = (inner: string) => (decls.length ? `always (all ${decls.join(", ")} | ${inner})` : `always (${inner})`);
      // what the inputs may be (their types) and what the command requires: every obligation is read under both
      const requires =
        [typingOfParams(flatParams(def.params), strings, ints), def.requires === undefined ? undefined : tryBody(() => formula(def.requires!, cx0(id, vars)))].filter(Boolean).join(" and ") || undefined;
      for (const eventName of def.events) {
        if (dropped.has(`${id}.${eventName}`)) continue;
        const event = c.events![eventName];
        const guard = tryBody(() => formula(event.guard, cx0(id, vars)));
        if (!guard) continue;
        // every key read is there: guards are read with the requires, the rest under the guard
        for (const [where, expr, under] of [
          ["guard", event.guard, requires],
          // what only answers or the outside world read is checked here only when it can be written as it is
          ...Object.entries(event.assign)
            .filter(([f, e]) => relevance.fields.has(`${id}.${f}`) || writable(e))
            .map(([f, e]) => [`this.${f}`, e, requires ? `${requires} and ${guard}` : guard] as const),
          ...(event.output !== undefined && (relevance.outputs.has(`${id}.${command}`) || writable(event.output)) ? [["output", event.output, requires ? `${requires} and ${guard}` : guard] as const] : []),
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
          return `eventually (${decls.length ? `some ${decls.join(", ")} | ` : ""}Step.event = ${entry(qualified)} and ${[...Object.keys(flatParams(def.params)).map((p) => `Step.${stepField(qualified, p)} = ${param(p)}`), inner].join(" and ")})`;
        });
        if (reachBody) add("reach", `${id}.${eventName}`, reachBody, `${id}.${eventName}`);
        // each row of a decision table the event reads: a trace where the event happens with that row chosen
        // (remembered: written to a field the checks read; a field only answers or the outside world read does not count)
        const kept = Object.fromEntries(Object.entries(event.assign).filter(([f]) => relevance.fields.has(`${id}.${f}`)));
        const remembered = new Set(decisionsIn({ ...event, assign: kept, guard: true, output: undefined, calls: [] }, c).map(([table]) => table));
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
              return `eventually (${decls.length ? `some ${decls.join(", ")} | ` : ""}Step.event = ${entry(qualified)} and ${[...Object.keys(flatParams(def.params)).map((p) => `Step.${stepField(qualified, p)} = ${param(p)}`), inner].join(" and ")})`;
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
            return `eventually (${decls.length ? `some ${decls.join(", ")} | ` : ""}Step.event = ${entry(qualified)} and ${[...Object.keys(flatParams(def.params)).map((p) => `Step.${stepField(qualified, p)} = ${param(p)}`), inner].join(" and ")})`;
          });
          if (body) add("reach", `${id}.${eventName}+${call.component}.${call.command}`, body, `${id}.${eventName}`);
          if (body) callSteps.push({ name: `${id}.${eventName}+${call.component}.${call.command}`, step: body.slice("eventually ".length), event: `${id}.${eventName}` });
        }
      }
    }
  }
  // the module has a trace at all (facts that contradict each other would make every property hold and nothing happen)
  commands.push({ name: SANE, kind: "reach", what: "(模型に手順がある)", body: "some Bool" });
  for (const row of rowSteps) {
    for (const call of callSteps) add("reach", `${row.name}→${call.name}`, `eventually (${row.step} and after eventually ${call.step})`, call.event);
  }
  const header = `${lines.join("\n")}\n`;
  const text = renderAlloy(header, commands, (info) => scopeOf(info, analysis, bitwidth, analysis.atoms, analysis.traceSteps, strings.size));
  return { text, header, bitwidth, commands, skipped, constants: strings.size };
}
const SANE = "sane";
// strings: the constants are atoms of their own, so the scope of strings is that many more
const scopeOf = (info: CommandInfo, analysis: Analysis, bitwidth: number, atoms: number, maxSteps = analysis.traceSteps, constants = 0) =>
  `for ${atoms} but ${bitwidth} Int, ${atoms + constants} Str, ${info.kind === "reach" ? `1..${maxSteps}` : analysis.steps} steps`;

/** The cases of an answer: each branch of its `ite`s and each row of a decision table it reads, with the conditions that choose it. */
type Case = { label?: string; path: ((cx: Ctx) => string)[] };
function casesOf(e: unknown, c: ComponentIr, path: Case["path"] = []): Case[] {
  if (Array.isArray(e)) {
    if (e[0] === "ite") {
      const [, test, then, otherwise] = e;
      return [...casesOf(then, c, [...path, (cx) => formula(test, cx)]), ...casesOf(otherwise, c, [...path, (cx) => `(not ${formula(test, cx)})`])];
    }
    // a calculation whose arguments are its own parameters (the usual case): its body
    if (e[0] === "calc") {
      const named = c.calcs?.[e[1] as string];
      const args = e[2] as Record<string, unknown>;
      if (named && Object.entries(args).every(([p, a]) => Array.isArray(a) && a[0] === "var" && a[1] === p)) return casesOf(named.is, c, path);
    }
    if (e[0] === "field" && Array.isArray(e[1]) && e[1][0] === "decide") {
      const [, name, args] = e[1] as [string, string, Record<string, unknown>];
      const table = c.decisions?.[name];
      if (table) {
        return table.rows.map((_, r) => ({
          label: `${name}[${r}]`,
          path: [
            ...path,
            ...table.rows.slice(0, r + 1).map((row, i) => (cx: Ctx) => {
              const when = row.when === true ? "(some Bool)" : withArgs(row.when, table.params, args, cx, formula);
              return i === r ? when : `(not ${when})`;
            }),
          ],
        }));
      }
    }
  }
  return [{ path }];
}

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
/** The jar of that release (GitHub does not publish a digest; this is the jar as downloaded on 2026-10-22 and again on 2026-10-29). */
export const ALLOY_SHA256 = "6b8c1cb5bc93bedfc7c61435c4e1ab6e688a242dc702a394628d9a9801edb78d";

const sha256Of = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
/** Whether a jar is the pinned one (each file is hashed once per process). */
const checkedJars = new Map<string, boolean>();
export function isPinnedJar(file: string): boolean {
  if (!checkedJars.has(file)) checkedJars.set(file, sha256Of(file) === ALLOY_SHA256);
  return checkedJars.get(file)!;
}

/**
 * Where the Alloy jar is: `CLP_ALLOY_JAR` (used as given, with a warning when it is not the pinned jar), or the user's
 * cache (downloaded once and checked against the pinned hash; a jar that does not match is removed and never run).
 */
export function alloyJar(): string {
  const given = process.env.CLP_ALLOY_JAR;
  if (given) {
    if (!isPinnedJar(given) && !warned.has(given)) {
      warned.add(given);
      console.error(`注意: CLP_ALLOY_JAR の jar (${given}) は、Alloy ${ALLOY_VERSION} の配布物とハッシュが違います (sha256 ${ALLOY_SHA256} のはず)`);
    }
    return given;
  }
  const dir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp");
  const jar = join(dir, `alloy-${ALLOY_VERSION}.jar`);
  if (existsSync(jar)) {
    if (isPinnedJar(jar)) return jar;
    rmSync(jar, { force: true });
    checkedJars.delete(jar);
  }
  mkdirSync(dir, { recursive: true });
  const partial = `${jar}.part`;
  const fetched = spawnSync("curl", ["-sfL", "-o", partial, ALLOY_URL], { encoding: "utf8", timeout: 300_000 });
  if (fetched.status !== 0 || !existsSync(partial)) {
    rmSync(partial, { force: true });
    throw new Error(`Alloy ${ALLOY_VERSION} を取得できませんでした (${ALLOY_URL})。手元の jar を CLP_ALLOY_JAR で指定してください`);
  }
  const got = sha256Of(partial);
  if (got !== ALLOY_SHA256) {
    rmSync(partial, { force: true });
    throw new Error(`取得した Alloy の jar のハッシュが違います (sha256 ${got}、${ALLOY_SHA256} のはず)。使わずに消しました`);
  }
  renameSync(partial, jar);
  checkedJars.set(jar, true);
  return jar;
}
const warned = new Set<string>();

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
  const strings = new Map(stringsOf(ir).map((s, i) => [`str_${i}$0`, s]));
  // numbers Alloy chose, as values of the spec (they were replaced by small ones when they did not fit)
  const { made } = moduleInts(ir);
  const int = (raw: string) => ("reason" in made ? Number(raw) : made.concrete(Number(raw)));
  // a string Alloy chose: with lengths, one of its length whose trimmed form is the one Alloy chose (letters, then spaces)
  const stringOf = (raw: string, step?: Record<string, string[][]>, at?: string): string => {
    if (strings.has(raw)) return strings.get(raw)!;
    const recorded = (suffix: string) => (step && at ? step[`${at}__${suffix}`]?.[0]?.[0] : undefined);
    const length = recorded("len");
    if (length === undefined) return atom(raw);
    const trimmed = recorded("trim");
    const letter = "abcdefghijklmnopqrstuvwxyz"[Number(/\$(\d+)$/.exec(raw)?.[1] ?? 0) % 26];
    const core = trimmed !== undefined && strings.has(trimmed) ? strings.get(trimmed)! : letter.repeat(Math.max(int(recorded("trimlen") ?? "0"), 0));
    return core.padEnd(int(length), " ");
  };
  let current: Record<string, string[][]> | undefined;
  let currentField: string | undefined;
  const value = (raw: string, type: Type): unknown => {
    if (type === "int") return int(raw);
    if (type === "string") return stringOf(raw, current, currentField);
    if (type === "json") {
      if (strings.has(raw)) return strings.get(raw);
      if (/^-?\d+$/.test(raw)) return int(raw);
      if (/^(True|False)\$/.test(raw)) return raw.startsWith("True");
      return atom(raw).replace(/^Json-/, "json-");
    }
    if (type === "bool") return raw.startsWith("True");
    if (typeof type === "object" && "optional" in type) return value(raw, type.optional);
    if (typeof type === "object" && "enum" in type && type.enum.every((v) => typeof v === "number")) return int(raw);
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
    const read = (p: string, t: Type) => {
      current = step;
      currentField = stepField(e.qualified, p);
      return value(step[stepField(e.qualified, p)]?.[0]?.[0] ?? "", t);
    };
    const params = Object.fromEntries(
      Object.entries(e.params).map(([p, t]) => [p, typeof t === "object" && "record" in t ? Object.fromEntries(Object.entries(t.record).map(([k, kt]) => [k, read(`${p}.${k}`, kt)])) : read(p, t)]),
    );
    current = undefined;
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
      const bound = info.bound ? { bound: info.bound } : {};
      // with events left out, a case no trace reaches may still be reached by one of them: not known
      if (info.kind === "reach") {
        const status = !result ? "out-of-range" : solution ? "reached" : info.bound === "partial" ? "out-of-range" : "unreachable";
        return { command: info.name, kind: "reach", what: info.what, status, ...(trace ? { trace } : {}), ...bound };
      }
      return { command: info.name, kind: info.kind, what: info.what, status: !result ? "out-of-range" : solution ? "broken" : "holds", ...(trace ? { trace } : {}), ...bound };
    });
  },
};

const EMITTER = createHash("sha256").update(readFileSync(new URL(import.meta.url))).digest("hex");

/** Runs the checker on an IR, with a cache keyed by the IR and the analysis (the result is a function of both). */
export function checkWithAlloy(ir: Ir8, analysis: Analysis = DEFAULT_ANALYSIS): CheckResult {
  const { files, commands, skipped } = alloy6.emit(ir, analysis);
  // the key covers the module as written (whatever file of the emitter changed it), how results are read back (this
  // file) and the Alloy release, so a fix is never hidden by an old result
  const key = createHash("sha256")
    .update(stableStringify8({ ir, analysis, checker: alloy6.name, module: files, reader: EMITTER, alloy: ALLOY_SHA256 }))
    .digest("hex");
  const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-results");
  const cached = join(cacheDir, `${key}.json`);
  if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")) as CheckResult;
  const raw = alloy6.run(files);
  if (files["spec.als"] && !raw.receipt) {
    return { checker: alloy6.name, skipped: [...skipped, `Alloy を実行できませんでした: ${raw.output.trim().slice(-800)}`], verdicts: [] };
  }
  let verdicts = alloy6.read(raw, commands, ir);
  // a module without a single trace is the framework's mistake: none of its verdicts says anything
  const sane = verdicts.find((v) => v.command === SANE);
  verdicts = verdicts.filter((v) => v.command !== SANE);
  if (sane && sane.status !== "reached") {
    const result: CheckResult = { checker: alloy6.name, skipped: [...skipped, "Alloy の模型に手順が1つもありません (写し方の誤り)。Alloy の結果は使わず、PBT に任せます"], verdicts: [] };
    return result;
  }
  // events not reached in the small scope: searched for again, with more atoms and longer traces
  const missed = verdicts.filter((v) => v.kind === "reach" && v.status === "unreachable" && v.command !== SANE).map((v) => v.command);
  if (missed.length > 0) {
    const { header, bitwidth, constants } = emitAlloy(ir, analysis);
    const again = commands.filter((c) => missed.includes(c.name));
    const wide = alloy6.run({ "spec.als": renderAlloy(header, again, (info) => scopeOf(info, analysis, bitwidth, analysis.wideAtoms, analysis.maxTraceSteps, constants)) });
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
