// From the merged declarations (read.ts) to IR version 8 (DSL.md §17.9): every type is read from its annotation,
// every body becomes expressions, every command becomes events (one per case, with exclusive guards), and nothing
// written in prose may remain — a sentence with no content is `prose-left`, a string in a place where no string can
// be is an error. Nothing is executed.

import { CORE, componentName, proseOf } from "./read.ts";
import type { Entry, Heading, Names, Problem, Program, Unit } from "./read.ts";
import { Names as NameTable } from "./read.ts";
import type { Block, Expr as Syn, Module, Param, Pos, Stmt, TypeNode } from "./syntax.ts";
import { IR8_VERSION } from "./ir.ts";
import { fillStage0 } from "./fills.ts";
import { promiseStage0, rowStage0 } from "./declared.ts";
import { traceStage0 } from "./trace.ts";
import type { TraceFacts } from "./trace.ts";
import type { FillDecision } from "./fills.ts";
import { decided } from "./decide.ts";
import type { Call, ComponentIr, Event, Expr, Ir8, Params, TraceStep, Type } from "./ir.ts";
import { baseOf, concrete, fits, isAtom, isEnum, isList, isMap, isOptional, isRecord, isSet, join, nonNull, show } from "./types.ts";
import type { T } from "./types.ts";

type TE = { e: Expr; t: T };
const BAD: TE = { e: null, t: "any" };
const lit = (value: string): Expr => ["lit", value];
/** The state fields a conjunction fixes to a constant: `this.status === "DESIGN"`. */
function knownState(conjuncts: Expr[]): Map<string, unknown> {
  const known = new Map<string, unknown>();
  const visit = (e: Expr) => {
    if (!Array.isArray(e)) return;
    if (e[0] === "and") return e.slice(1).forEach((x) => visit(x as Expr));
    if (e[0] !== "=") return;
    const [a, b] = [e[1], e[2]] as Expr[];
    const field = (x: Expr) => (Array.isArray(x) && x[0] === "state" ? (x[1] as string) : undefined);
    const constant = (x: Expr) => (Array.isArray(x) && x[0] === "lit" ? { v: x[1] } : typeof x === "number" || typeof x === "boolean" ? { v: x } : undefined);
    const [f, c] = field(a) !== undefined ? [field(a), constant(b)] : [field(b), constant(a)];
    if (f !== undefined && c) known.set(f, c.v);
  };
  conjuncts.forEach(visit);
  return known;
}

/** The expression with comparisons of known state fields decided, and what they decide folded (`ite`, `and`, `or`, `not`). */
function foldKnown(e: Expr, known: Map<string, unknown>): Expr {
  if (known.size === 0 || !Array.isArray(e)) return e;
  const op = e[0];
  if (op === "lit" || op === "state" || op === "var") return e;
  const args = e.slice(1).map((x) => (Array.isArray(x) ? foldKnown(x as unknown as Expr, known) : typeof x === "object" && x !== null ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, foldKnown(v as Expr, known)])) : x));
  const constant = (x: unknown) => (Array.isArray(x) && x[0] === "lit" ? { v: x[1] } : typeof x === "number" || typeof x === "boolean" ? { v: x } : undefined);
  if (op === "=") {
    const [a, b] = args as Expr[];
    const side = (x: Expr) => (Array.isArray(x) && x[0] === "state" && known.has(x[1] as string) ? { v: known.get(x[1] as string) } : constant(x));
    const [x, y] = [side(a), side(b)];
    if (x && y && (Array.isArray(a) && a[0] === "state" ? true : Array.isArray(b) && b[0] === "state")) return x.v === y.v;
  }
  if (op === "not" && typeof args[0] === "boolean") return !args[0];
  if (op === "ite" && typeof args[0] === "boolean") return (args[0] ? args[1] : args[2]) as Expr;
  if (op === "and") {
    if (args.some((x) => x === false)) return false;
    const rest = args.filter((x) => x !== true) as Expr[];
    return rest.length === 0 ? true : rest.length === 1 ? rest[0] : (["and", ...rest] as unknown as Expr);
  }
  if (op === "or") {
    if (args.some((x) => x === true)) return true;
    const rest = args.filter((x) => x !== false) as Expr[];
    return rest.length === 0 ? false : rest.length === 1 ? rest[0] : (["or", ...rest] as unknown as Expr);
  }
  return [op, ...args] as unknown as Expr;
}

const and = (parts: Expr[]): Expr => (parts.length === 0 ? true : parts.length === 1 ? parts[0] : ["and", ...parts]);
const not = (e: Expr): Expr => (Array.isArray(e) && e[0] === "not" ? (e[1] as Expr) : ["not", e]);

/** What one component became. Its tables are its own; standalone decision tables and conditions it uses are copied in. */
export type Built = {
  unit: Unit;
  ir: ComponentIr;
  /** Units its bodies call: components (inside or outside), decision tables, conditions, calculations. */
  uses: Set<Unit>;
  /** Which of its parts' commands and queries it calls. */
  called: Set<string>;
  notes: Record<string, string>;
  trace: Record<string, string[]>;
  examples: NonNullable<Ir8["examples"]>;
  /** The prose entries Layer 1 left and what each became. */
  filled: { name: string; heading: Heading; prose: string }[];
};

type PathState = {
  guard: Expr[];
  assign: Map<string, Expr>;
  written: Set<string>;
  calls: Call[];
  called: Set<string>;
  requires: Expr[];
  started: boolean;
  when: Expr[];
  named: string[];
  output?: TE;
  returned: boolean;
  /** Per expression compared with constants (`r === "created"`): the values ruled out on this path, and how many it can have. */
  excluded: Map<string, { values: Set<unknown>; of: number }>;
  /** Every value of some enumeration was ruled out: the path cannot happen. */
  impossible?: true;
};

type Cx = {
  b: Built;
  /** The unit the code was written for: fragments (`is.x`, `does.x`) are filled under its headings. */
  owner: Unit;
  module: Module;
  vars: Map<string, TE>;
  mode: "command" | "query" | "pure" | "rule" | "decision" | "example";
  ps?: PathState;
  where: string;
  hasThis: boolean;
  /** Expressions known not to be null here (narrowed by `x !== null`, as TypeScript does). */
  nonNull?: Set<string>;
};

const clone = (ps: PathState): PathState => ({
  ...ps,
  guard: [...ps.guard],
  assign: new Map(ps.assign),
  written: new Set(ps.written),
  calls: [...ps.calls],
  called: new Set(ps.called),
  requires: [...ps.requires],
  when: [...ps.when],
  named: [...ps.named],
  excluded: new Map([...ps.excluded].map(([k, v]) => [k, { values: new Set(v.values), of: v.of }])),
});
const fresh = (): PathState => ({ guard: [], assign: new Map(), written: new Set(), calls: [], called: new Set(), requires: [], started: false, when: [], named: [], returned: false, excluded: new Map() });

const containsReturn = (stmt: Stmt | undefined): boolean =>
  stmt === undefined ? false : stmt.k === "return" ? true : stmt.k === "block" ? stmt.body.some(containsReturn) : stmt.k === "if" ? containsReturn(stmt.then) || containsReturn(stmt.else) : false;

export class Builder {
  readonly problems: Problem[] = [];
  private names: Names;
  private built = new Map<Unit, Built>();
  private building = new Set<Unit>();
  private program: Program;
  // the types of the methods of each component, filled while building (a callee's output type needs its body)
  private outputs = new Map<string, T>();

  constructor(program: Program) {
    this.program = program;
    this.names = new NameTable(program.modules);
  }

  private fail(code: string, where: string, message: string, at?: Pos): TE {
    if (!this.problems.some((p) => p.code === code && p.where === where && p.message === message)) this.problems.push({ severity: "error", code, where, message, at });
    return BAD;
  }
  private warn(code: string, where: string, message: string, at?: Pos) {
    this.problems.push({ severity: "warning", code, where, message, at });
  }

  unitOf(module: Module, name: string): Unit | undefined {
    const sym = this.names.resolve(module, name);
    if (sym.k !== "const") return undefined;
    return this.program.units.find((u) => u.module === sym.module && u.exportName === sym.decl.name);
  }
  private moduleOf(unit: Unit, entry: Entry): Module {
    return entry.layer === 2 && unit.interpretation ? unit.interpretation.module : unit.module;
  }

  // --- Types ---

  typeOf(node: TypeNode | undefined, module: Module, where: string, seen = new Set<string>()): T {
    if (!node) return this.fail("missing-type", where, "型が要ります（引数には型注釈を書きます）").t;
    switch (node.k) {
      case "tkw":
        if (node.name === "string") return "string";
        if (node.name === "number") return "int";
        if (node.name === "boolean") return "bool";
        if (node.name === "null") return "null";
        if (node.name === "void" || node.name === "undefined") return "void";
        return this.fail("bad-type", where, `${node.name} は型として書けません`, node.at).t;
      case "tlit":
        return { enum: [node.value] };
      case "tarray":
        return { list: concrete(this.typeOf(node.of, module, where, seen)) };
      case "tobj":
        return {
          record: Object.fromEntries(
            node.fields.map((field) => {
              const t = concrete(this.typeOf(field.type, module, where, seen));
              return [field.name, field.optional && !isOptional(t) ? { optional: t } : t];
            }),
          ),
        };
      case "tunion": {
        let result: T = "any";
        let sawNull = false;
        for (const member of node.types) {
          const t = this.typeOf(member, module, where, seen);
          if (t === "null") {
            sawNull = true;
            continue;
          }
          const joined: T | undefined = result === "any" ? t : join(result, t);
          if (joined === undefined) return this.fail("bad-type", where, `${show(result)} と ${show(t)} は1つの型にできません`, node.at).t;
          result = joined;
        }
        return sawNull ? (isOptional(result) ? result : { optional: concrete(result) }) : result;
      }
      case "tfn":
        return this.fail("bad-type", where, "関数の型は書けません", node.at).t;
      case "tref": {
        const sym = this.names.resolve(module, node.name);
        if (sym.k === "core") {
          const arg = (i: number) => concrete(this.typeOf(node.args[i], module, where, seen));
          if (sym.name === "Int") return "int";
          if (sym.name === "Json") return "json";
          if (sym.name === "SpecMap" || sym.name === "Map") return { map: [arg(0), arg(1)] };
          if (sym.name === "SpecSet" || sym.name === "Set") return { set: arg(0) };
          if (sym.name === "List") return { list: arg(0) };
          if (sym.name === "Id") return this.fail("bad-type", where, "Id<…> は type 宣言の右辺に書き、その名前で使います (type MemberId = Id<\"会員番号\">)", node.at).t;
          return this.fail("bad-type", where, `${node.name} は型ではありません`, node.at).t;
        }
        if (node.name === "Array" || node.name === "ReadonlyArray") return { list: concrete(this.typeOf(node.args[0], module, where, seen)) };
        if (sym.k !== "type") return this.fail("unknown-name", where, `型 "${node.name}" がありません`, node.at).t;
        const key = `${sym.module.file}#${sym.decl.name}`;
        if (seen.has(key)) return this.fail("bad-type", where, `型 "${node.name}" が自分自身を含んでいます`, node.at).t;
        // an atom: type X = Id<"…">
        if (sym.decl.type.k === "tref" && this.names.resolve(sym.module, sym.decl.type.name).k === "core" && sym.decl.type.name.endsWith("Id")) {
          const core = this.names.resolve(sym.module, sym.decl.type.name);
          if (core.k === "core" && core.name === "Id") return { atom: sym.decl.name };
        }
        if (sym.decl.params.length > 0) return this.fail("bad-type", where, `型引数を持つ型 "${node.name}" は使えません`, node.at).t;
        return this.typeOf(sym.decl.type, sym.module, where, new Set([...seen, key]));
      }
    }
  }
  private paramsOf(params: Param[], module: Module, where: string): Params {
    const result: Params = {};
    for (const param of params) {
      const t = this.typeOf(param.type, module, `${where}(${param.name})`);
      if (t === "void" || t === "null") this.fail("bad-type", where, `引数 ${param.name} の型 ${show(t)} は使えません`, param.at);
      result[param.name] = concrete(t);
    }
    return result;
  }

  // --- Components ---

  component(unit: Unit): Built {
    const done = this.built.get(unit);
    if (done) return done;
    if (this.building.has(unit)) {
      this.fail("cycle", unit.exportName, `部品の呼び出しが輪になっています (${[...this.building].map((u) => u.exportName).join(" → ")} → ${unit.exportName})`);
      return this.emptyBuilt(unit);
    }
    this.building.add(unit);
    const b = this.emptyBuilt(unit);
    this.built.set(unit, b);
    try {
      if (unit.kind === "external") this.buildExternal(b);
      else if (unit.kind === "service") this.buildService(b);
    } finally {
      this.building.delete(unit);
    }
    return b;
  }
  private emptyBuilt(unit: Unit): Built {
    return { unit, ir: {}, uses: new Set(), called: new Set(), notes: {}, trace: {}, examples: {}, filled: [] };
  }

  private buildExternal(b: Built) {
    const unit = b.unit;
    const queries: NonNullable<ComponentIr["external"]>["queries"] = {};
    const commands: NonNullable<ComponentIr["external"]>["commands"] = {};
    for (const [name, port] of unit.ports?.queries ?? []) {
      const where = `${unit.exportName}.queries.${name}`;
      const result = this.typeOf(port.ret, unit.module, where);
      const promise: { fresh?: true; increasing?: true; mayFail?: true } = {};
      const call = port.promise;
      if (!call || call.k !== "call" || call.callee.k !== "id" || this.names.resolve(unit.module, call.callee.name).k !== "core") {
        this.fail("syntax", where, "外の世界の問い合わせは (引数): 型 => answer({ … }) で書きます", port.at);
      } else if (call.args[0]?.k === "obj") {
        for (const prop of call.args[0].props) {
          if (prop.k === "prop" && ["fresh", "increasing", "mayFail"].includes(prop.key) && prop.value.k === "bool" && prop.value.value) promise[prop.key as "fresh"] = true;
          else this.fail("syntax", where, "answer の約束は fresh / increasing / mayFail: true です", prop.at);
        }
      }
      const facts = { fresh: promise.fresh === true, increasing: promise.increasing === true, integer: baseOf(result) === "int", hasParams: port.params.length > 0 };
      const messages = {
        "fresh-and-increasing": "fresh と increasing は同時に約束できません",
        "increasing-not-integer": "increasing を約束できるのは整数だけです",
        "promise-with-params": "fresh / increasing を約束できるのは、引数の無い問い合わせだけです",
      } as const;
      for (const problem of decided("type-check", { promise: facts }, promiseStage0(facts))) this.fail("bad-promise", where, messages[problem], port.at);
      queries[name] = {
        params: this.paramsOf(port.params, unit.module, where),
        result: concrete(result),
        ...(promise.fresh ? { promise: "fresh" as const } : promise.increasing ? { promise: "increasing" as const } : {}),
        ...(promise.mayFail ? { mayFail: true as const } : {}),
      };
    }
    for (const [name, port] of unit.ports?.commands ?? []) commands[name] = { params: this.paramsOf(port.params, unit.module, `${unit.exportName}.commands.${name}`) };
    b.ir.external = { queries, commands };
    if (unit.description) b.notes[unit.id] = unit.description.text;
  }

  private buildService(b: Built) {
    const unit = b.unit;
    if (unit.description) b.notes[unit.id] = unit.description.text;
    if (unit.settings.durable) b.ir.durable = true;
    if (unit.settings.routes) b.ir.routes = unit.settings.routes;
    if (unit.proseOnly && !unit.interpretation) {
      this.fail("prose-left", unit.exportName, `「${unit.description?.text ?? ""}」の中身がありません。clp interpret で解釈を導いてください`, unit.at);
      return;
    }
    // state first: every body reads it
    const state: Record<string, Type> = {};
    const init: Record<string, Expr> = {};
    b.ir.state = state;
    b.ir.init = init;
    for (const entry of this.entriesUnder(unit, "state")) {
      const where = `${unit.exportName}.state.${entry.name}`;
      if (entry.prose !== undefined) {
        this.fail("prose-left", where, `「${entry.prose}」の型と初めの値がありません`, entry.at);
        continue;
      }
      if (entry.replaced) this.note(b, `${unit.id}.state.${entry.name}`, entry.replaced, entry);
      const declared = this.stateDecl(entry.value!, this.moduleOf(unit, entry), where, b);
      if (!declared) continue;
      state[entry.name] = concrete(declared.t);
      init[entry.name] = declared.e;
    }
    // commands and queries
    for (const entry of this.entriesUnder(unit, "commands")) this.command(b, entry);
    for (const entry of this.entriesUnder(unit, "queries")) this.query(b, entry);
    for (const entry of this.entriesUnder(unit, "rules")) this.rule(b, entry);
    for (const entry of this.entriesUnder(unit, "examples")) this.example(b, entry);
    // named conditions, calculations, decision tables and fragments that nothing used are still read (their errors show)
    for (const entry of this.entriesUnder(unit, "does")) {
      if (!this.usedFragments.has(`${unit.id}#${entry.name}`)) this.fail("unknown-fragment", `${unit.exportName}.does.${entry.name}`, `本体の中に does.${entry.name}(…) がありません`, entry.at);
    }
    for (const entry of this.entriesUnder(unit, "conditions")) {
      if (!this.usedFragments.has(`${unit.id}#${entry.name}`)) this.fail("unknown-fragment", `${unit.exportName}.conditions.${entry.name}`, `本体の中に is.${entry.name}(…) がありません`, entry.at);
    }
    for (const entry of this.entriesUnder(unit, "calcs")) {
      if (!this.usedFragments.has(`${unit.id}#${entry.name}`)) this.fail("unknown-fragment", `${unit.exportName}.calcs.${entry.name}`, `本体の中に value.${entry.name}(…) がありません`, entry.at);
    }
    for (const kind of ["decisions", "components"] as const) {
      for (const entry of this.entriesUnder(unit, kind)) this.fail("not-yet", `${unit.exportName}.${kind}.${entry.name}`, `見出し ${kind} は、まだ使えません（よそで ${kind === "decisions" ? "decisions" : "service"}(…) として定義して呼んでください）`, entry.at);
    }
    if (unit.description) {
      for (const embedded of unit.description.embedded) {
        if (embedded.k !== "id") continue;
        const used = this.unitOf(unit.module, embedded.name);
        const facts = { kind: "embedded", isComponent: used !== undefined, used: used !== undefined && [...b.uses].includes(used) } as const;
        const problem = decided("sentence-trace", facts, traceStage0(facts));
        if (problem === "unknown-name") this.fail("unknown-name", unit.exportName, `説明に埋め込んだ "${embedded.name}" は部品ではありません`, embedded.at);
        if (problem === "embedded-unused") this.fail("sentence-unused", unit.exportName, `説明に埋め込んだ ${embedded.name} を、どの本体も使っていません`, embedded.at);
      }
    }
    this.traceSentences(b);
  }

  // Sentence tracing (DSL.md §17.8 ④): when the interpretation adds commands or queries Layer 1 did not name, they can
  // only have come from the description, so every sentence of it must be traced to what it became.
  private traceSentences(b: Built) {
    const unit = b.unit;
    const where = `${unit.exportName}.trace`;
    const added = [...unit.entries.values()].some((e) => e.layer === 2 && e.replaced === undefined && (e.heading === "commands" || e.heading === "queries"));
    const sentences = sentencesOf(unit.description?.text ?? "");
    const names = new Set<string>([unit.exportName, unit.id, ...unit.entries.keys(), ...Object.keys(b.ir.events ?? {}), ...Object.keys(b.ir.conditions ?? {}), ...this.program.units.map((u) => u.exportName)]);
    const judge = (facts: TraceFacts) => decided("sentence-trace", facts, traceStage0(facts));
    for (const [key, targets] of unit.trace) {
      if (judge({ kind: "key", inDescription: sentences.some((sentence) => sentence.includes(key)) }) !== "none") this.fail("unknown-sentence", where, `「${key}」は ${unit.exportName} の説明の文にありません`);
      for (const target of targets) if (judge({ kind: "target", exists: names.has(target) }) !== "none") this.fail("unknown-name", where, `「${key}」が指す "${target}" はありません`);
      b.trace[`${unit.id}:${key}`] = targets;
    }
    sentences.forEach((sentence, index) => {
      const covered = [...unit.trace.keys()].some((key) => sentence.includes(key));
      if (judge({ kind: "sentence", covered, added }) !== "none") {
        this.fail("sentence-unused", `${unit.exportName}.description[${index + 1}]`, `「${sentence}」から作られたものがありません（解釈の trace に、その文と作ったものの名前を書きます）`);
      }
    });
  }
  private usedFragments = new Set<string>();
  /** Every unit read while building (components and the decision tables, conditions and calculations they call). */
  get units(): Unit[] {
    return [...this.built.keys(), ...[...this.built.values()].flatMap((b) => [...b.uses])].filter((u, i, all) => all.indexOf(u) === i);
  }

  private entriesUnder(unit: Unit, heading: Heading): Entry[] {
    return [...unit.entries.values()].filter((entry) => entry.heading === heading);
  }
  private note(b: Built, key: string, text: string, entry?: Entry) {
    b.notes[key] = text;
    if (entry?.replaced !== undefined) b.filled.push({ name: entry.name, heading: entry.heading, prose: entry.replaced });
  }

  /** `Map<K, V>()`, `Set<T>()`, `List<T>([…])`, `init<T>(value)`. */
  private stateDecl(value: Syn, module: Module, where: string, b: Built): TE | undefined {
    const bad = () => (this.fail("bad-state", where, "状態は Map<K, V>()、Set<T>()、List<T>(…)、init<T>(初めの値) のどれかで書きます", value.at), undefined);
    if (value.k !== "call" || value.callee.k !== "id") return bad();
    const sym = this.names.resolve(module, value.callee.name);
    if (sym.k !== "core") return bad();
    const cx: Cx = { b, owner: b.unit, module, vars: new Map(), mode: "pure", where, hasThis: false };
    const typeArg = (i: number) => concrete(this.typeOf(value.typeArgs[i], module, where));
    if (sym.name === "Map") return { e: ["emptyMap"], t: { map: [typeArg(0), typeArg(1)] } };
    if (sym.name === "Set") return { e: ["emptySet"], t: { set: typeArg(0) } };
    if (sym.name === "List") {
      const t: T = { list: typeArg(0) };
      if (value.args.length === 0) return { e: ["list"], t };
      const items = this.expect(this.tx(value.args[0], cx), t, cx, "初めの値");
      return { e: items.e, t };
    }
    if (sym.name === "init") {
      if (value.typeArgs.length === 0) {
        this.fail("missing-type", where, "init<型>(初めの値) と、型を書きます", value.at);
        return undefined;
      }
      const t = this.typeOf(value.typeArgs[0], module, where);
      const given = this.expect(this.tx(value.args[0], cx), t, cx, "初めの値");
      return { e: given.e, t };
    }
    return bad();
  }

  /** The value of `got`, checked against `want`. A literal gets the expected type. */
  private expect(got: TE, want: T, cx: Cx, what: string, at?: Pos): TE {
    if (got === BAD || got.t === "any") return { e: got.e, t: want };
    if (!fits(got.t, want)) {
      if (Array.isArray(got.e) && got.e[0] === "lit" && typeof got.e[1] === "string" && want === "bool") {
        this.fail("prose-in-expression", cx.where, `文「${got.e[1]}」は、式の場所には書けません。is.名前("文") にして、解釈に中身を書かせます`, at);
        return { e: got.e, t: want };
      }
      this.fail("type-mismatch", cx.where, `${what}: ${show(want)} が要る所に ${show(got.t)} があります`, at);
      return { e: got.e, t: want };
    }
    return { e: got.e, t: want };
  }

  // --- Commands ---

  private methodOf(b: Built, entry: Entry, kind: string): { params: Params; body: Block; module: Module; ret?: TypeNode } | undefined {
    const where = `${b.unit.exportName}.${entry.heading}.${entry.name}`;
    if (entry.prose !== undefined) {
      this.fail("prose-left", where, `「${entry.prose}」の中身がありません`, entry.at);
      return undefined;
    }
    if (!entry.method) {
      this.fail("syntax", where, `${kind}は 名前(引数: 型) { … } のメソッドで書きます`, entry.at);
      return undefined;
    }
    const module = this.moduleOf(b.unit, entry);
    return { params: this.paramsOf(entry.method.params, module, where), body: entry.method.body, module, ret: entry.method.ret };
  }

  private command(b: Built, entry: Entry) {
    const unit = b.unit;
    const where = `${unit.exportName}.commands.${entry.name}`;
    if (entry.replaced) this.note(b, `${unit.id}.commands.${entry.name}`, entry.replaced, entry);
    const method = this.methodOf(b, entry, "コマンド");
    b.ir.commands ??= {};
    b.ir.events ??= {};
    if (!method) {
      b.ir.commands[entry.name] = { params: {}, events: [] };
      return;
    }
    const vars = new Map<string, TE>(Object.entries(method.params).map(([name, t]) => [name, { e: ["var", name], t }]));
    const cx: Cx = { b, owner: unit, module: method.module, vars, mode: "command", where, hasThis: true };
    const paths = this.exec(method.body.body, [fresh()], cx);
    const declared = method.ret ? this.typeOf(method.ret, method.module, where) : undefined;
    let output: T | undefined = declared;
    const answering = paths.some((p) => p.output !== undefined);
    if (answering && paths.some((p) => p.output === undefined)) this.fail("missing-output", where, "答えを返す場合と返さない場合があります。すべての場合で return するか、どの場合も返さないかにします");
    if (!declared && answering) {
      for (const path of paths) {
        if (!path.output) continue;
        const joined = output === undefined ? path.output.t : join(output, path.output.t);
        if (joined === undefined) this.fail("type-mismatch", where, `答えの型 ${show(output!)} と ${show(path.output.t)} がそろいません`);
        else output = joined;
      }
    } else if (declared) for (const path of paths) if (path.output) this.expect(path.output, declared, cx, "答え");
    const requires = paths[0]?.requires ?? [];
    const names = new Map<string, number>();
    const eventNames: string[] = [];
    for (const path of paths) {
      const base = path.named.length > 0 ? path.named.join(".") : path.guard.length === 0 || path.guard.every((g) => Array.isArray(g) && g[0] === "not") ? "otherwise" : "case";
      const count = (names.get(base) ?? 0) + 1;
      names.set(base, count);
      const name = `${entry.name}.${count === 1 && base !== "case" ? base : `${base}${count}`}`;
      // what `requires` and the guard fix about the state before the step folds the conditions that ask it again (a
      // fragment shared by several commands branches on the state; in each command, only one branch can run)
      const known = knownState([...requires, ...path.guard]);
      const event: Event = {
        command: entry.name,
        guard: and(path.guard),
        assign: Object.fromEntries([...path.assign].map(([field, value]) => [field, foldKnown(value, known)])),
        calls: path.calls.flatMap((call) => {
          const when = call.when === undefined ? undefined : foldKnown(call.when, known);
          if (when === false) return [];
          const args = Object.fromEntries(Object.entries(call.args).map(([k, v]) => [k, foldKnown(v, known)]));
          const { when: _, ...rest } = call;
          return [{ ...rest, args, ...(when === undefined || when === true ? {} : { when }) }];
        }),
      };
      if (path.output) event.output = foldKnown(path.output.e, known);
      b.ir.events[name] = event;
      eventNames.push(name);
    }
    b.ir.commands[entry.name] = {
      params: method.params,
      ...(output !== undefined && output !== "void" ? { output: concrete(output) } : {}),
      ...(requires.length > 0 ? { requires: and(requires) } : {}),
      events: eventNames,
    };
    this.outputs.set(`${unit.id}.${entry.name}`, output ?? "void");
  }

  // Statements to paths: an `if` that may return splits the path (a case); one that cannot only makes what is inside conditional.
  private exec(stmts: Stmt[], paths: PathState[], cx: Cx): PathState[] {
    let current = paths;
    for (const stmt of stmts) {
      const next: PathState[] = [];
      for (const path of current) {
        if (path.returned) next.push(path);
        else next.push(...this.step(stmt, path, cx));
      }
      current = next;
    }
    return current;
  }

  private step(stmt: Stmt, ps: PathState, cx: Cx): PathState[] {
    const scoped: Cx = { ...cx, ps, vars: new Map(cx.vars) };
    switch (stmt.k) {
      case "block":
        return this.exec(stmt.body, [ps], scoped).map((p) => p);
      case "return": {
        if (ps.when.length > 0) {
          this.fail("syntax", cx.where, "return は、場合を分ける if の中に書きます（中身だけが条件つきになる if の中には書けません）", stmt.at);
          return [ps];
        }
        // return does.name("文"): what its content does, and the answer it returns
        if (stmt.expr?.k === "call" && stmt.expr.callee.k === "member" && stmt.expr.callee.object.k === "id" && stmt.expr.callee.object.name === "does" && this.names.resolve(cx.module, "does").k === "core") {
          return this.doesPaths(stmt.expr, clone(ps), scoped, stmt.at, "answer").map((after) => ({ ...after, returned: true, started: true }));
        }
        const done = clone(ps);
        done.started = true;
        done.returned = true;
        if (stmt.expr) {
          const value = this.tx(stmt.expr, scoped);
          if (value.t === "void") this.fail("type-mismatch", cx.where, "値の無いものを return しています", stmt.at);
          done.output = value;
        }
        return [done];
      }
      case "const": {
        const call = this.commandCall(stmt.init, scoped);
        if (call) {
          const done = clone(ps);
          done.started = true;
          this.applyCall(call, done, scoped, stmt.at);
          cx.vars.set(stmt.name, { e: call.output, t: call.outputType });
          return [done];
        }
        const value = this.tx(stmt.init, scoped);
        const t = stmt.type ? this.expect(value, this.typeOf(stmt.type, cx.module, cx.where), scoped, stmt.name).t : value.t;
        cx.vars.set(stmt.name, { e: value.e, t });
        const done = clone(ps);
        done.started = true;
        return [done];
      }
      case "if": {
        const test = this.expect(this.tx(stmt.test, scoped), "bool", scoped, "if の条件", stmt.at);
        const name = this.conditionName(stmt.test);
        if (containsReturn(stmt.then) || containsReturn(stmt.else)) {
          if (ps.when.length > 0) {
            this.fail("syntax", cx.where, "return を含む if は、条件つきの if の中には書けません", stmt.at);
            return [ps];
          }
          const yes = clone(ps);
          yes.started = true;
          yes.guard.push(test.e);
          if (name) yes.named.push(name);
          const no = clone(ps);
          no.started = true;
          no.guard.push(not(test.e));
          // `x === "a"` on an enumeration: once every value is ruled out, the rest cannot happen
          const compared = this.comparedWithConstant(stmt.test, scoped);
          if (compared) {
            const seen = no.excluded.get(compared.key) ?? { values: new Set<unknown>(), of: compared.of };
            seen.values.add(compared.value);
            no.excluded.set(compared.key, seen);
            if (seen.values.size >= seen.of) no.impossible = true;
          }
          const otherwise = no.impossible ? [] : this.exec(stmt.else ? [stmt.else] : [], [no], { ...this.narrowed(cx, stmt.test, false), vars: new Map(cx.vars) });
          return [...this.exec([stmt.then], [yes], { ...this.narrowed(cx, stmt.test, true), vars: new Map(cx.vars) }), ...otherwise];
        }
        // only what happens is conditional
        const base = clone(ps);
        base.started = true;
        const yes = clone(base);
        yes.when.push(test.e);
        const no = clone(base);
        no.when.push(not(test.e));
        const [a] = this.exec([stmt.then], [yes], { ...this.narrowed(cx, stmt.test, true), vars: new Map(cx.vars) });
        const [n] = this.exec(stmt.else ? [stmt.else] : [], [no], { ...this.narrowed(cx, stmt.test, false), vars: new Map(cx.vars) });
        const merged = clone(base);
        for (const field of new Set([...a.written, ...n.written])) {
          const before = base.assign.get(field) ?? (["state", field] as Expr);
          const ya = a.assign.get(field) ?? before;
          const na = n.assign.get(field) ?? before;
          merged.assign.set(field, JSON.stringify(ya) === JSON.stringify(na) ? ya : ["ite", test.e, ya, na]);
          merged.written.add(field);
        }
        merged.calls = [...base.calls, ...a.calls.slice(base.calls.length), ...n.calls.slice(base.calls.length)];
        merged.called = new Set([...a.called, ...n.called]);
        return [merged];
      }
      case "expr":
        // does.name("…") may split the path into cases (its content can return)
        if (stmt.expr.k === "call" && stmt.expr.callee.k === "member" && stmt.expr.callee.object.k === "id" && stmt.expr.callee.object.name === "does" && this.names.resolve(cx.module, "does").k === "core") {
          const started = clone(ps);
          started.started = true;
          if (ps.when.length > 0) return [this.doesFragment(stmt.expr, started, scoped, stmt.at)];
          return this.doesPaths(stmt.expr, started, scoped, stmt.at, "statement");
        }
        return [this.statement(stmt.expr, ps, scoped, stmt.at)];
    }
  }

  /** `x === "a"` (or `"a" === x`) where x is an enumeration: the expression, the value, and how many values x has. */
  private comparedWithConstant(test: Syn, cx: Cx): { key: string; value: unknown; of: number } | undefined {
    if (test.k !== "bin" || (test.op !== "===" && test.op !== "==")) return undefined;
    const [side, constant] = test.right.k === "str" || test.right.k === "num" || test.right.k === "bool" ? [test.left, test.right] : test.left.k === "str" || test.left.k === "num" || test.left.k === "bool" ? [test.right, test.left] : [];
    if (!side || !constant) return undefined;
    const value = this.tx(side, cx);
    const t = value.t;
    const of = isEnum(t) ? t.enum.length : t === "bool" ? 2 : undefined;
    if (of === undefined) return undefined;
    return { key: JSON.stringify(value.e), value: (constant as { value: unknown }).value, of };
  }

  private conditionName(test: Syn): string | undefined {
    if (test.k === "call" && test.callee.k === "member" && test.callee.object.k === "id" && test.callee.object.name === "is") return test.callee.name;
    if (test.k === "unary" && test.expr.k === "call") return undefined;
    return undefined;
  }

  // An expression statement: a write to state, a call of another component's command, `does.x(…)`, `requires(…)`.
  private statement(expr: Syn, ps: PathState, cx: Cx, at: Pos): PathState {
    const done = clone(ps);
    const scoped: Cx = { ...cx, ps: done };
    if (expr.k === "call" && expr.callee.k === "id") {
      const sym = this.names.resolve(cx.module, expr.callee.name);
      if (sym.k === "core" && sym.name === "requires") {
        if (ps.started || ps.when.length > 0) this.fail("syntax", cx.where, "requires(…) は、メソッドの先頭に書きます", at);
        done.requires.push(this.expect(this.tx(expr.args[0], scoped), "bool", scoped, "requires の条件").e);
        return done;
      }
    }
    done.started = true;
    if (expr.k === "call" && expr.callee.k === "member" && expr.callee.object.k === "id" && expr.callee.object.name === "does" && this.names.resolve(cx.module, "does").k === "core") {
      return this.doesFragment(expr, done, scoped, at);
    }
    if (expr.k === "assign") {
      if (cx.mode !== "command") {
        this.fail("write-in-query", cx.where, "状態に書き込めるのは、コマンドの中だけです", at);
        return done;
      }
      const target = expr.target;
      if (target.k === "member" && target.object.k === "this") {
        const field = target.name;
        const t = this.stateType(field, scoped, at);
        let value = this.tx(expr.value, scoped);
        if (expr.op !== "=") {
          const current = this.readState(field, scoped, at);
          value = { e: [expr.op === "+=" ? "+" : "-", current.e, value.e], t: "int" };
          if (baseOf(t) !== "int") this.fail("type-mismatch", cx.where, `${expr.op} は整数の状態にだけ使えます`, at);
        }
        this.write(field, this.expect(value, t, scoped, `this.${field}`, at).e, done, cx, at, true);
        return done;
      }
      if (target.k === "member" && target.object.k === "member" && target.object.object.k === "this") {
        const field = target.object.name;
        const t = this.stateType(field, scoped, at);
        if (!isRecord(nonNull(t))) {
          this.fail("type-mismatch", cx.where, `this.${field} は組ではありません`, at);
          return done;
        }
        const fieldType = (nonNull(t) as { record: Record<string, Type> }).record[target.name];
        if (!fieldType) {
          this.fail("unknown-name", cx.where, `this.${field} に "${target.name}" はありません`, at);
          return done;
        }
        const value = this.expect(this.tx(expr.value, scoped), fieldType, scoped, `this.${field}.${target.name}`, at);
        const current = done.assign.get(field) ?? (["state", field] as Expr);
        this.write(field, ["with", current, { [target.name]: value.e }], done, cx, at, false);
        return done;
      }
      this.fail("syntax", cx.where, "書き込めるのは this.状態 だけです", at);
      return done;
    }
    if (expr.k === "call" && expr.callee.k === "member" && expr.callee.object.k === "member" && expr.callee.object.object.k === "this") {
      // this.f.set(k, v) / delete / add
      const field = expr.callee.object.name;
      const method = expr.callee.name;
      if (["set", "delete", "add"].includes(method)) {
        if (cx.mode !== "command") {
          this.fail("write-in-query", cx.where, "状態に書き込めるのは、コマンドの中だけです", at);
          return done;
        }
        const t = this.stateType(field, scoped, at);
        const current = done.assign.get(field) ?? (["state", field] as Expr);
        if (isMap(t) && method === "set") {
          const k = this.expect(this.tx(expr.args[0], scoped), t.map[0], scoped, "キー");
          const v = this.expect(this.tx(expr.args[1], scoped), t.map[1], scoped, "値");
          this.write(field, ["override", current, k.e, v.e], done, cx, at, false);
        } else if (isMap(t) && method === "delete") {
          const k = this.expect(this.tx(expr.args[0], scoped), t.map[0], scoped, "キー");
          this.write(field, ["dsub", current, k.e], done, cx, at, false);
        } else if (isSet(t) && method === "add") {
          const x = this.expect(this.tx(expr.args[0], scoped), t.set, scoped, "要素");
          this.write(field, ["add", current, x.e], done, cx, at, false);
        } else if (isSet(t) && method === "delete") {
          const x = this.expect(this.tx(expr.args[0], scoped), t.set, scoped, "要素");
          this.write(field, ["remove", current, x.e], done, cx, at, false);
        } else this.fail("syntax", cx.where, `this.${field}.${method}(…) は書けません (${show(t)})`, at);
        return done;
      }
      if (method === "push") {
        this.fail("syntax", cx.where, `並びへの追加は this.${field} = [...this.${field}, 要素] と書きます`, at);
        return done;
      }
    }
    const call = this.commandCall(expr, scoped);
    if (call) {
      this.applyCall(call, done, scoped, at);
      return done;
    }
    const value = this.tx(expr, scoped);
    if (value !== BAD) this.fail("syntax", cx.where, "値を求めるだけの文は書けません（状態への書き込み、部品のコマンドの呼び出し、does / requires だけを書きます）", at);
    return done;
  }

  private write(field: string, value: Expr, ps: PathState, cx: Cx, at: Pos, replaces: boolean) {
    if (replaces && ps.written.has(field) && !ps.when.length) {
      // two plain assignments: the second one wins, but its value was read before the first
    }
    ps.assign.set(field, value);
    ps.written.add(field);
    void cx;
    void at;
  }

  private stateType(field: string, cx: Cx, at: Pos): T {
    if (!cx.hasThis) return this.fail("syntax", cx.where, "ここでは this を使えません", at).t;
    const t = cx.b.ir.state?.[field];
    if (!t) {
      const entry = cx.b.unit.entries.get(field);
      if (entry?.heading === "state" && entry.prose !== undefined) return this.fail("prose-left", cx.where, `状態 ${field}「${entry.prose}」の型がありません`, at).t;
      const known = Object.keys(cx.b.ir.state ?? {});
      return this.fail("unknown-name", cx.where, `状態 "${field}" はありません${known.length ? ` (あるのは: ${known.join(", ")})` : ""}`, at).t;
    }
    return t;
  }
  private readState(field: string, cx: Cx, at: Pos): TE {
    const t = this.stateType(field, cx, at);
    if (cx.ps?.written.has(field)) this.fail("read-after-write", cx.where, `this.${field} に書き込んだあとで、同じ本体の中で読み直しています（読むのは、いつもコマンドの前の値です。書き込みの前に読んでください）`, at);
    return { e: ["state", field], t };
  }

  private doesFragment(expr: Extract<Syn, { k: "call" }>, ps: PathState, cx: Cx, at: Pos): PathState {
    const paths = this.doesPaths(expr, ps, cx, at, "plain");
    if (paths.length > 1) this.fail("syntax", cx.where, `does.${(expr.callee as { name: string }).name} の中で場合を分けられるのは、return does.名前(…) の形で使うときだけです`, at);
    return paths[0] ?? ps;
  }

  /** The paths a `does` fragment's content leads to (it may split into cases when it also answers). */
  // plain: inside a conditional `if` (one path, no return); statement: may split and return; answer: `return does.x(…)`, every path answers
  private doesPaths(expr: Extract<Syn, { k: "call" }>, ps: PathState, cx: Cx, at: Pos, mode: "plain" | "statement" | "answer"): PathState[] {
    const answers = mode === "answer";
    const name = (expr.callee as { name: string }).name;
    const text = proseOf(expr.args[0]);
    if (text === undefined) {
      this.fail("syntax", cx.where, `does.${name}(…) には、文を1つ書きます`, at);
      return [ps];
    }
    const owner = cx.owner;
    if (this.fragmentClash(owner, name, "does", cx, at)) return [ps];
    this.usedFragments.add(`${owner.id}#${name}`);
    this.note(cx.b, `${cx.b.unit.id}.does.${name}`, text);
    const { decision, fill } = this.fillOf(owner, name, "does", false);
    if (decision === "prose-left" || !fill) {
      this.fail("prose-left", cx.where, `「${text}」(does.${name}) の中身がありません`, at);
      return [ps];
    }
    if (decision !== "fill" || !fill.method) {
      this.fail("syntax", `${owner.exportName}.does.${name}`, "does の中身は 名前(引数) { … } のメソッドで書きます", fill.at);
      return [ps];
    }
    const module = this.moduleOf(owner, fill);
    const vars = this.bindFillParams(fill, cx, module);
    const paths = this.exec(fill.method.body.body, [ps], { ...cx, module, vars, where: `${owner.exportName}.does.${name}` });
    if (paths.some((p) => p.returned && p.output) && !answers) this.fail("syntax", `${owner.exportName}.does.${name}`, "答えを返す does は、return does.名前(…) の形で使います", fill.at);
    if (answers && paths.some((p) => !p.returned)) this.fail("missing-output", `${owner.exportName}.does.${name}`, "答えを返す does の中身は、どの場合でも return します", fill.at);
    cx.b.trace[`${cx.b.unit.id}.does.${name}`] = [cx.where];
    return paths;
  }

  /** What a fragment becomes (fill-check). */
  private fillOf(owner: Unit, name: string, kind: "is" | "does" | "value", inline: boolean): { decision: FillDecision; fill?: Entry } {
    const heading: Heading = kind === "is" ? "conditions" : kind === "does" ? "does" : "calcs";
    const fill = owner.entries.get(name);
    const entry = !fill ? "none" : fill.heading !== heading ? (fill.layer === 1 ? "elsewhere" : "none") : fill.prose !== undefined ? "prose" : fill.method ? "method" : "expression";
    const facts = { kind, inline, entry, byInterpretation: fill?.layer === 2 } as const;
    return { decision: decided("fill-check", facts, fillStage0(facts)), ...(fill && fill.heading === heading ? { fill } : {}) };
  }

  /** A fragment's name must not be the name of something under another heading (one namespace per component). */
  private fragmentClash(owner: Unit, name: string, heading: Heading, cx: Cx, at: Pos): boolean {
    const other = owner.entries.get(name);
    if (other && other.heading !== heading && other.layer === 1) {
      this.fail("name-collision", cx.where, `断片の名前 "${name}" は、${other.heading} の "${name}" と同じです。名前は部品の中で1つです`, at);
      return true;
    }
    return false;
  }

  /** The parameters of a fill (`conditions.x(member, book)`, `does.x(…)`) are the names of the place where its fragment is written. */
  private bindFillParams(fill: Entry, cx: Cx, module: Module): Map<string, TE> {
    const vars = new Map(cx.vars);
    for (const param of fill.method?.params ?? []) {
      const known = cx.vars.get(param.name);
      if (!known) {
        this.fail("unknown-name", `${fill.heading}.${fill.name}`, `引数 "${param.name}" は、${fill.name} を書いた場所にありません (あるのは: ${[...cx.vars.keys()].join(", ") || "なし"})`, param.at);
        continue;
      }
      if (param.type) {
        const declared = this.typeOf(param.type, module, `${fill.heading}.${fill.name}`);
        if (!fits(known.t, declared)) this.fail("type-mismatch", `${fill.heading}.${fill.name}`, `引数 ${param.name} は ${show(known.t)} です (${show(declared)} と書いてあります)`, param.at);
      }
    }
    return vars;
  }

  // A call of another component's command: `Fines.Charge(m, d)`. Its output is a value of the state before the step.
  private commandCall(expr: Syn, cx: Cx): { call: Call; output: Expr; outputType: T; unit: Unit } | undefined {
    if (expr.k !== "call" || expr.callee.k !== "member" || expr.callee.object.k !== "id") return undefined;
    const unit = this.unitOf(cx.module, expr.callee.object.name);
    if (!unit || (unit.kind !== "service" && unit.kind !== "external")) return undefined;
    const port = expr.callee.name;
    const sig = this.portSignature(unit, port, cx, expr.at);
    if (!sig || sig.kind !== "command") return undefined;
    if (cx.mode !== "command" && cx.mode !== "example") {
      this.fail("write-in-query", cx.where, `${unit.exportName}.${port} はコマンドです。コマンドを呼べるのは、コマンドの中だけです`, expr.at);
      return undefined;
    }
    const args = this.args(expr.args, sig.params, cx, `${unit.exportName}.${port}`);
    cx.b.uses.add(unit);
    const call: Call = { component: unit.id, command: port, args };
    return { call, output: ["outputOf", unit.id, port, args], outputType: sig.output ?? "void", unit };
  }
  private applyCall(found: { call: Call; unit: Unit }, ps: PathState, cx: Cx, at: Pos) {
    if (found.unit.kind === "service") {
      if (ps.called.has(found.unit.id)) this.fail("read-after-write", cx.where, `${found.unit.exportName} のコマンドを、1つの場合の中で2回呼んでいます（1つのステップで、1つの部品に起きることは1つです）`, at);
      ps.called.add(found.unit.id);
      cx.b.called.add(`${found.unit.id}.${found.call.command}`);
    }
    ps.calls.push(ps.when.length > 0 ? { ...found.call, when: and(ps.when) } : found.call);
  }

  private portSignature(unit: Unit, port: string, cx: Cx, at: Pos): { kind: "command" | "query"; params: Params; output?: T } | undefined {
    if (unit.kind === "external") {
      const built = this.component(unit);
      const q = built.ir.external?.queries[port];
      if (q) return { kind: "query", params: q.params, output: q.result };
      const c = built.ir.external?.commands[port];
      if (c) return { kind: "command", params: c.params };
      this.fail("unknown-name", cx.where, `${unit.exportName} に "${port}" はありません (あるのは: ${[...Object.keys(built.ir.external?.queries ?? {}), ...Object.keys(built.ir.external?.commands ?? {})].join(", ")})`, at);
      return undefined;
    }
    const built = this.component(unit);
    const command = built.ir.commands?.[port];
    if (command) return { kind: "command", params: command.params, output: this.outputs.get(`${unit.id}.${port}`) };
    const query = built.ir.queries?.[port];
    if (query) return { kind: "query", params: query.params, output: query.result };
    const entry = unit.entries.get(port);
    if (entry?.prose !== undefined) this.fail("prose-left", cx.where, `${unit.exportName}.${port}「${entry.prose}」の中身がありません`, at);
    else if (unit.proseOnly && !unit.interpretation) this.fail("prose-left", cx.where, `${unit.exportName} は文だけの部品で、${port} の中身がありません。clp interpret で導いてください`, at);
    else this.fail("unknown-name", cx.where, `${unit.exportName} に "${port}" はありません`, at);
    return undefined;
  }

  private args(given: Syn[], params: Params, cx: Cx, what: string): Record<string, Expr> {
    const names = Object.keys(params);
    if (given.length !== names.length) this.fail("arity", cx.where, `${what} の引数は ${names.length} 個です (${names.join(", ")}) が、${given.length} 個あります`, given[0]?.at);
    const result: Record<string, Expr> = {};
    names.forEach((name, i) => {
      if (given[i]) result[name] = this.expect(this.tx(given[i], cx), params[name], cx, `${what} の ${name}`, given[i].at).e;
    });
    return result;
  }

  // --- Queries, rules, examples ---

  private query(b: Built, entry: Entry) {
    const unit = b.unit;
    const where = `${unit.exportName}.queries.${entry.name}`;
    if (entry.replaced) this.note(b, `${unit.id}.queries.${entry.name}`, entry.replaced, entry);
    const method = this.methodOf(b, entry, "問い合わせ");
    b.ir.queries ??= {};
    if (!method) return;
    const vars = new Map<string, TE>(Object.entries(method.params).map(([name, t]) => [name, { e: ["var", name], t }]));
    const cx: Cx = { b, owner: unit, module: method.module, vars, mode: "query", where, hasThis: true };
    const { value, requires } = this.expressionBody(method.body, cx);
    const declared = method.ret ? this.typeOf(method.ret, method.module, where) : undefined;
    const result = declared ? this.expect(value, declared, cx, "答え").t : value.t;
    if (result === "void") this.fail("missing-output", where, "問い合わせは値を return します");
    b.ir.queries[entry.name] = { params: method.params, result: concrete(result), ...(requires ? { requires } : {}), is: value.e };
  }

  /** A body that is one value: `const`s, `if (…) return …`, and a last `return`. */
  private expressionBody(body: Block, cx: Cx): { value: TE; requires?: Expr } {
    const vars = new Map(cx.vars);
    const scoped: Cx = { ...cx, vars };
    let requires: Expr | undefined;
    const go = (stmts: Stmt[]): TE => {
      for (let i = 0; i < stmts.length; i++) {
        const stmt = stmts[i];
        if (stmt.k === "const") {
          const value = this.tx(stmt.init, scoped);
          vars.set(stmt.name, stmt.type ? this.expect(value, this.typeOf(stmt.type, cx.module, cx.where), scoped, stmt.name) : value);
          continue;
        }
        if (stmt.k === "return") return stmt.expr ? this.tx(stmt.expr, scoped) : this.fail("missing-output", cx.where, "値を return します", stmt.at);
        if (stmt.k === "block") return go([...stmt.body, ...stmts.slice(i + 1)]);
        if (stmt.k === "if") {
          const test = this.expect(this.tx(stmt.test, scoped), "bool", scoped, "if の条件", stmt.at);
          const outer = scoped.nonNull;
          scoped.nonNull = this.narrowed(scoped, stmt.test, true).nonNull;
          const yes = go([stmt.then]);
          scoped.nonNull = this.narrowed({ ...scoped, nonNull: outer }, stmt.test, false).nonNull;
          const no = go([...(stmt.else ? [stmt.else] : []), ...stmts.slice(i + 1)]);
          scoped.nonNull = outer;
          const t = join(yes.t, no.t);
          if (t === undefined) this.fail("type-mismatch", cx.where, `答えの型 ${show(yes.t)} と ${show(no.t)} がそろいません`, stmt.at);
          return { e: ["ite", test.e, yes.e, no.e], t: t ?? "any" };
        }
        if (stmt.k === "expr" && stmt.expr.k === "call" && stmt.expr.callee.k === "id") {
          const sym = this.names.resolve(cx.module, stmt.expr.callee.name);
          if (sym.k === "core" && sym.name === "requires" && i === 0) {
            requires = this.expect(this.tx(stmt.expr.args[0], scoped), "bool", scoped, "requires の条件").e;
            continue;
          }
        }
        return this.fail("syntax", cx.where, "ここには const、if (…) return …、return だけを書きます（状態は変えられません）", stmt.at);
      }
      return this.fail("missing-output", cx.where, "値を return します");
    };
    return { value: go(body.body), requires };
  }

  private rule(b: Built, entry: Entry) {
    const unit = b.unit;
    const where = `${unit.exportName}.rules.${entry.name}`;
    if (entry.replaced) this.note(b, `${unit.id}.rules.${entry.name}`, entry.replaced, entry);
    const method = this.methodOf(b, entry, "性質");
    if (!method) return;
    const cx: Cx = { b, owner: unit, module: method.module, vars: new Map(), mode: "rule", where, hasThis: true };
    const { value } = this.expressionBody(method.body, cx);
    if (value.t !== "temporal" && value.t !== "bool" && value !== BAD) this.fail("type-mismatch", where, "性質は always(…) などの時相の式か、状態についての条件を返します");
    const is = value.t === "bool" ? (["always", value.e] as Expr) : value.e;
    const invariant = Array.isArray(is) && is[0] === "always" && !hasTemporal(is[1] as Expr);
    b.ir.properties ??= {};
    b.ir.properties[entry.name] = { kind: invariant ? "invariant" : "temporal", is };
  }

  private example(b: Built, entry: Entry) {
    const unit = b.unit;
    const where = `${unit.exportName}.examples.${entry.name}`;
    const call = entry.value;
    if (!call || call.k !== "call" || call.callee.k !== "id" || this.names.resolve(unit.module, call.callee.name).k !== "core" || call.args[1]?.k !== "arrow") {
      this.fail("syntax", where, "具体例は example(\"文\", () => { … }) で書きます", entry.at);
      return;
    }
    const exampleText = proseOf(call.args[0]);
    if (exampleText !== undefined) b.notes[`${unit.id}.examples.${entry.name}`] = exampleText;
    const body = call.args[1].body;
    const stmts = body.k === "block" ? body.body : [{ k: "expr" as const, expr: body, at: body.at }];
    const steps: NonNullable<Ir8["examples"]>[string]["steps"] = [];
    const cx: Cx = { b, owner: unit, module: unit.module, vars: new Map(), mode: "example", where, hasThis: false };
    for (const stmt of stmts) {
      if (stmt.k !== "expr" || stmt.expr.k !== "call") {
        this.fail("syntax", where, "具体例の手順は、部品の呼び出し、expect(…).toBe(…)、外の世界.問い合わせ.returns(…) で書きます", stmt.at);
        continue;
      }
      const step = this.exampleStep(stmt.expr, cx);
      if (step) steps.push(step);
    }
    b.examples[entry.name] = { steps };
  }
  private exampleStep(expr: Extract<Syn, { k: "call" }>, cx: Cx): NonNullable<Ir8["examples"]>[string]["steps"][number] | undefined {
    const constant = (e: Syn): unknown => {
      if (e.k === "str" || e.k === "num" || e.k === "bool") return e.value;
      if (e.k === "null") return null;
      if (e.k === "unary" && e.op === "-" && e.expr.k === "num") return -e.expr.value;
      if (e.k === "arr") return e.items.map(constant);
      if (e.k === "obj") return Object.fromEntries(e.props.flatMap((p) => (p.k === "prop" ? [[p.key, constant(p.value)]] : [])));
      this.fail("syntax", cx.where, "具体例の値は定数で書きます", e.at);
      return null;
    };
    const portCall = (call: Syn): TraceStep | undefined => {
      if (call.k !== "call" || call.callee.k !== "member" || call.callee.object.k !== "id") return void this.fail("syntax", cx.where, "部品.コマンド(…) の形で書きます", call.at);
      const unit = this.unitOf(cx.module, call.callee.object.name);
      if (!unit || unit.kind !== "service") return void this.fail("unknown-name", cx.where, `"${call.callee.object.name}" は部品ではありません`, call.at);
      const sig = this.portSignature(unit, call.callee.name, cx, call.at);
      if (!sig) return undefined;
      const names = Object.keys(sig.params);
      return { event: `${unit.id}.${call.callee.name}`, params: Object.fromEntries(names.map((name, i) => [name, call.args[i] ? constant(call.args[i]) : null])) };
    };
    // expect(X).toBe(v) / toEqual(v)
    if (expr.callee.k === "member" && (expr.callee.name === "toBe" || expr.callee.name === "toEqual") && expr.callee.object.k === "call" && expr.callee.object.callee.k === "id" && expr.callee.object.callee.name === "expect") {
      const step = portCall(expr.callee.object.args[0]);
      return step ? { expect: { event: step.event, params: step.params, output: constant(expr.args[0]) } } : undefined;
    }
    // Clock.Today.returns(100)
    if (expr.callee.k === "member" && expr.callee.name === "returns" && expr.callee.object.k === "member" && expr.callee.object.object.k === "id") {
      const unit = this.unitOf(cx.module, expr.callee.object.object.name);
      if (!unit || unit.kind !== "external") return void this.fail("syntax", cx.where, "returns(…) は外の世界の問い合わせに使います", expr.at);
      return { event: "answers", params: {}, answers: { [`${unit.id}.${expr.callee.object.name}`]: constant(expr.args[0]) } };
    }
    return portCall(expr);
  }

  // --- Expressions ---

  tx(expr: Syn, cx: Cx): TE {
    const value = this.tx0(expr, cx);
    return cx.nonNull?.has(JSON.stringify(value.e)) && isOptional(value.t) ? { e: value.e, t: nonNull(value.t) } : value;
  }

  /** The expressions a test shows not to be null when it holds (`positive`) or when it does not. */
  private narrowing(test: Syn, cx: Cx, positive: boolean): string[] {
    if (test.k === "unary" && test.op === "!") return this.narrowing(test.expr, cx, !positive);
    if (test.k === "bin" && test.op === "&&" && positive) return [...this.narrowing(test.left, cx, true), ...this.narrowing(test.right, cx, true)];
    if (test.k === "bin" && test.op === "||" && !positive) return [...this.narrowing(test.left, cx, false), ...this.narrowing(test.right, cx, false)];
    if (test.k === "bin" && ["===", "==", "!==", "!="].includes(test.op)) {
      const side = test.right.k === "null" ? test.left : test.left.k === "null" ? test.right : undefined;
      if (!side) return [];
      const notNullWhen = test.op === "!==" || test.op === "!=";
      if (notNullWhen !== positive) return [];
      const quiet = new Builder(this.program);
      return [JSON.stringify(quiet.tx0(side, cx).e)];
    }
    return [];
  }
  private narrowed(cx: Cx, test: Syn, positive: boolean): Cx {
    const keys = this.narrowing(test, cx, positive);
    return keys.length === 0 ? cx : { ...cx, nonNull: new Set([...(cx.nonNull ?? []), ...keys]) };
  }

  private tx0(expr: Syn, cx: Cx): TE {
    switch (expr.k) {
      case "num":
        if (!Number.isInteger(expr.value)) return this.fail("not-integer", cx.where, `${expr.value}: 数は整数だけです`, expr.at);
        return { e: expr.value, t: "int" };
      case "str":
        return { e: lit(expr.value), t: { enum: [expr.value] } };
      case "bool":
        return { e: expr.value, t: "bool" };
      case "null":
        return { e: null, t: "null" };
      case "tmpl": {
        let result: Expr = lit(expr.quasis[0]);
        expr.exprs.forEach((part, i) => {
          const value = this.tx(part, cx);
          const text: Expr = baseOf(value.t) === "string" ? value.e : ["str", value.e];
          result = ["concat", result, text, lit(expr.quasis[i + 1])];
        });
        return { e: simplifyConcat(result), t: "string" };
      }
      case "id":
        return this.identifier(expr, cx);
      case "this":
        return this.fail("syntax", cx.where, "this は this.状態 の形で使います", expr.at);
      case "member":
        return this.member(expr, cx);
      case "index": {
        const object = this.tx(expr.object, cx);
        const index = this.tx(expr.index, cx);
        if (isList(nonNull(object.t))) {
          this.expect(index, "int", cx, "番号");
          return { e: ["at", object.e, index.e], t: (nonNull(object.t) as { list: Type }).list };
        }
        return this.fail("syntax", cx.where, "[ … ] は並びの番号にだけ使えます。Map は get(…) で読みます", expr.at);
      }
      case "call":
        return this.call(expr, cx);
      case "obj": {
        let base: TE | undefined;
        const fields: Record<string, Expr> = {};
        const types: Record<string, Type> = {};
        for (const prop of expr.props) {
          if (prop.k === "spread") {
            if (base || Object.keys(fields).length > 0) return this.fail("syntax", cx.where, "... は組の先頭に1つだけ書きます", prop.at);
            base = this.tx(prop.expr, cx);
            if (!isRecord(nonNull(base.t))) return this.fail("type-mismatch", cx.where, `${show(base.t)} は組ではありません`, prop.at);
            continue;
          }
          if (prop.k === "method") return this.fail("syntax", cx.where, "値の中にメソッドは書けません", prop.at);
          const value = this.tx(prop.value, cx);
          fields[prop.key] = value.e;
          // kept as read (a null stays null, so that joining it with a record type gives `| null`)
          types[prop.key] = value.t as Type;
        }
        if (base) {
          const record = (nonNull(base.t) as { record: Record<string, Type> }).record;
          for (const key of Object.keys(fields)) {
            if (!(key in record)) this.fail("unknown-name", cx.where, `組に "${key}" はありません`, expr.at);
            else if (!fits(types[key], record[key])) this.fail("type-mismatch", cx.where, `${key}: ${show(record[key])} が要る所に ${show(types[key])} があります`, expr.at);
          }
          return { e: ["with", base.e, fields], t: nonNull(base.t) };
        }
        return { e: ["record", fields], t: { record: types } };
      }
      case "arr": {
        let parts: Expr[] = [];
        let items: Expr[] = [];
        let t: T = "any";
        for (const item of expr.items) {
          if (item.k === "spread") {
            const list = this.tx(item.expr, cx);
            if (!isList(nonNull(list.t)) && list.t !== "any") return this.fail("type-mismatch", cx.where, `... は並びにだけ使えます (${show(list.t)})`, item.at);
            if (items.length) parts.push(["list", ...items]);
            items = [];
            parts.push(list.e);
            const joined = join(t, list.t === "any" ? "any" : (nonNull(list.t) as { list: Type }).list);
            if (joined === undefined) return this.fail("type-mismatch", cx.where, "並びの要素の型がそろいません", item.at);
            t = joined;
            continue;
          }
          const value = this.tx(item, cx);
          items.push(value.e);
          const joined = join(t, value.t);
          if (joined === undefined) return this.fail("type-mismatch", cx.where, `並びの要素の型がそろいません (${show(t)} と ${show(value.t)})`, item.at);
          t = joined;
        }
        if (items.length || parts.length === 0) parts.push(["list", ...items]);
        const e = parts.length === 1 ? parts[0] : (["concat", ...parts] as Expr);
        return { e, t: t === "any" ? ({ list: "any" } as unknown as T) : { list: concrete(t) } };
      }
      case "spread":
        return this.fail("syntax", cx.where, "... は並びか組の中にだけ書けます", expr.at);
      case "arrow":
        return this.fail("syntax", cx.where, "関数は some / every / count / filter / map / sum の引数にだけ書けます", expr.at);
      case "unary": {
        const value = this.tx(expr.expr, cx);
        if (expr.op === "!") return { e: not(this.expect(value, "bool", cx, "!", expr.at).e), t: "bool" };
        this.expect(value, "int", cx, expr.op, expr.at);
        return { e: expr.op === "-" ? (typeof value.e === "number" ? -value.e : ["neg", value.e]) : value.e, t: "int" };
      }
      case "bin":
        return this.binary(expr, cx);
      case "cond": {
        const test = this.expect(this.tx(expr.test, cx), "bool", cx, "条件");
        const yes = this.tx(expr.then, this.narrowed(cx, expr.test, true));
        const no = this.tx(expr.else, this.narrowed(cx, expr.test, false));
        const t = join(yes.t, no.t);
        if (t === undefined) return this.fail("type-mismatch", cx.where, `? : の両側の型 ${show(yes.t)} と ${show(no.t)} がそろいません`, expr.at);
        return { e: ["ite", test.e, yes.e, no.e], t };
      }
      case "as": {
        const value = this.tx(expr.expr, cx);
        if (expr.type === "const") return value;
        const t = this.typeOf(expr.type, cx.module, cx.where);
        // a JSON value read as a type: taken as it is (a value that does not fit is found when the spec runs)
        if (value.t === "json" || (isList(value.t) && value.t.list === "json")) return { e: value.e, t };
        // a string kept somewhere read back as an identifier, and the other way
        if ((baseOf(value.t) === "string" && isAtom(t)) || (isAtom(value.t) && baseOf(t) === "string")) return { e: value.e, t };
        return this.expect(value, t, cx, "as");
      }
      case "assign":
        return this.fail("syntax", cx.where, "代入は文として書きます", expr.at);
      case "nonNull": {
        const value = this.tx(expr.expr, cx);
        return { e: ["nonNull", value.e], t: nonNull(value.t) };
      }
    }
  }

  private identifier(expr: Extract<Syn, { k: "id" }>, cx: Cx): TE {
    const local = cx.vars.get(expr.name);
    if (local) return local;
    const sym = this.names.resolve(cx.module, expr.name);
    if (sym.k === "core") {
      if (sym.name === "otherwise") return { e: true, t: "bool" };
      return this.fail("syntax", cx.where, `${expr.name} は、ここでは値として使えません`, expr.at);
    }
    if (sym.k === "const") {
      const unit = this.program.units.find((u) => u.module === sym.module && u.exportName === sym.decl.name);
      if (unit) return this.fail("syntax", cx.where, `${expr.name} は部品です。${expr.name}.コマンド(…) のように呼びます`, expr.at);
      // a constant written at the top of a file
      return this.tx(sym.decl.init, { ...cx, module: sym.module, vars: new Map(), where: `${cx.where} (${expr.name})` });
    }
    if (expr.name === "Math" || expr.name === "String") return this.fail("syntax", cx.where, `${expr.name} は呼び出しの形で使います`, expr.at);
    return this.fail("unknown-name", cx.where, `"${expr.name}" がありません`, expr.at);
  }

  private member(expr: Extract<Syn, { k: "member" }>, cx: Cx): TE {
    if (expr.object.k === "this") return this.readState(expr.name, cx, expr.at);
    const object = this.tx(expr.object, cx);
    if (object === BAD) return BAD;
    const t = nonNull(object.t);
    if (isOptional(object.t) && expr.name !== "length") return this.fail("type-mismatch", cx.where, `${show(object.t)} は null のことがあります。?? で値を決めてから読みます`, expr.at);
    if (isRecord(t)) {
      const field = t.record[expr.name];
      if (!field) return this.fail("unknown-name", cx.where, `組に "${expr.name}" はありません (あるのは: ${Object.keys(t.record).join(", ")})`, expr.at);
      return { e: ["field", object.e, expr.name], t: field };
    }
    if (expr.name === "length" && isList(t)) return { e: ["len", object.e], t: "int" };
    if (expr.name === "length" && baseOf(t) === "string") return { e: ["strlen", object.e], t: "int" };
    if (expr.name === "size" && isSet(t)) return { e: ["card", object.e], t: "int" };
    if (expr.name === "size" && isMap(t)) return { e: ["card", ["dom", object.e]], t: "int" };
    if (t === "any") return { e: ["field", object.e, expr.name], t: "any" };
    // a field of a JSON value: still JSON (`as` gives it a type)
    if (t === "json") return { e: ["field", object.e, expr.name], t: "json" };
    return this.fail("unknown-name", cx.where, `${show(object.t)} に "${expr.name}" はありません`, expr.at);
  }

  private binary(expr: Extract<Syn, { k: "bin" }>, cx: Cx): TE {
    const left = this.tx(expr.left, cx);
    const right = this.tx(expr.right, expr.op === "&&" ? this.narrowed(cx, expr.left, true) : expr.op === "||" ? this.narrowed(cx, expr.left, false) : cx);
    switch (expr.op) {
      case "&&":
      case "||":
        this.expect(left, "bool", cx, expr.op, expr.at);
        this.expect(right, "bool", cx, expr.op, expr.at);
        return { e: [expr.op === "&&" ? "and" : "or", left.e, right.e], t: "bool" };
      case "===":
      case "==":
      case "!==":
      case "!=": {
        if (join(left.t, right.t) === undefined && left.t !== "any" && right.t !== "any") this.fail("type-mismatch", cx.where, `${show(left.t)} と ${show(right.t)} は比べられません`, expr.at);
        if (isEnum(left.t) && isEnum(right.t) && !right.t.enum.some((v) => (left.t as { enum: unknown[] }).enum.includes(v))) {
          this.fail("type-mismatch", cx.where, `${show(left.t)} が ${show(right.t)} と等しくなることはありません`, expr.at);
        }
        const e: Expr = ["=", left.e, right.e];
        return { e: expr.op.startsWith("!") ? ["not", e] : e, t: "bool" };
      }
      case "<":
      case "<=":
      case ">":
      case ">=":
        this.expect(left, "int", cx, expr.op, expr.at);
        this.expect(right, "int", cx, expr.op, expr.at);
        return { e: [expr.op, left.e, right.e], t: "bool" };
      case "+":
        if (baseOf(left.t) === "string" || baseOf(right.t) === "string") {
          const text = (v: TE): Expr => (baseOf(v.t) === "string" ? v.e : ["str", v.e]);
          return { e: simplifyConcat(["concat", text(left), text(right)]), t: "string" };
        }
        this.expect(left, "int", cx, "+", expr.at);
        this.expect(right, "int", cx, "+", expr.at);
        return { e: ["+", left.e, right.e], t: "int" };
      case "-":
      case "*":
      case "%":
        this.expect(left, "int", cx, expr.op, expr.at);
        this.expect(right, "int", cx, expr.op, expr.at);
        return { e: [expr.op === "%" ? "mod" : expr.op, left.e, right.e], t: "int" };
      case "/":
        return this.fail("syntax", cx.where, "割り算は Math.floor(a / b) と書きます（数は整数だけです）", expr.at);
      case "??": {
        if (!isOptional(left.t) && left.t !== "null" && left.t !== "any") this.fail("type-mismatch", cx.where, `?? の左は null のことがある値です (${show(left.t)})`, expr.at);
        const t = join(nonNull(left.t), right.t);
        if (t === undefined) return this.fail("type-mismatch", cx.where, `?? の両側の型 ${show(left.t)} と ${show(right.t)} がそろいません`, expr.at);
        return { e: ["??", left.e, right.e], t };
      }
    }
  }

  private call(expr: Extract<Syn, { k: "call" }>, cx: Cx): TE {
    const callee = expr.callee;
    // is.name("文", 式?) / value.name("文")
    const core = (name: string) => !cx.vars.has(name) && this.names.resolve(cx.module, name).k === "core";
    if (callee.k === "member" && callee.object.k === "id" && callee.object.name === "is" && core("is")) return this.isFragment(expr, callee.name, cx);
    if (callee.k === "member" && callee.object.k === "id" && callee.object.name === "value" && core("value")) return this.isFragment(expr, callee.name, cx, "calcs");
    if (callee.k === "member" && callee.object.k === "id" && callee.object.name === "does") return this.fail("syntax", cx.where, "does.名前(…) は文として書きます", expr.at);
    if (callee.k === "id") {
      const sym = this.names.resolve(cx.module, callee.name);
      if (sym.k === "core") return this.coreCall(sym.name, expr, cx);
      if (callee.name === "String" && sym.k === "unknown") {
        const value = this.tx(expr.args[0], cx);
        return { e: baseOf(value.t) === "string" ? value.e : ["str", value.e], t: "string" };
      }
      const unit = this.unitOf(cx.module, callee.name);
      if (unit && (unit.kind === "decisions" || unit.kind === "condition" || unit.kind === "calc")) return this.useFunction(unit, expr, cx);
      return this.fail("unknown-name", cx.where, `"${callee.name}" は呼べません`, expr.at);
    }
    if (callee.k === "member") {
      // Math.floor(a / b), Math.min, Math.max, Math.abs
      if (callee.object.k === "id" && callee.object.name === "Math" && this.names.resolve(cx.module, "Math").k === "unknown") return this.math(callee.name, expr, cx);
      if (callee.object.k === "id") {
        const unit = this.unitOf(cx.module, callee.object.name);
        if (unit && (unit.kind === "service" || unit.kind === "external")) {
          const sig = this.portSignature(unit, callee.name, cx, expr.at);
          if (!sig) return BAD;
          cx.b.uses.add(unit);
          if (sig.kind === "command") return this.fail("syntax", cx.where, `${unit.exportName}.${callee.name} はコマンドです。文として呼ぶか、const 答え = ${unit.exportName}.${callee.name}(…) と書きます`, expr.at);
          if (cx.mode === "example") return this.fail("syntax", cx.where, "問い合わせの答えは expect(…) で確かめます", expr.at);
          if (cx.ps?.called.has(unit.id)) this.fail("read-after-write", cx.where, `${unit.exportName} のコマンドを呼んだあとで、${unit.exportName} に問い合わせています（読むのは、いつもステップの前の値です）`, expr.at);
          const args = this.args(expr.args, sig.params, cx, `${unit.exportName}.${callee.name}`);
          if (unit.kind === "service") cx.b.called.add(`${unit.id}.${callee.name}`);
          return { e: ["ask", unit.id, callee.name, args], t: sig.output ?? "any" };
        }
      }
      return this.method(expr, callee, cx);
    }
    return this.fail("syntax", cx.where, "この形の呼び出しは書けません", expr.at);
  }

  private coreCall(name: string, expr: Extract<Syn, { k: "call" }>, cx: Cx): TE {
    const arrowBody = (arg: Syn | undefined, vars: Map<string, TE> = cx.vars): TE => {
      if (!arg || arg.k !== "arrow") return this.fail("syntax", cx.where, `${name}(() => …) の形で書きます`, expr.at);
      const body = arg.body.k === "block" ? this.expressionBody(arg.body, { ...cx, vars }).value : this.tx(arg.body, { ...cx, vars });
      return body;
    };
    switch (name) {
      case "failed": {
        const value = this.tx(expr.args[0], cx);
        if (!(Array.isArray(value.e) && value.e[0] === "ask")) this.fail("syntax", cx.where, "failed(…) は、外の世界への問い合わせ（の答え）に使います", expr.at);
        return { e: ["failed", value.e], t: "bool" };
      }
      case "always":
      case "eventually":
      case "after":
      case "once":
      case "historically": {
        if (cx.mode !== "rule") return this.fail("syntax", cx.where, `${name} は rules の中だけで使えます`, expr.at);
        const body = arrowBody(expr.args[0]);
        if (body.t !== "bool" && body.t !== "temporal" && body !== BAD) this.fail("type-mismatch", cx.where, `${name} の中は条件です`, expr.at);
        return { e: [name, body.e], t: "temporal" };
      }
      case "until": {
        if (cx.mode !== "rule") return this.fail("syntax", cx.where, "until は rules の中だけで使えます", expr.at);
        return { e: ["until", arrowBody(expr.args[0]).e, arrowBody(expr.args[1]).e], t: "temporal" };
      }
      case "requires":
        return this.fail("syntax", cx.where, "requires(…) はメソッドの先頭に文として書きます", expr.at);
      default:
        return this.fail("syntax", cx.where, `${name}(…) は、ここでは使えません`, expr.at);
    }
  }

  // always.on.Return((book) => …)
  private occurrence(command: string, fn: Syn | undefined, cx: Cx, at: Pos): TE {
    const sig = cx.b.ir.commands?.[command];
    if (!sig) return this.fail("unknown-name", cx.where, `コマンド "${command}" はありません`, at);
    if (!fn || fn.k !== "arrow") return this.fail("syntax", cx.where, `always.on.${command}((引数) => …) の形で書きます`, at);
    const vars = new Map(cx.vars);
    const names = Object.keys(sig.params);
    fn.params.forEach((param, i) => vars.set(param.name, { e: ["var", param.name], t: sig.params[names[i]] ?? "any" }));
    const body = fn.body.k === "block" ? this.expressionBody(fn.body, { ...cx, vars }).value : this.tx(fn.body, { ...cx, vars });
    return { e: ["always", ["on", command, Object.fromEntries(fn.params.map((p, i) => [names[i], p.name])), body.e]], t: "temporal" };
  }

  private isFragment(expr: Extract<Syn, { k: "call" }>, name: string, cx: Cx, kind: "conditions" | "calcs" = "conditions"): TE {
    const owner = cx.owner;
    const word = kind === "conditions" ? "is" : "value";
    if (this.fragmentClash(owner, name, kind, cx, expr.at)) return BAD;
    // is.name() / value.name(): the entry of that name under the heading
    const named = expr.args.length === 0 ? owner.entries.get(name) : undefined;
    const text = expr.args.length > 0 ? proseOf(expr.args[0]) : named?.heading === kind ? (named.prose ?? named.replaced ?? "") : undefined;
    if (text === undefined) return this.fail(expr.args.length === 0 ? "unknown-name" : "syntax", cx.where, expr.args.length === 0 ? `${kind} に "${name}" がありません` : `${word}.${name}(…) の最初の引数は、文です`, expr.at);
    if (kind === "calcs") return this.valueFragment(expr, name, text, cx);
    this.usedFragments.add(`${owner.id}#${name}`);
    let value: TE;
    const { decision, fill } = this.fillOf(owner, name, "is", expr.args[1] !== undefined);
    if (decision === "overwrite") this.fail("overwrite", `${owner.exportName}.conditions.${name}`, `is.${name} は Layer 1 に式があります。解釈では書き換えられません`, fill?.at);
    if (decision === "inline" || decision === "overwrite") {
      value = this.expect(this.tx(expr.args[1], cx), "bool", cx, `is.${name}`);
    } else {
      if (decision !== "fill" || !fill) return { ...this.fail("prose-left", cx.where, `「${text}」(is.${name}) の中身（式）がありません`, expr.at), t: "bool" };
      const module = this.moduleOf(owner, fill);
      const vars = this.bindFillParams(fill, cx, module);
      const fillCx: Cx = { ...cx, module, vars, where: `${owner.exportName}.conditions.${name}` };
      value = fill.method ? this.expressionBody(fill.method.body, fillCx).value : fill.value ? this.tx(fill.value, fillCx) : BAD;
      value = this.expect(value, "bool", fillCx, `is.${name}`);
    }
    if (cx.mode === "decision") return value;
    // a named condition of the component: the guard reads its name, the table its expression
    const conditions = (cx.b.ir.conditions ??= {});
    const params: Params = {};
    for (const v of freeVars(value.e)) {
      const known = cx.vars.get(v);
      if (known) params[v] = concrete(known.t);
    }
    const key = owner === cx.b.unit ? name : `${owner.id}.${name}`;
    const existing = conditions[key];
    if (existing && JSON.stringify(existing.is) !== JSON.stringify(value.e)) return this.fail("name-collision", cx.where, `is.${name} が2つの場所で違う意味で使われています`, expr.at);
    conditions[key] = { params, is: value.e };
    cx.b.notes[`${cx.b.unit.id}.conditions.${key}`] = text;
    return { e: ["cond", key, Object.fromEntries(Object.keys(params).map((p) => [p, ["var", p]]))], t: "bool" };
  }

  // value.name("文"): a value written as prose, filled under `calcs` (a method returning the value)
  private valueFragment(expr: Extract<Syn, { k: "call" }>, name: string, text: string, cx: Cx): TE {
    const owner = cx.owner;
    this.usedFragments.add(`${owner.id}#${name}`);
    const { decision, fill } = this.fillOf(owner, name, "value", false);
    if (decision === "not-a-method") return this.fail("syntax", `${owner.exportName}.calcs.${name}`, "calcs の中身は 名前(引数) { … } のメソッドで書きます", fill?.at);
    if (decision !== "fill" || !fill?.method) return this.fail("prose-left", cx.where, `「${text}」(value.${name}) の中身（式）がありません`, expr.at);
    const module = this.moduleOf(owner, fill);
    const vars = this.bindFillParams(fill, cx, module);
    const fillCx: Cx = { ...cx, module, vars, where: `${owner.exportName}.calcs.${name}` };
    let value = this.expressionBody(fill.method.body, fillCx).value;
    if (fill.method.ret) value = this.expect(value, this.typeOf(fill.method.ret, module, fillCx.where), fillCx, `value.${name}`);
    if (cx.mode === "decision") return value;
    const params: Params = {};
    for (const v of freeVars(value.e)) {
      const known = cx.vars.get(v);
      if (known) params[v] = concrete(known.t);
    }
    const key = owner === cx.b.unit ? name : `${owner.id}.${name}`;
    const calcs = (cx.b.ir.calcs ??= {});
    const existing = calcs[key];
    if (existing && JSON.stringify(existing.is) !== JSON.stringify(value.e)) return this.fail("name-collision", cx.where, `value.${name} が2つの場所で違う意味で使われています`, expr.at);
    calcs[key] = { params, result: concrete(value.t), is: value.e };
    if (text) cx.b.notes[`${cx.b.unit.id}.calcs.${key}`] = text;
    return { e: ["calc", key, Object.fromEntries(Object.keys(params).map((p) => [p, ["var", p]]))], t: value.t };
  }

  // A decision table, named condition or calculation defined elsewhere, called like a function.
  private useFunction(unit: Unit, expr: Extract<Syn, { k: "call" }>, cx: Cx): TE {
    const where = unit.exportName;
    if (!unit.fn) {
      if (unit.proseOnly) {
        const fill = [...unit.entries.values()].find((e) => e.method);
        if (!fill) return this.fail("prose-left", cx.where, `${unit.exportName}「${unit.description?.text ?? ""}」の中身がありません`, expr.at);
      }
      return this.fail("prose-left", cx.where, `${unit.exportName} の中身がありません`, expr.at);
    }
    const params = this.paramsOf(unit.fn.params, unit.module, where);
    const args = this.args(expr.args, params, cx, unit.exportName);
    cx.b.uses.add(unit);
    const vars = new Map<string, TE>(Object.entries(params).map(([name, t]) => [name, { e: ["var", name], t }]));
    // `this` inside it is the state of the component that calls it
    const fnCx: Cx = { b: cx.b, owner: unit, module: unit.module, vars, mode: unit.kind === "decisions" ? "decision" : "pure", where, hasThis: cx.hasThis, ps: cx.ps };
    if (unit.kind === "decisions") {
      const table = (cx.b.ir.decisions ??= {});
      if (!table[unit.id]) {
        const rows = this.decisionRows(unit, fnCx);
        table[unit.id] = { params, result: concrete(rows.t), rows: rows.rows };
        if (unit.description) cx.b.notes[`${cx.b.unit.id}.decisions.${unit.id}`] = unit.description.text;
      }
      return { e: ["decide", unit.id, args], t: table[unit.id].result };
    }
    const body = unit.fn.body.k === "block" ? this.expressionBody(unit.fn.body, fnCx).value : this.tx(unit.fn.body, fnCx);
    if (unit.kind === "condition") {
      this.expect(body, "bool", fnCx, unit.exportName);
      (cx.b.ir.conditions ??= {})[unit.id] = { params, is: body.e };
      if (unit.description) cx.b.notes[`${cx.b.unit.id}.conditions.${unit.id}`] = unit.description.text;
      return { e: ["cond", unit.id, args], t: "bool" };
    }
    const result = unit.fn.ret ? this.expect(body, this.typeOf(unit.fn.ret, unit.module, where), fnCx, unit.exportName).t : body.t;
    (cx.b.ir.calcs ??= {})[unit.id] = { params, result: concrete(result), is: body.e };
    if (unit.description) cx.b.notes[`${cx.b.unit.id}.calcs.${unit.id}`] = unit.description.text;
    return { e: ["calc", unit.id, args], t: result };
  }

  private decisionRows(unit: Unit, cx: Cx): { rows: { when: Expr; then: Record<string, Expr> }[]; t: T } {
    const body = unit.fn!.body;
    const list = body.k === "arr" ? body : body.k === "block" && body.body.length === 1 && body.body[0].k === "return" ? body.body[0].expr : undefined;
    if (!list || list.k !== "arr") {
      this.fail("bad-decision", unit.exportName, "決定表は [[条件, { 列: 定数 }], …, [otherwise, { … }]] の形で書きます", unit.at);
      return { rows: [], t: "any" };
    }
    const rows: { when: Expr; then: Record<string, Expr> }[] = [];
    // each column's type: the cells' types joined (a null cell makes it `| null`)
    const columnTypes = new Map<string, T>();
    list.items.forEach((item, index) => {
      if (item.k !== "arr" || item.items.length !== 2 || item.items[1].k !== "obj") {
        this.fail("bad-decision", unit.exportName, "行は [条件, { 列: 定数 }] で書きます", item.at);
        return;
      }
      const isLast = index === list.items.length - 1;
      const cond = item.items[0];
      const isOtherwise = cond.k === "id" && this.names.resolve(unit.module, cond.name).k === "core" && cond.name === "otherwise";
      const cells = (item.items[1] as Extract<Syn, { k: "obj" }>).props;
      const firstColumns = (list.items[0] as Extract<Syn, { k: "arr" }>).items?.[1];
      const columnsOf = (o: Syn | undefined) => (o?.k === "obj" ? o.props.flatMap((p) => (p.k === "prop" ? [p.key] : [])).sort().join(",") : "");
      const facts = {
        last: isLast,
        otherwise: isOtherwise,
        constantCells: cells.every((p) => p.k === "prop" && ["num", "str", "bool", "null"].includes(p.value.k === "unary" ? p.value.expr.k : p.value.k)),
        sameColumns: columnsOf(item.items[1]) === columnsOf(firstColumns),
      };
      const rowMessages = {
        "last-not-otherwise": "決定表の最後の行は otherwise です",
        "otherwise-not-last": "otherwise は最後の行にだけ書きます",
        "cell-not-constant": "決定表のセルは定数です",
        "columns-differ": "どの行も同じ列を持ちます",
      } as const;
      for (const problem of decided("type-check", { row: facts }, rowStage0(facts))) this.fail("bad-decision", unit.exportName, `行 ${index + 1}: ${rowMessages[problem]}`, item.at);
      const when = isOtherwise ? true : this.expect(this.tx(cond, cx), "bool", cx, "行の条件").e;
      const rowText = !isOtherwise && cond.k === "call" && cond.callee.k === "member" ? proseOf(cond.args[0]) : undefined;
      if (rowText !== undefined) cx.b.notes[`${cx.b.unit.id}.decisions.${unit.id}.rows[${index}]`] = rowText;
      const then: Record<string, Expr> = {};
      for (const prop of (item.items[1] as Extract<Syn, { k: "obj" }>).props) {
        if (prop.k !== "prop") continue;
        const value = this.tx(prop.value, { ...cx, where: `${unit.exportName}.rows[${index}].${prop.key}` });
        then[prop.key] = value.e;
        const before = columnTypes.get(prop.key) ?? "any";
        const joined = join(before, value.t);
        if (joined === undefined) this.fail("bad-decision", unit.exportName, `列 ${prop.key} の型が、行によって違います (${show(before)} と ${show(value.t)})`, prop.at);
        else columnTypes.set(prop.key, joined);
      }
      rows.push({ when, then });
    });
    const t: T = { record: Object.fromEntries([...columnTypes].map(([column, type]) => [column, concrete(type === "null" ? ({ optional: "json" } as T) : type)])) };
    return { rows, t };
  }

  private math(name: string, expr: Extract<Syn, { k: "call" }>, cx: Cx): TE {
    if (name === "floor") {
      const arg = expr.args[0];
      if (arg?.k === "bin" && arg.op === "/") {
        const a = this.expect(this.tx(arg.left, cx), "int", cx, "/");
        const b = this.expect(this.tx(arg.right, cx), "int", cx, "/");
        return { e: ["div", a.e, b.e], t: "int" };
      }
      return this.expect(this.tx(arg, cx), "int", cx, "Math.floor");
    }
    if (name === "min" || name === "max") {
      const values = expr.args.map((a) => this.expect(this.tx(a, cx), "int", cx, `Math.${name}`).e);
      return { e: values.slice(1).reduce<Expr>((acc, v) => [name, acc, v], values[0]), t: "int" };
    }
    if (name === "abs") return { e: ["abs", this.expect(this.tx(expr.args[0], cx), "int", cx, "Math.abs").e], t: "int" };
    return this.fail("syntax", cx.where, `Math.${name} は使えません (floor / min / max / abs だけ)`, expr.at);
  }

  // Methods on values: collections and strings
  private method(expr: Extract<Syn, { k: "call" }>, callee: Extract<Syn, { k: "member" }>, cx: Cx): TE {
    // always.on.Command(fn)
    if (callee.object.k === "member" && callee.object.name === "on" && callee.object.object.k === "id" && callee.object.object.name === "always") {
      if (cx.mode !== "rule") return this.fail("syntax", cx.where, "always.on は rules の中だけで使えます", expr.at);
      return this.occurrence(callee.name, expr.args[0], cx, expr.at);
    }
    const object = this.tx(callee.object, cx);
    if (object === BAD) return BAD;
    const t = nonNull(object.t);
    if (isOptional(object.t)) return this.fail("type-mismatch", cx.where, `${show(object.t)} は null のことがあります`, expr.at);
    const name = callee.name;
    const lambda = (index: number, types: T[]): { binders: string[]; body: TE } | undefined => {
      const fn = expr.args[index];
      if (!fn || fn.k !== "arrow") {
        this.fail("syntax", cx.where, `${name}((…) => …) の形で書きます`, expr.at);
        return undefined;
      }
      const vars = new Map(cx.vars);
      const binders = fn.params.map((p, i) => {
        vars.set(p.name, { e: ["var", p.name], t: types[i] ?? "any" });
        return p.name;
      });
      const body = fn.body.k === "block" ? this.expressionBody(fn.body, { ...cx, vars }).value : this.tx(fn.body, { ...cx, vars });
      return { binders, body };
    };
    const binderOp = (op: string, elementTypes: T[], resultOf: (body: TE) => T): TE => {
      const fn = lambda(0, elementTypes);
      if (!fn) return BAD;
      if (["some", "every", "count", "filter", "find"].includes(op)) this.expect(fn.body, "bool", cx, name);
      if (op === "sum") this.expect(fn.body, "int", cx, name);
      return { e: [op, object.e, fn.binders, fn.body.e], t: resultOf(fn.body) };
    };
    if (isMap(t)) {
      const [k, v] = t.map;
      switch (name) {
        case "has":
          return { e: ["in", this.expect(this.tx(expr.args[0], cx), k, cx, "キー").e, ["dom", object.e]], t: "bool" };
        case "get":
          return { e: ["apply", object.e, this.expect(this.tx(expr.args[0], cx), k, cx, "キー").e], t: v };
        case "keys":
          return { e: ["dom", object.e], t: { set: k } };
        case "values":
          return { e: ["ran", object.e], t: { set: v } };
        case "some":
        case "every":
          return binderOp(name, [k, v], () => "bool");
        case "count":
          return binderOp("count", [k, v], () => "int");
        case "sum":
          return binderOp("sum", [k, v], () => "int");
        case "filter":
          return binderOp("filter", [k, v], () => t);
      }
    }
    if (isSet(t) || isList(t)) {
      const element = isSet(t) ? t.set : t.list;
      const wrapElem = (u: T): T => (isSet(t) ? { set: concrete(u) } : { list: concrete(u) });
      switch (name) {
        case "has":
        case "includes":
          return { e: ["in", this.expect(this.tx(expr.args[0], cx), element, cx, "要素").e, object.e], t: "bool" };
        case "some":
        case "every":
          return binderOp(name, [element], () => "bool");
        case "count":
          return binderOp("count", [element], () => "int");
        case "sum":
          return binderOp("sum", [element], () => "int");
        case "filter":
          return binderOp("filter", [element], () => t);
        case "map":
          return binderOp("map", [element], (body) => wrapElem(body.t));
        case "find":
          if (isList(t)) return binderOp("find", [element], () => ({ optional: element }));
          break;
        case "concat":
          if (isList(t)) {
            const other = this.expect(this.tx(expr.args[0], cx), t, cx, "concat");
            return { e: ["concat", object.e, other.e], t };
          }
          break;
      }
      if (name === "push" || name === "add" || name === "delete" || name === "set") return this.fail("syntax", cx.where, `${name}(…) は this.状態 にだけ書けます`, expr.at);
    }
    if (baseOf(t) === "string") {
      switch (name) {
        case "trim":
          return { e: ["trim", object.e], t: "string" };
        case "toLowerCase":
          return { e: ["lower", object.e], t: "string" };
        case "toUpperCase":
          return { e: ["upper", object.e], t: "string" };
        case "startsWith":
        case "endsWith":
        case "includes":
          return { e: [name === "includes" ? "substr" : name, object.e, this.expect(this.tx(expr.args[0], cx), "string", cx, name).e], t: "bool" };
      }
    }
    return this.fail("unknown-name", cx.where, `${show(object.t)} に ${name}(…) はありません`, expr.at);
  }

  // --- The IR of one component to verify ---

  /** The IR that verifies `root`: the root, every component it contains, and what it relies on. */
  irOf(root: Unit): Ir8 {
    const components: Record<string, ComponentIr> = {};
    const notes: Record<string, string> = {};
    const trace: Record<string, string[]> = {};
    const examples: NonNullable<Ir8["examples"]> = {};
    const sorts = new Set<string>();
    const order: Unit[] = [];
    const visit = (unit: Unit) => {
      if (components[unit.id] || (unit.kind !== "service" && unit.kind !== "external")) return;
      const b = this.component(unit);
      components[unit.id] = { ...b.ir };
      order.push(unit);
      Object.assign(notes, b.notes);
      Object.assign(trace, b.trace);
      for (const [name, example] of Object.entries(b.examples)) examples[`${unit.id}.${name}`] = example;
      for (const used of [...b.uses].sort((a, c) => (a.id < c.id ? -1 : 1))) visit(used);
    };
    visit(root);
    // what each component contains and relies on: a component called and placed nowhere is inside the one that calls it
    const placed = new Set<string>([root.id]);
    for (const unit of order) {
      if (unit.kind !== "service") continue;
      const b = this.component(unit);
      const contains: string[] = [];
      const relies: string[] = [];
      for (const used of [...b.uses].sort((a, c) => (a.id < c.id ? -1 : 1))) {
        if (used.kind === "external") relies.push(used.id);
        else if (used.kind === "service" && !placed.has(used.id)) {
          placed.add(used.id);
          contains.push(used.id);
        }
      }
      if (contains.length) components[unit.id].contains = contains;
      if (relies.length) components[unit.id].relies = relies;
    }
    for (const component of Object.values(components)) collectSorts(component, sorts);
    // entries: the root's commands, and the commands of its parts that nothing inside calls; every query (queries only
    // observe, and a part's state is otherwise seen only through what the root answers)
    const called = new Set(order.flatMap((unit) => [...this.component(unit).called]));
    const commands: string[] = [];
    const queries: string[] = [];
    for (const unit of order) {
      if (unit.kind !== "service") continue;
      const ir = components[unit.id];
      for (const name of Object.keys(ir.commands ?? {}).sort()) if (unit === root || !called.has(`${unit.id}.${name}`)) commands.push(`${unit.id}.${name}`);
      for (const name of Object.keys(ir.queries ?? {}).sort()) queries.push(`${unit.id}.${name}`);
    }
    const ir: Ir8 = { irVersion: IR8_VERSION as 8, root: root.id, sorts: [...sorts].sort(), components, entries: { commands, queries } };
    if (Object.keys(examples).length) ir.examples = examples;
    if (Object.keys(notes).length) ir.notes = notes;
    if (Object.keys(trace).length) ir.trace = trace;
    return ir;
  }
}

/** The sentences of a description: split at 。．.!?！？ and line breaks. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[。．！？!?])|(?<=\.)\s+|\n+/u)
    .map((s) => s.trim().replace(/[。．！？!?.]+$/u, "").trim())
    .filter((s) => s.length > 0);
}

function collectSorts(value: unknown, sorts: Set<string>) {
  if (Array.isArray(value)) value.forEach((v) => collectSorts(v, sorts));
  else if (typeof value === "object" && value !== null) {
    if ("atom" in value && typeof (value as { atom: unknown }).atom === "string") sorts.add((value as { atom: string }).atom);
    Object.values(value).forEach((v) => collectSorts(v, sorts));
  }
}

const TEMPORAL = new Set(["always", "eventually", "after", "once", "historically", "until", "on"]);
function hasTemporal(e: Expr): boolean {
  return Array.isArray(e) && (TEMPORAL.has(e[0] as string) || e.slice(1).some((a) => hasTemporal(a as Expr)));
}

function isConstant(e: Expr): boolean {
  if (e === null || typeof e !== "object") return true;
  const [op, ...rest] = e as readonly unknown[];
  if (op === "lit") return true;
  if (op === "neg") return typeof rest[0] === "number";
  if (op === "list") return rest.every((r) => isConstant(r as Expr));
  if (op === "record") return Object.values(rest[0] as Record<string, Expr>).every(isConstant);
  return false;
}

/** The variables an expression reads (parameters, names bound by `const`), except those its own functions bind. */
export function freeVars(e: unknown, bound: Set<string> = new Set()): Set<string> {
  const found = new Set<string>();
  const walk = (x: unknown, b: Set<string>) => {
    if (!Array.isArray(x)) {
      if (typeof x === "object" && x !== null) Object.values(x).forEach((v) => walk(v, b));
      return;
    }
    const [op, ...args] = x;
    if (op === "lit") return;
    if (op === "var") {
      if (!b.has(args[0] as string)) found.add(args[0] as string);
      return;
    }
    if (["some", "every", "count", "filter", "map", "sum", "find"].includes(op as string) && Array.isArray(args[1])) {
      walk(args[0], b);
      walk(args[2], new Set([...b, ...(args[1] as string[])]));
      return;
    }
    if (op === "on") {
      walk(args[2], new Set([...b, ...Object.values(args[1] as Record<string, string>)]));
      return;
    }
    args.forEach((a) => walk(a, b));
  };
  walk(e, bound);
  return found;
}

function simplifyConcat(e: Expr): Expr {
  if (!Array.isArray(e) || e[0] !== "concat") return e;
  const parts = (e.slice(1) as Expr[]).flatMap((p) => (Array.isArray(p) && p[0] === "concat" ? (simplifyConcat(p) as readonly unknown[]).slice(1) : [p])) as Expr[];
  const kept = parts.filter((p) => !(Array.isArray(p) && p[0] === "lit" && p[1] === ""));
  return kept.length === 0 ? lit("") : kept.length === 1 ? kept[0] : ["concat", ...kept];
}

export { componentName, CORE };
