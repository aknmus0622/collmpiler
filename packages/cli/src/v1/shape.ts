// The shape of the IR (DSL.md §17.8 ③): nothing in its meaning is natural language. Every expression is a known
// operator, every string in it is a name in a place that takes a name, or a constant inside `["lit", …]`. Prose may
// appear only in `notes` and `trace`, which nothing reads for meaning. A safety net behind the reader: an IR that
// fails this was built wrongly, whatever the spec says.

import type { ComponentIr, Expr, Ir8, Type } from "./ir.ts";
import { OP } from "./ops.ts";

const NAME = /^[\p{L}_$][\p{L}\p{N}_$.-]*$/u;
const BINDERS = new Set(["some", "every", "count", "sum", "filter", "map", "find"]);
// the argument positions (from 1) that hold a name, per operator
const NAMES: Record<string, number[]> = { var: [1], state: [1], field: [2], cond: [1], calc: [1], decide: [1], ask: [1, 2], outputOf: [1, 2], on: [1] };

export function shapeProblems(ir: Ir8): string[] {
  const problems: string[] = [];
  const bad = (where: string, message: string): void => void problems.push(`${where}: ${message}`);
  const expr = (e: unknown, where: string): void => {
    if (e === null || typeof e === "number" || typeof e === "boolean") return;
    if (!Array.isArray(e) || typeof e[0] !== "string") return bad(where, `式ではないもの ${JSON.stringify(e)?.slice(0, 80)} があります`);
    const op = e[0];
    if (!OP.has(op)) return bad(where, `知らない演算 "${op}" があります`);
    if (op === "lit") return;
    const names = NAMES[op] ?? [];
    e.slice(1).forEach((arg, i) => {
      const position = i + 1;
      if (names.includes(position)) {
        if (typeof arg !== "string" || !NAME.test(arg)) bad(where, `${op} の ${position} 番目は名前です (${JSON.stringify(arg)})`);
        return;
      }
      if (BINDERS.has(op) && position === 2) {
        if (!Array.isArray(arg) || !arg.every((b) => typeof b === "string" && NAME.test(b))) bad(where, `${op} の束縛は名前の並びです`);
        return;
      }
      if (op === "on" && position === 2) {
        if (typeof arg !== "object" || arg === null || !Object.values(arg).every((b) => typeof b === "string" && NAME.test(b))) bad(where, "on の束縛は { 引数: 名前 } です");
        return;
      }
      if ((op === "record" || op === "with" || op === "cond" || op === "calc" || op === "decide" || op === "ask" || op === "outputOf") && typeof arg === "object" && arg !== null && !Array.isArray(arg)) {
        for (const [key, value] of Object.entries(arg)) {
          if (!NAME.test(key)) bad(where, `${op} のキー ${JSON.stringify(key)} は名前ではありません`);
          expr(value, where);
        }
        return;
      }
      if (typeof arg === "string") return bad(where, `文 ${JSON.stringify(arg).slice(0, 60)} が式の中にあります`);
      expr(arg, where);
    });
  };
  const type = (t: unknown, where: string): void => {
    if (t === "int" || t === "string" || t === "bool" || t === "json") return;
    if (typeof t !== "object" || t === null) return bad(where, `型ではないもの ${JSON.stringify(t)} があります`);
    const x = t as Exclude<Type, string>;
    if ("enum" in x) return;
    if ("atom" in x) return void (NAME.test(x.atom) || bad(where, `原子の名前 ${x.atom}`));
    if ("optional" in x) return type(x.optional, where);
    if ("list" in x) return type(x.list, where);
    if ("set" in x) return type(x.set, where);
    if ("map" in x) return (type(x.map[0], where), type(x.map[1], where));
    if ("record" in x) return Object.values(x.record).forEach((v) => type(v, where));
    bad(where, `型ではないもの ${JSON.stringify(t)} があります`);
  };
  const params = (p: Record<string, Type>, where: string) => Object.entries(p).forEach(([k, t]) => (NAME.test(k) ? type(t, `${where}.${k}`) : bad(where, `引数の名前 ${JSON.stringify(k)}`)));
  const known = new Set(["external", "contains", "relies", "durable", "routes", "state", "init", "commands", "events", "queries", "conditions", "calcs", "decisions", "properties"]);
  for (const [id, c] of Object.entries(ir.components) as [string, ComponentIr][]) {
    for (const key of Object.keys(c)) if (!known.has(key)) bad(id, `知らない欄 "${key}" があります`);
    for (const [f, t] of Object.entries(c.state ?? {})) type(t, `${id}.state.${f}`);
    for (const [f, e] of Object.entries(c.init ?? {})) expr(e, `${id}.init.${f}`);
    for (const [n, command] of Object.entries(c.commands ?? {})) {
      params(command.params, `${id}.commands.${n}`);
      if (command.output) type(command.output, `${id}.commands.${n}.output`);
      if (command.requires !== undefined) expr(command.requires, `${id}.commands.${n}.requires`);
      for (const e of command.events) if (!c.events?.[e]) bad(`${id}.commands.${n}`, `イベント ${e} がありません`);
    }
    for (const [n, event] of Object.entries(c.events ?? {})) {
      const where = `${id}.events.${n}`;
      expr(event.guard, `${where}.guard`);
      for (const [f, e] of Object.entries(event.assign)) {
        if (!(f in (c.state ?? {}))) bad(where, `状態 ${f} がありません`);
        expr(e, `${where}.assign.${f}`);
      }
      for (const call of event.calls) {
        if (!ir.components[call.component]) bad(where, `部品 ${call.component} がありません`);
        Object.values(call.args).forEach((a) => expr(a, `${where}.calls`));
        if (call.when !== undefined) expr(call.when, `${where}.calls.when`);
      }
      if (event.output !== undefined) expr(event.output, `${where}.output`);
    }
    for (const [n, q] of Object.entries(c.queries ?? {})) {
      params(q.params, `${id}.queries.${n}`);
      type(q.result, `${id}.queries.${n}.result`);
      expr(q.is, `${id}.queries.${n}.is`);
    }
    for (const group of ["conditions", "calcs"] as const) for (const [n, x] of Object.entries(c[group] ?? {})) expr(x.is, `${id}.${group}.${n}`);
    for (const [n, d] of Object.entries(c.decisions ?? {})) for (const row of d.rows) (expr(row.when, `${id}.decisions.${n}`), Object.values(row.then).forEach((v) => expr(v, `${id}.decisions.${n}`)));
    for (const [n, p] of Object.entries(c.properties ?? {})) expr(p.is, `${id}.properties.${n}`);
  }
  return problems;
}

export type { Expr };
