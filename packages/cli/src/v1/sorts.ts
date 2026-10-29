// The sorts of a spec's values (DSL.md §17.20): values that meet (compared, computed together, assigned, passed as an
// argument, kept in the same field) are of one sort. Values of two sorts never meet, so each sort's numbers can be made
// to fit on their own: one sort may compute with small numbers while another only compares large ones.
//
// Unifying too much only makes a sort coarser (its numbers may then not be made to fit); unifying too little would be
// wrong, so an operation not known here unifies everything it touches.

import type { Ir8, Type } from "./ir.ts";
import type { Relevance } from "./abstraction.ts";

/** A value's shape: a sort, the fields of a record, the element of a collection (`#k` / `#v` for a map). */
type Val = { n: number; fields?: Map<string, Val>; elem?: Val };

const ARITHMETIC = new Set(["+", "-", "*", "div", "mod", "neg", "abs", "sum"]);

export type Sorts = {
  /** The sort of a literal number, by where it is written. */
  literal(holder: object, key: string | number): number | undefined;
  /** The sort of a place: `param:<id>.<command>.<p>` (`.<field>` for a record), `env:<id>.<port>`, `envkey:<id>.<port>`. */
  place(name: string): number | undefined;
  /** The sort of every string's length. */
  stringLength: number;
  /** Sorts the checks compute with. */
  arithmetic: Set<number>;
  /** Sorts that hold numbers (a number written, or a place of a numeric type). */
  numeric: Set<number>;
  /** Sorts of counts and lengths (Alloy gives them as integers). */
  counting: Set<number>;
  /** The sort of what a comparison, `min` or `max` compares (by the array it is written as). */
  compared(e: unknown[]): number | undefined;
  find(n: number): number;
};

export function sortsOf(ir: Ir8, relevance: Relevance): Sorts {
  const parent: number[] = [];
  const fresh = (): Val => {
    parent.push(parent.length);
    return { n: parent.length - 1 };
  };
  const find = (n: number): number => {
    while (parent[n] !== n) n = parent[n] = parent[parent[n]];
    return n;
  };
  const unify = (a: Val | undefined, b: Val | undefined): Val | undefined => {
    if (!a) return b;
    if (!b) return a;
    parent[find(a.n)] = find(b.n);
    if (a.fields || b.fields) {
      const fields = a.fields ?? b.fields!;
      for (const [k, v] of b.fields ?? []) fields.set(k, unify(fields.get(k), v)!);
      a.fields = b.fields = fields;
    }
    if (a.elem || b.elem) a.elem = b.elem = unify(a.elem, b.elem);
    return a;
  };
  const fieldOf = (v: Val, k: string): Val => {
    v.fields ??= new Map();
    if (!v.fields.has(k)) v.fields.set(k, fresh());
    return v.fields.get(k)!;
  };
  const elemOf = (v: Val): Val => (v.elem ??= fresh());

  const places = new Map<string, Val>();
  const place = (name: string, t?: Type): Val => {
    if (!places.has(name)) places.set(name, t ? ofType(t) : fresh());
    return places.get(name)!;
  };
  const numericNodes: number[] = [];
  const countingNodes: number[] = [];
  const comparisons = new Map<unknown[], Val>();
  const ofType = (t: Type): Val => {
    const v = fresh();
    if (t === "int" || (typeof t === "object" && "enum" in t && t.enum.every((x) => typeof x === "number"))) numericNodes.push(v.n);
    if (typeof t === "object") {
      if ("optional" in t) return ofType(t.optional);
      if ("record" in t) v.fields = new Map(Object.entries(t.record).map(([k, kt]) => [k, ofType(kt)]));
      if ("list" in t) v.elem = ofType(t.list);
      if ("set" in t) v.elem = ofType(t.set);
      if ("map" in t) v.fields = new Map([["#k", ofType(t.map[0])], ["#v", ofType(t.map[1])]]);
    }
    return v;
  };
  const stringLength = fresh();
  const stringLengthNode = stringLength.n;
  const literals = new WeakMap<object, Map<string | number, Val>>();
  const literalAt = (holder: object, key: string | number): Val => {
    if (!literals.has(holder)) literals.set(holder, new Map());
    const at = literals.get(holder)!;
    if (!at.has(key)) {
      const v = fresh();
      numericNodes.push(v.n);
      at.set(key, v);
    }
    return at.get(key)!;
  };
  const marked: Val[] = [];

  type Scope = { id: string; vars: Map<string, Val> };
  const memo = new Set<string>();
  const once = (key: string, then: () => void) => {
    if (memo.has(key)) return;
    memo.add(key);
    then();
  };
  // a value kept in an object
  const at = (holder: Record<string, unknown>, key: string, s: Scope): Val | undefined =>
    typeof holder[key] === "number" ? literalAt(holder, key) : of(holder[key], s);
  const bindParams = (prefix: string, params: Record<string, Type>, args: Record<string, unknown> | undefined, s: Scope) => {
    for (const [p, t] of Object.entries(params)) unify(place(`${prefix}.${p}`, t), args ? at(args as Record<string, unknown>, p, s) : undefined);
  };
  const scopeOf = (id: string, prefix: string, params: Record<string, Type>): Scope => ({ id, vars: new Map(Object.entries(params).map(([p, t]) => [p, place(`${prefix}.${p}`, t)])) });

  const counted = (): Val => {
    const v = fresh();
    countingNodes.push(v.n);
    return v;
  };
  const of = (e: unknown, s: Scope): Val | undefined => {
    if (typeof e === "number") {
      const v = fresh();
      numericNodes.push(v.n);
      return v;
    }
    if (!Array.isArray(e)) {
      if (e && typeof e === "object") {
        // a record written out
        const v = fresh();
        for (const k of Object.keys(e)) unify(fieldOf(v, k), at(e as Record<string, unknown>, k, s));
        return v;
      }
      return undefined;
    }
    const [op, ...a] = e as [string, ...unknown[]];
    const c = ir.components[s.id];
    const child = (i: number) => (typeof a[i] === "number" ? literalAt(e, i + 1) : of(a[i], s));
    const all = () => a.map((_, i) => child(i));
    const binding = (coll: unknown, binders: string[], body: unknown) => {
      const cv = of(coll, s) ?? fresh();
      const vars = new Map(s.vars);
      if (binders.length === 2 && cv.fields?.has("#k")) {
        vars.set(binders[0], fieldOf(cv, "#k"));
        vars.set(binders[1], fieldOf(cv, "#v"));
      } else vars.set(binders[0], elemOf(cv));
      return { cv, body: typeof body === "number" ? literalAt(e, 3) : of(body, { ...s, vars }) };
    };
    switch (op) {
      case "lit":
        return fresh();
      case "var":
        return s.vars.get(a[0] as string) ?? fresh();
      case "state":
        return place(`state:${s.id}.${a[0]}`, c.state?.[a[0] as string]);
      case "and":
      case "or":
      case "not":
      case "implies":
      case "always":
      case "eventually":
      case "after":
      case "once":
      case "historically":
      case "until":
        all();
        return fresh();
      case "=":
      case "<":
      case "<=":
      case ">":
      case ">=": {
        const v = unify(child(0), child(1));
        if (v) comparisons.set(e, v);
        return fresh();
      }
      case "ite": {
        child(0);
        return unify(child(1), child(2));
      }
      case "??":
      case "min":
      case "max":
      case "+":
      case "-":
      case "*":
      case "div":
      case "mod":
      case "neg":
      case "abs":
      case "nonNull": {
        const v = all().reduce<Val | undefined>((x, y) => unify(x, y), undefined) ?? fresh();
        if (ARITHMETIC.has(op) && relevance.arithmeticAt.has(e)) marked.push(v);
        if (op === "min" || op === "max") comparisons.set(e, v);
        return v;
      }
      case "record":
        return of(a[0], s);
      case "field": {
        const inner = a[0];
        if (Array.isArray(inner) && inner[0] === "decide") {
          const [, name, args] = inner as [string, string, Record<string, unknown>];
          const table = c.decisions?.[name];
          if (!table) return fresh();
          bindParams(`dparam:${s.id}.${name}`, table.params, args, s);
          const inside = scopeOf(s.id, `dparam:${s.id}.${name}`, table.params);
          const cell = place(`cell:${s.id}.${name}.${a[1]}`);
          once(`decide:${s.id}.${name}`, () => table.rows.forEach((row) => of(row.when, inside)));
          once(`cell:${s.id}.${name}.${a[1]}`, () => table.rows.forEach((row) => unify(cell, at(row.then, a[1] as string, inside))));
          return cell;
        }
        return fieldOf(of(inner, s) ?? fresh(), a[1] as string);
      }
      case "with": {
        const v = of(a[0], s) ?? fresh();
        for (const k of Object.keys(a[1] as object)) unify(fieldOf(v, k), at(a[1] as Record<string, unknown>, k, s));
        return v;
      }
      case "list":
      case "set": {
        const v = fresh();
        a.forEach((_, i) => unify(elemOf(v), child(i)));
        return v;
      }
      case "concat":
      case "add":
      case "remove":
      case "join": {
        const vs = all();
        if (op === "concat") return vs.reduce<Val | undefined>((x, y) => unify(x, y), undefined) ?? fresh();
        if (op === "join") return fresh();
        unify(elemOf(vs[0] ?? fresh()), vs[1]);
        return vs[0];
      }
      case "in": {
        const [x, coll] = [child(0), child(1)];
        unify(x, elemOf(coll ?? fresh()));
        return fresh();
      }
      case "filter":
        return binding(a[0], a[1] as string[], a[2]).cv;
      case "find":
        return elemOf(binding(a[0], a[1] as string[], a[2]).cv);
      case "some":
      case "every":
        binding(a[0], a[1] as string[], a[2]);
        return fresh();
      case "count":
        binding(a[0], a[1] as string[], a[2]);
        return counted();
      case "map": {
        const { body } = binding(a[0], a[1] as string[], a[2]);
        const v = fresh();
        unify(elemOf(v), body);
        return v;
      }
      case "sum": {
        const { body } = binding(a[0], a[1] as string[], a[2]);
        if (relevance.arithmeticAt.has(e) && body) marked.push(body);
        return body ?? fresh();
      }
      case "len":
      case "card":
        all();
        return counted();
      case "strlen":
        all();
        return { n: stringLength.n };
      case "dom": {
        const m = child(0) ?? fresh();
        const v = fresh();
        unify(elemOf(v), fieldOf(m, "#k"));
        return v;
      }
      case "ran": {
        const m = child(0) ?? fresh();
        const v = fresh();
        unify(elemOf(v), fieldOf(m, "#v"));
        return v;
      }
      case "apply": {
        const m = child(0) ?? fresh();
        unify(fieldOf(m, "#k"), child(1));
        return fieldOf(m, "#v");
      }
      case "override": {
        const m = child(0) ?? fresh();
        unify(fieldOf(m, "#k"), child(1));
        unify(fieldOf(m, "#v"), child(2));
        return m;
      }
      case "dsub": {
        const m = child(0) ?? fresh();
        unify(fieldOf(m, "#k"), child(1));
        return m;
      }
      case "emptySet":
      case "emptyMap":
        return fresh();
      case "cond":
      case "calc": {
        const [name, args] = a as [string, Record<string, unknown>];
        const named = op === "cond" ? c.conditions?.[name] : c.calcs?.[name];
        if (!named) return fresh();
        const prefix = `${op}:${s.id}.${name}`;
        bindParams(prefix, named.params, args, s);
        const result = place(`${prefix}#`);
        once(prefix, () => unify(result, at(named as unknown as Record<string, unknown>, "is", scopeOf(s.id, prefix, named.params))));
        return result;
      }
      case "ask": {
        const [id, port, args] = a as [string, string, Record<string, unknown>];
        const target = ir.components[id];
        if (target?.external) {
          const q = target.external.queries[port];
          if (!q) return fresh();
          bindParams(`envp:${id}.${port}`, q.params, args, s);
          if (Object.keys(q.params).length === 1) unify(place(`envkey:${id}.${port}`), place(`envp:${id}.${port}.${Object.keys(q.params)[0]}`));
          return place(`env:${id}.${port}`, q.result);
        }
        const q = target?.queries?.[port];
        if (!q) return fresh();
        bindParams(`qparam:${id}.${port}`, q.params, args, s);
        const result = place(`query:${id}.${port}`, q.result);
        once(`query:${id}.${port}`, () => unify(result, at(q as unknown as Record<string, unknown>, "is", scopeOf(id, `qparam:${id}.${port}`, q.params))));
        return result;
      }
      case "outputOf": {
        const [id, command, args] = a as [string, string, Record<string, unknown>];
        const def = ir.components[id]?.commands?.[command];
        if (def) bindParams(`param:${id}.${command}`, def.params, args, s);
        return place(`out:${id}.${command}`, def?.output);
      }
      case "failed":
        child(0);
        return fresh();
      case "on": {
        const [command, binds, body] = a as [string, Record<string, string>, unknown];
        const def = c.commands?.[command];
        const vars = new Map(s.vars);
        for (const [p, name] of Object.entries(binds)) vars.set(name, place(`param:${s.id}.${command}.${p}`, def?.params[p]));
        of(body, { ...s, vars });
        return fresh();
      }
      default: {
        // not known here: everything it touches is one sort
        return all().reduce<Val | undefined>((x, y) => unify(x, y), undefined) ?? fresh();
      }
    }
  };

  for (const [id, c] of Object.entries(ir.components)) {
    if (c.external) {
      for (const [port, q] of Object.entries(c.external.queries)) {
        place(`env:${id}.${port}`, q.result);
        for (const [p, t] of Object.entries(q.params)) place(`envp:${id}.${port}.${p}`, t);
      }
      continue;
    }
    for (const [f, t] of Object.entries(c.state ?? {})) {
      const v = place(`state:${id}.${f}`, t);
      if (c.init && f in c.init) unify(v, at(c.init as Record<string, unknown>, f, { id, vars: new Map() }));
    }
    for (const property of Object.values(c.properties ?? {})) of(property.is, { id, vars: new Map() });
    for (const [name, def] of Object.entries(c.commands ?? {})) {
      const s = scopeOf(id, `param:${id}.${name}`, def.params);
      of(def.requires, s);
      const out = place(`out:${id}.${name}`, def.output);
      for (const e of def.events) {
        const event = c.events![e];
        of(event.guard, s);
        for (const f of Object.keys(event.assign)) unify(place(`state:${id}.${f}`, c.state?.[f]), at(event.assign, f, s));
        if (event.output !== undefined) unify(out, at(event as unknown as Record<string, unknown>, "output", s));
        for (const call of event.calls) {
          of(call.when, s);
          const target = ir.components[call.component];
          const params = target?.external ? target.external.commands[call.command]?.params : target?.commands?.[call.command]?.params;
          bindParams(target?.external ? `ext:${call.component}.${call.command}` : `param:${call.component}.${call.command}`, params ?? {}, call.args, s);
        }
      }
    }
    for (const [name, q] of Object.entries(c.queries ?? {})) {
      const s = scopeOf(id, `qparam:${id}.${name}`, q.params);
      of(q.requires, s);
      unify(place(`query:${id}.${name}`, q.result), at(q as unknown as Record<string, unknown>, "is", s));
    }
  }

  const arithmetic = new Set(marked.map((v) => find(v.n)));
  const numeric = new Set(numericNodes.map(find));
  const counting = new Set([...countingNodes, stringLengthNode].map(find));
  return {
    literal: (holder, key) => {
      const v = literals.get(holder)?.get(key);
      return v === undefined ? undefined : find(v.n);
    },
    // a place, or a part of one: a field (`param:<id>.<command>.<p>.<field>`), the element of a collection (`.#elem`), a key or value of a map (`.#k`, `.#v`)
    place: (name) => {
      const lookup = (n: string): Val | undefined => {
        const known = places.get(n);
        if (known) return known;
        const dot = n.lastIndexOf(".");
        if (dot <= 0) return undefined;
        const base = lookup(n.slice(0, dot));
        const part = n.slice(dot + 1);
        return part === "#elem" ? base?.elem : base?.fields?.get(part);
      };
      const v = lookup(name);
      return v === undefined ? undefined : find(v.n);
    },
    stringLength: find(stringLength.n),
    arithmetic,
    numeric,
    counting,
    compared: (e) => {
      const v = comparisons.get(e);
      return v === undefined ? undefined : find(v.n);
    },
    find,
  };
}

