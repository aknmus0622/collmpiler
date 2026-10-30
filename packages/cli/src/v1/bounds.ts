// The ranges of a spec's numbers (DSL.md §17.21, removing Int, step 1): an abstract interpretation over intervals.
//
// Alloy looks at traces of at most `steps` transitions, so a value it can meet is one reachable in that many steps. The
// state's ranges are computed step by step from the initial values (no widening is needed: the iteration stops after
// `steps` rounds, and every round keeps what the rounds before found), the inputs' from their types and what `requires`
// says, the outside world's from its types. Conditions narrow what they test: the branches of an `ite`, an event's
// guard, a command's `requires`, the `when` of a call. A part's command called in a step gets the ranges of the
// arguments it is called with; one round of the iteration passes them on, so the iteration runs as many more rounds as
// there are components.
//
// Over-approximation is what makes it safe: an interval may hold values never reached, never miss one that is. The
// ranges are compared with what running the spec gives (alloy.test.ts).

import type { ComponentIr, Ir8, Type } from "./ir.ts";
import { isElapsed } from "./clock.ts";

/** A range of integers, its ends included (`-Infinity` / `Infinity`: no end). */
export type Interval = readonly [number, number];
export const TOP: Interval = [-Infinity, Infinity];

export const joinI = (a: Interval | undefined, b: Interval | undefined): Interval | undefined => (!a ? b : !b ? a : [Math.min(a[0], b[0]), Math.max(a[1], b[1])]);
const meetI = (a: Interval, b: Interval): Interval | undefined => {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : undefined;
};

/** An abstract value: the range of a number, and the parts of a record (`#k` / `#v` for a map) or a collection's element. */
type AV = { n?: Interval; f?: Map<string, AV>; e?: AV };

const joinAV = (a: AV | undefined, b: AV | undefined): AV | undefined => {
  if (!a) return b;
  if (!b) return a;
  const out: AV = {};
  const n = joinI(a.n, b.n);
  if (n) out.n = n;
  if (a.f || b.f) {
    out.f = new Map(a.f ?? []);
    for (const [k, v] of b.f ?? []) out.f.set(k, joinAV(out.f.get(k), v)!);
  }
  const e = joinAV(a.e, b.e);
  if (e) out.e = e;
  return out;
};
const sameAV = (a: AV | undefined, b: AV | undefined): boolean => {
  if (!a || !b) return a === b;
  if (a.n?.[0] !== b.n?.[0] || a.n?.[1] !== b.n?.[1]) return false;
  if ((a.f?.size ?? 0) !== (b.f?.size ?? 0)) return false;
  for (const [k, v] of a.f ?? []) if (!sameAV(v, b.f?.get(k))) return false;
  return sameAV(a.e, b.e);
};

/** What a value of a type can be, knowing nothing more. */
export function ofType(t: Type): AV {
  if (t === "int") return { n: TOP };
  if (typeof t !== "object") return {};
  if ("optional" in t) return ofType(t.optional);
  if ("enum" in t) {
    const ns = t.enum.filter((v): v is number => typeof v === "number");
    return ns.length ? { n: [Math.min(...ns), Math.max(...ns)] } : {};
  }
  if ("record" in t) return { f: new Map(Object.entries(t.record).map(([k, kt]) => [k, ofType(kt)])) };
  if ("list" in t) return { e: ofType(t.list) };
  if ("set" in t) return { e: ofType(t.set) };
  if ("map" in t) return { f: new Map([["#k", ofType(t.map[0])], ["#v", ofType(t.map[1])]]) };
  return {};
}

export type Bounds = {
  /**
   * The range of a place: `state:<id>.<field>`, `param:<id>.<command>.<p>`, `qparam:<id>.<query>.<p>`, `env:<id>.<port>`
   * (`.<field>`, `.#elem`, `.#k`, `.#v` for its parts). Undefined: not a number, or never given a value.
   */
  place(name: string): Interval | undefined;
  /** The range of every value an expression took, by the array it is written as (undefined: never evaluated, or not a number). */
  node(e: object): Interval | undefined;
};

type Env = { id: string; vars: Map<string, AV>; state: Map<string, AV> };

/** The ranges, for traces of at most `steps` transitions. */
export function boundsOf(ir: Ir8, steps: number): Bounds {
  const internal = Object.entries(ir.components).filter(([, c]) => !c.external);
  const nodes = new WeakMap<object, Interval>();
  const record = (e: object, v: AV | undefined) => {
    if (v?.n) nodes.set(e, joinI(nodes.get(e), v.n)!);
  };
  let world = new Map<string, Map<string, AV>>();
  const entryCommands = new Set(ir.entries.commands);
  const qualified = (id: string, name: string) => (id === ir.root ? name : `${id}.${name}`);
  /** The parameters of a part's command: what it was called with (an entry: anything its types allow). */
  const called = new Map<string, Map<string, AV>>();
  const paramsOf = (id: string, name: string, params: Record<string, Type>): Map<string, AV> => {
    const entry = entryCommands.has(qualified(id, name)) || entryCommands.has(`${id}.${name}`);
    const given = called.get(`${id}.${name}`);
    return new Map(Object.entries(params).map(([p, t]) => [p, entry ? ofType(t) : (given?.get(p) ?? {})]));
  };
  const places = new Map<string, AV>();
  const note = (name: string, v: AV | undefined) => {
    if (v) places.set(name, joinAV(places.get(name), v)!);
  };
  const depth = { n: 0 };

  // a value with no range holds no number (null, or nothing reached yet): what is computed from it is not reached either
  const num = (v: AV | undefined): Interval | undefined => v?.n;
  const lift = (f: (...xs: Interval[]) => Interval, ...xs: (Interval | undefined)[]): AV | undefined => (xs.every((x) => x) ? { n: f(...(xs as Interval[])) } : undefined);
  const arith = (op: string, a: Interval, b: Interval): Interval => {
    switch (op) {
      case "+":
        return [a[0] + b[0], a[1] + b[1]];
      case "-":
        return [a[0] - b[1], a[1] - b[0]];
      case "*": {
        const ps = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]].map((x) => (Number.isNaN(x) ? 0 : x));
        return [Math.min(...ps), Math.max(...ps)];
      }
      case "div": {
        if (b[0] <= 0 && b[1] >= 0) return TOP;
        const ps = [a[0] / b[0], a[0] / b[1], a[1] / b[0], a[1] / b[1]].map((x) => (Number.isNaN(x) ? 0 : Math.floor(x)));
        return [Math.min(...ps), Math.max(...ps)];
      }
      case "mod": {
        // JavaScript's remainder: the sign of the dividend, smaller than the divisor
        const m = Math.max(Math.abs(b[0]), Math.abs(b[1])) - 1;
        return [a[0] >= 0 ? 0 : -m, a[1] <= 0 ? 0 : m];
      }
      case "min":
        return [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
      case "max":
        return [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
    }
    return TOP;
  };

  // --- narrowing by a condition ---
  const pathOf = (x: unknown): string[] | undefined => {
    if (!Array.isArray(x)) return undefined;
    if (x[0] === "var" || x[0] === "state") return [x[0], x[1] as string];
    if (x[0] === "nonNull") return pathOf(x[1]);
    if (x[0] === "field" && !(Array.isArray(x[1]) && x[1][0] === "decide")) {
      const inner = pathOf(x[1]);
      return inner ? [...inner, x[2] as string] : undefined;
    }
    return undefined;
  };
  const getPath = (env: Env, path: string[]): AV | undefined => {
    let v = path[0] === "var" ? env.vars.get(path[1]) : env.state.get(path[1]);
    for (const k of path.slice(2)) v = v?.f?.get(k);
    return v;
  };
  const setPath = (env: Env, path: string[], n: Interval): Env => {
    const put = (v: AV | undefined, rest: string[]): AV => {
      if (rest.length === 0) return { ...(v ?? {}), n };
      const f = new Map(v?.f ?? []);
      f.set(rest[0], put(f.get(rest[0]), rest.slice(1)));
      return { ...(v ?? {}), f };
    };
    const top = path[0] === "var" ? new Map(env.vars) : new Map(env.state);
    top.set(path[1], put(top.get(path[1]), path.slice(2)));
    return path[0] === "var" ? { ...env, vars: top } : { ...env, state: top };
  };
  const joinEnv = (a: Env | undefined, b: Env | undefined): Env | undefined => {
    if (!a) return b;
    if (!b) return a;
    const merge = (x: Map<string, AV>, y: Map<string, AV>) => new Map([...new Set([...x.keys(), ...y.keys()])].map((k) => [k, joinAV(x.get(k), y.get(k)) ?? {}]));
    return { id: a.id, vars: merge(a.vars, b.vars), state: merge(a.state, b.state) };
  };
  const FLIP: Record<string, string> = { "<": ">=", "<=": ">", ">": "<=", ">=": "<" };
  /** The environment where `cond` is `truth` (undefined: it never is). */
  const refine = (env: Env | undefined, cond: unknown, truth: boolean): Env | undefined => {
    if (!env) return undefined;
    if (cond === undefined || cond === null) return env;
    if (typeof cond === "boolean") return cond === truth ? env : undefined;
    if (!Array.isArray(cond)) return env;
    const [op, ...a] = cond as [string, ...unknown[]];
    if (op === "not") return refine(env, a[0], !truth);
    if ((op === "and" && truth) || (op === "or" && !truth)) return a.reduce<Env | undefined>((e, x) => refine(e, x, truth), env);
    if (op === "and" || op === "or") return a.reduce<Env | undefined>((e, x) => joinEnv(e, refine(env, x, truth)), undefined);
    if (op === "implies") return refine(env, ["or", ["not", a[0]], a[1]], truth);
    if (op === "=" && truth) return narrow(env, a[0], a[1], "=");
    if (op in FLIP) return narrow(env, a[0], a[1], truth ? op : FLIP[op]);
    return env;
  };
  const narrow = (env: Env, x: unknown, y: unknown, op: string): Env | undefined => {
    const X = num(evalE(x, env));
    const Y = num(evalE(y, env));
    if (!X || !Y) return env;
    let nx: Interval | undefined = X;
    let ny: Interval | undefined = Y;
    if (op === "=") nx = ny = meetI(X, Y);
    if (op === "<") [nx, ny] = [meetI(X, [-Infinity, Y[1] - 1]), meetI(Y, [X[0] + 1, Infinity])];
    if (op === "<=") [nx, ny] = [meetI(X, [-Infinity, Y[1]]), meetI(Y, [X[0], Infinity])];
    if (op === ">") [nx, ny] = [meetI(X, [Y[0] + 1, Infinity]), meetI(Y, [-Infinity, X[1] - 1])];
    if (op === ">=") [nx, ny] = [meetI(X, [Y[0], Infinity]), meetI(Y, [-Infinity, X[1]])];
    if (!nx || !ny) return undefined;
    let out = env;
    const px = pathOf(x);
    const py = pathOf(y);
    if (px && getPath(env, px)?.n) out = setPath(out, px, nx);
    if (py && getPath(env, py)?.n) out = setPath(out, py, ny);
    return out;
  };

  // --- evaluation ---
  const bindAll = (env: Env, params: Record<string, Type>, args: Record<string, unknown> | undefined): Map<string, AV> =>
    new Map(Object.keys(params).map((p) => [p, args ? (typeof args[p] === "number" ? { n: [args[p] as number, args[p] as number] } : (evalE(args[p], env) ?? {})) : ofType(params[p])]));
  const binders = (coll: AV | undefined, names: string[], env: Env): Env => {
    const vars = new Map(env.vars);
    if (names.length === 2) {
      vars.set(names[0], coll?.f?.get("#k") ?? {});
      vars.set(names[1], coll?.f?.get("#v") ?? {});
    } else vars.set(names[0], coll?.e ?? coll?.f?.get("#k") ?? {});
    return { ...env, vars };
  };
  const inComponent = (id: string, vars: Map<string, AV>): Env => ({ id, vars, state: world.get(id) ?? new Map() });

  const evalE = (e: unknown, env: Env): AV | undefined => {
    if (typeof e === "number") return { n: [e, e] };
    if (!Array.isArray(e)) {
      if (e && typeof e === "object") return { f: new Map(Object.entries(e).map(([k, v]) => [k, evalE(v, env) ?? {}])) };
      return undefined;
    }
    const v = evalOp(e, env);
    record(e, v);
    return v;
  };
  const evalOp = (e: unknown[], env: Env): AV | undefined => {
    const [op, ...a] = e as [string, ...unknown[]];
    const c: ComponentIr | undefined = ir.components[env.id];
    const ev = (x: unknown, at = env) => evalE(x, at);
    switch (op) {
      case "lit":
        return undefined;
      case "var":
        return env.vars.get(a[0] as string);
      case "state":
        return env.state.get(a[0] as string);
      case "+":
      case "-":
      case "*":
      case "div":
      case "mod":
      case "min":
      case "max":
        return lift((x, y) => arith(op, x, y), num(ev(a[0])), num(ev(a[1])));
      case "neg":
        return lift((x) => [-x[1], -x[0]], num(ev(a[0])));
      case "abs":
        return lift((x) => (x[0] >= 0 ? x : x[1] <= 0 ? [-x[1], -x[0]] : [0, Math.max(-x[0], x[1])]), num(ev(a[0])));
      case "at":
        ev(a[1]);
        return ev(a[0])?.e;
      case "ite": {
        ev(a[0]);
        const yes = refine(env, a[0], true);
        const no = refine(env, a[0], false);
        return joinAV(yes ? ev(a[1], yes) : undefined, no ? ev(a[2], no) : undefined);
      }
      case "??":
        return joinAV(ev(a[0]), ev(a[1]));
      case "nonNull":
        return ev(a[0]);
      case "len":
      case "card":
      case "count":
      case "strlen":
        a.forEach((x) => (Array.isArray(x) ? ev(x) : undefined));
        if (op === "count") ev(a[2], binders(ev(a[0]), a[1] as string[], env));
        return { n: [0, Infinity] };
      case "sum": {
        const coll = ev(a[0]);
        const body = num(ev(a[2], binders(coll, a[1] as string[], env)));
        return { n: body ? [body[0] >= 0 ? 0 : -Infinity, body[1] <= 0 ? 0 : Infinity] : [0, 0] };
      }
      case "record":
        return ev(a[0]);
      case "field": {
        const inner = a[0];
        if (Array.isArray(inner) && inner[0] === "decide") {
          const [, name, args] = inner as [string, string, Record<string, unknown>];
          const table = c?.decisions?.[name];
          if (!table) return undefined;
          const inside: Env = { ...env, vars: bindAll(env, table.params, args) };
          let out: AV | undefined;
          for (const row of table.rows) {
            const at = refine(inside, row.when, true);
            if (at) out = joinAV(out, ev(row.then[a[1] as string], at));
          }
          return out;
        }
        return ev(inner)?.f?.get(a[1] as string);
      }
      case "with": {
        const base = ev(a[0]);
        const f = new Map(base?.f ?? []);
        for (const [k, x] of Object.entries(a[1] as Record<string, unknown>)) f.set(k, ev(x) ?? {});
        return { ...(base ?? {}), f };
      }
      case "list":
      case "set": {
        let elem: AV | undefined;
        for (const x of a) elem = joinAV(elem, ev(x) ?? {});
        return elem ? { e: elem } : {};
      }
      case "concat":
        return joinAV(ev(a[0]), ev(a[1]));
      case "add": {
        const s = ev(a[0]);
        return { ...(s ?? {}), e: joinAV(s?.e, ev(a[1]) ?? {}) };
      }
      case "remove":
        ev(a[1]);
        return ev(a[0]);
      case "dom": {
        const m = ev(a[0]);
        return { e: m?.f?.get("#k") ?? {} };
      }
      case "ran": {
        const m = ev(a[0]);
        return { e: m?.f?.get("#v") ?? {} };
      }
      case "apply":
        ev(a[1]);
        return ev(a[0])?.f?.get("#v");
      case "override": {
        const m = ev(a[0]);
        const f = new Map(m?.f ?? []);
        f.set("#k", joinAV(f.get("#k"), ev(a[1]) ?? {})!);
        f.set("#v", joinAV(f.get("#v"), ev(a[2]) ?? {})!);
        return { ...(m ?? {}), f };
      }
      case "dsub":
        ev(a[1]);
        return ev(a[0]);
      case "emptySet":
      case "emptyMap":
        return {};
      case "mapv": {
        const m = ev(a[0]);
        const vars = new Map(env.vars);
        vars.set(a[1] as string, m?.f?.get("#v") ?? {});
        const f = new Map(m?.f ?? []);
        f.set("#v", ev(a[2], { ...env, vars }) ?? {});
        return { ...(m ?? {}), f };
      }
      case "filter": {
        const coll = ev(a[0]);
        ev(a[2], binders(coll, a[1] as string[], env));
        return coll;
      }
      case "find": {
        const coll = ev(a[0]);
        ev(a[2], binders(coll, a[1] as string[], env));
        return coll?.e ?? coll?.f?.get("#k");
      }
      case "map": {
        const coll = ev(a[0]);
        return { e: ev(a[2], binders(coll, a[1] as string[], env)) ?? {} };
      }
      case "some":
      case "every":
        ev(a[2], binders(ev(a[0]), a[1] as string[], env));
        return undefined;
      case "cond":
      case "calc": {
        const [name, args] = a as [string, Record<string, unknown>];
        const named = op === "cond" ? c?.conditions?.[name] : c?.calcs?.[name];
        if (!named) return undefined;
        if (depth.n > 40) return op === "calc" ? ofType((named as unknown as { result: Type }).result) : undefined;
        depth.n++;
        try {
          return ev(named.is, { ...env, vars: bindAll(env, named.params, args) });
        } finally {
          depth.n--;
        }
      }
      case "ask": {
        const [id, port, args] = a as [string, string, Record<string, unknown>];
        const target = ir.components[id];
        if (target?.external) {
          const q = target.external.queries[port];
          if (!q) return undefined;
          for (const x of Object.values(args ?? {})) ev(x);
          return isElapsed(q) ? { n: [0, Infinity] } : ofType(q.result);
        }
        const q = target?.queries?.[port];
        if (!q) return undefined;
        if (depth.n > 40) return ofType(q.result);
        depth.n++;
        try {
          const inside = refine(inComponent(id, bindAll(env, q.params, args)), q.requires, true);
          return inside ? ev(q.is, inside) : undefined;
        } finally {
          depth.n--;
        }
      }
      case "outputOf": {
        const [id, command, args] = a as [string, string, Record<string, unknown>];
        const target = ir.components[id];
        const def = target?.commands?.[command];
        if (!def) return undefined;
        if (depth.n > 40) return def.output ? ofType(def.output) : undefined;
        depth.n++;
        try {
          let out: AV | undefined;
          const inside = refine(inComponent(id, bindAll(env, def.params, args)), def.requires, true);
          for (const name of def.events) {
            const event = target.events![name];
            const at = refine(inside, event.guard, true);
            if (at && event.output !== undefined) out = joinAV(out, ev(event.output, at));
          }
          return out;
        } finally {
          depth.n--;
        }
      }
      case "on": {
        const [command, binds, body] = a as [string, Record<string, string>, unknown];
        const def = c?.commands?.[command];
        const vars = new Map(env.vars);
        for (const [p, name] of Object.entries(binds)) vars.set(name, def ? ofType(def.params[p]) : {});
        ev(body, { ...env, vars });
        return undefined;
      }
      default:
        for (const x of a) if (Array.isArray(x)) ev(x);
        return undefined;
    }
  };

  // --- the iteration ---
  for (const [id, c] of internal) {
    const s = new Map<string, AV>();
    for (const [f, t] of Object.entries(c.state ?? {})) s.set(f, c.init && f in c.init ? (evalE(c.init[f], { id, vars: new Map(), state: new Map() }) ?? {}) : ofType(t));
    world.set(id, s);
  }
  const rounds = steps + internal.length;
  for (let round = 0; round < rounds; round++) {
    const next = new Map([...world].map(([id, s]) => [id, new Map(s)]));
    const calls = new Map<string, Map<string, AV>>();
    for (const [id, c] of internal) {
      for (const [name, def] of Object.entries(c.commands ?? {})) {
        const params = paramsOf(id, name, def.params);
        const start = refine(inComponent(id, params), def.requires, true);
        for (const eventName of def.events) {
          const event = c.events![eventName];
          const env = refine(start, event.guard, true);
          if (!env) continue;
          for (const [p] of Object.entries(def.params)) note(`param:${id}.${name}.${p}`, env.vars.get(p));
          for (const [f, x] of Object.entries(event.assign)) {
            const v = typeof x === "number" ? { n: [x, x] as Interval } : (evalE(x, env) ?? {});
            next.get(id)!.set(f, joinAV(next.get(id)!.get(f), v)!);
          }
          if (event.output !== undefined) evalE(event.output, env);
          for (const call of event.calls) {
            const at = refine(env, call.when, true);
            if (!at) continue;
            const target = ir.components[call.component];
            const callee = target?.external ? target.external.commands[call.command] : target?.commands?.[call.command];
            if (!callee) continue;
            const args = bindAll(at, callee.params, call.args);
            if (target?.external) {
              for (const [p, v] of args) note(`ext:${call.component}.${call.command}.${p}`, v);
              continue;
            }
            const key = `${call.component}.${call.command}`;
            const got = calls.get(key) ?? new Map<string, AV>();
            for (const [p, v] of args) got.set(p, joinAV(got.get(p), v)!);
            calls.set(key, got);
          }
        }
      }
    }
    // events of no command: they happen at every step (clock.ts: the times of the state moving with the clock)
    for (const [id, c] of internal) {
      const inCommands = new Set(Object.values(c.commands ?? {}).flatMap((def) => def.events));
      for (const [name, event] of Object.entries(c.events ?? {})) {
        if (inCommands.has(name)) continue;
        const env = inComponent(id, new Map());
        for (const [f, x] of Object.entries(event.assign)) next.get(id)!.set(f, joinAV(next.get(id)!.get(f), evalE(x, env) ?? {})!);
      }
    }
    // a part's command gets what it was called with, from this round on (and keeps what it got before)
    let changed = false;
    for (const [key, got] of calls) {
      const before = called.get(key) ?? new Map<string, AV>();
      const merged = new Map(before);
      for (const [p, v] of got) merged.set(p, joinAV(merged.get(p), v)!);
      if ([...merged].some(([p, v]) => !sameAV(v, before.get(p)))) changed = true;
      called.set(key, merged);
    }
    if (![...next].some(([id, s]) => [...s].some(([f, v]) => !sameAV(v, world.get(id)!.get(f))))) {
      world = next;
      if (!changed) break;
      continue;
    }
    world = next;
  }
  // the values everything else reads, in the states found: queries, properties, and once more the events
  for (const [id, c] of internal) {
    for (const [f, v] of world.get(id)!) note(`state:${id}.${f}`, v);
    for (const p of Object.values(c.properties ?? {})) evalE(p.is, inComponent(id, new Map()));
    for (const [name, q] of Object.entries(c.queries ?? {})) {
      const env = refine(inComponent(id, bindAll(inComponent(id, new Map()), q.params, undefined)), q.requires, true);
      if (!env) continue;
      for (const p of Object.keys(q.params)) note(`qparam:${id}.${name}.${p}`, env.vars.get(p));
      evalE(q.is, env);
    }
  }
  for (const [id, c] of Object.entries(ir.components)) {
    for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
      note(`env:${id}.${port}`, isElapsed(q) ? { n: [0, Infinity] } : ofType(q.result));
      for (const [p, t] of Object.entries(q.params)) note(`envp:${id}.${port}.${p}`, ofType(t));
    }
  }

  return {
    place(name) {
      const lookup = (n: string): AV | undefined => {
        if (places.has(n)) return places.get(n);
        const dot = n.lastIndexOf(".");
        if (dot <= 0) return undefined;
        const base = lookup(n.slice(0, dot));
        const part = n.slice(dot + 1);
        return part === "#elem" ? (base?.e ?? base?.f?.get("#k")) : base?.f?.get(part);
      };
      return lookup(name)?.n;
    },
    node: (e) => nodes.get(e),
  };
}
