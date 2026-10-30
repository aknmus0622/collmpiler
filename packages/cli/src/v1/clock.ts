// Time read from a clock of the outside world, as how far it is from now (DSL.md §17.21, removing Int, step 2).
//
// A clock that only promises to increase (`answer({ increasing: true })`) gives numbers with no bound: a due date is
// "today + 14", and the clock may jump by any number of days. What the checks look at is only how times compare and how
// far apart they are, so each time is kept as its distance from now (an offset, as the regions of timed automata do):
// reading the clock is 0, a time remembered is what it was minus how far the clock moved since. Every step (an event or
// none) the clock moves by some `tick` of at least 0, and every remembered time moves by the same tick: the times keep
// their order and their distances, which is exactly what the spec can see. The offsets are then numbers like any other
// (classes.ts makes them classes).
//
// It applies only when the clock's times are used as times: compared with each other, moved by a duration
// (`t + d`, `t - d`), subtracted (`t1 - t2`, a duration), kept in a field or as the values of a map. A time compared with
// a number written, given to a command, answered, or computed with otherwise leaves the spec as it is.

import type { ComponentIr, Expr, Ir8, Type } from "./ir.ts";

/** The clock the times were read from, and the synthetic query of the outside world for how far it moves in a step. */
export type Aging = { clock: string; tick: string; fields: string[] };
/** The event (in no command) each component with times in its state ages them by: one assignment per field. */
export const AGE_EVENT = "__age";
const TICK = "__tick";

class NotTime extends Error {}

type Kind = "plain" | "time" | "times";

export function relativeTime(ir: Ir8): { ir: Ir8; aging?: Aging } {
  const clocks: [string, string][] = [];
  for (const [id, c] of Object.entries(ir.components)) {
    for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
      if (q.promise === "increasing" && Object.keys(q.params).length === 0 && q.result === "int") clocks.push([id, port]);
    }
  }
  if (clocks.length !== 1) return { ir };
  const [clockId, clockPort] = clocks[0];
  const internal = Object.entries(ir.components).filter(([, c]) => !c.external);

  // the fields that hold times: numbers, or maps whose values are numbers, every value written to them a time
  const candidates = new Map<string, "time" | "times">();
  for (const [id, c] of internal) {
    for (const [f, t] of Object.entries(c.state ?? {})) {
      if (t === "int") candidates.set(`${id}.${f}`, "time");
      if (typeof t === "object" && "map" in t && t.map[1] === "int") candidates.set(`${id}.${f}`, "times");
    }
  }
  const kindOf = (e: unknown, id: string, fields: Map<string, "time" | "times">): Kind => {
    if (!Array.isArray(e)) {
      if (e && typeof e === "object") for (const v of Object.values(e)) plain(v, id, fields);
      return "plain";
    }
    const [op, ...a] = e as [string, ...unknown[]];
    const k = (x: unknown) => kindOf(x, id, fields);
    switch (op) {
      case "lit":
        return "plain";
      case "ask":
        if (a[0] === clockId && a[1] === clockPort) return "time";
        plain(a[2], id, fields);
        return "plain";
      case "state":
        return fields.get(`${id}.${a[0]}`) ?? "plain";
      case "apply": {
        const m = k(a[0]);
        plain(a[1], id, fields);
        if (m === "times") return "time";
        if (m === "time") throw new NotTime();
        return "plain";
      }
      case "nonNull":
        return k(a[0]);
      case "+": {
        const [x, y] = [k(a[0]), k(a[1])];
        if (x === "times" || y === "times" || (x === "time" && y === "time")) throw new NotTime();
        return x === "time" || y === "time" ? "time" : "plain";
      }
      case "-": {
        const [x, y] = [k(a[0]), k(a[1])];
        if (x === "times" || y === "times" || (x === "plain" && y === "time")) throw new NotTime();
        return x === "time" && y === "plain" ? "time" : "plain";
      }
      case "=":
      case "<":
      case "<=":
      case ">":
      case ">=": {
        const [x, y] = [k(a[0]), k(a[1])];
        if (x !== y && (x !== "plain" || y !== "plain")) throw new NotTime();
        if (x === "times") throw new NotTime();
        return "plain";
      }
      case "ite": {
        plain(a[0], id, fields);
        const [x, y] = [k(a[1]), k(a[2])];
        if (x !== y) throw new NotTime();
        return x;
      }
      // a map of times: what is in it, without it, with one more
      case "dom":
        if (k(a[0]) === "time") throw new NotTime();
        return "plain";
      case "dsub": {
        const m = k(a[0]);
        plain(a[1], id, fields);
        if (m === "time") throw new NotTime();
        return m;
      }
      case "override": {
        const m = k(a[0]);
        plain(a[1], id, fields);
        const v = k(a[2]);
        if (m === "plain" && v === "plain") return "plain";
        // a map of times given a time; anything else mixes times with numbers
        if ((m === "times" || m === "plain") && v === "time") return "times";
        throw new NotTime();
      }
      case "emptyMap":
        return "plain";
      default:
        for (const x of a) plain(x, id, fields);
        return "plain";
    }
  };
  const plain = (e: unknown, id: string, fields: Map<string, "time" | "times">) => {
    if (kindOf(e, id, fields) !== "plain") throw new NotTime();
  };
  /** Every expression of the spec, read in its component, with what its value must be. */
  const everything = (fields: Map<string, "time" | "times">): boolean => {
    try {
      for (const [id, c] of internal) {
        for (const [f, x] of Object.entries(c.init ?? {})) {
          const want = fields.get(`${id}.${f}`);
          const got = kindOf(x, id, fields);
          // a map of times starts empty
          if (want === "times" && Array.isArray(x) && x[0] === "emptyMap") continue;
          if (want !== undefined || got !== "plain") throw new NotTime();
        }
        for (const event of Object.values(c.events ?? {})) {
          plain(event.guard, id, fields);
          for (const [f, x] of Object.entries(event.assign)) {
            const want = fields.get(`${id}.${f}`) ?? "plain";
            const got = kindOf(x, id, fields);
            if (got !== want && !(want === "times" && got === "plain" && Array.isArray(x) && x[0] === "emptyMap")) throw new NotTime();
          }
          for (const call of event.calls) {
            plain(call.when, id, fields);
            plain(call.args, id, fields);
          }
          if (event.output !== undefined) plain(event.output, id, fields);
        }
        for (const def of Object.values(c.commands ?? {})) plain(def.requires, id, fields);
        for (const q of Object.values(c.queries ?? {})) {
          plain(q.requires, id, fields);
          plain(q.is, id, fields);
        }
        for (const x of Object.values(c.conditions ?? {})) plain(x.is, id, fields);
        for (const x of Object.values(c.calcs ?? {})) plain(x.is, id, fields);
        for (const x of Object.values(c.decisions ?? {})) for (const row of x.rows) plain([row.when, row.then], id, fields);
        for (const x of Object.values(c.properties ?? {})) plain(x.is, id, fields);
      }
      return true;
    } catch (error) {
      if (error instanceof NotTime) return false;
      throw error;
    }
  };
  // the largest set of fields that hold only times: a field written with something else is not one
  let fields = new Map(candidates);
  for (;;) {
    if (everything(fields)) break;
    const wrong = [...fields.keys()].find((key) => {
      const [id, f] = [key.slice(0, key.indexOf(".")), key.slice(key.indexOf(".") + 1)];
      const c = ir.components[id];
      const writes = [...Object.values(c.events ?? {}).flatMap((e) => (f in e.assign ? [e.assign[f]] : [])), ...(c.init && f in c.init ? [c.init[f]] : [])];
      try {
        return writes.some((x) => {
          const got = kindOf(x, id, fields);
          return got !== fields.get(key) && !(Array.isArray(x) && x[0] === "emptyMap");
        });
      } catch (error) {
        if (error instanceof NotTime) return true;
        throw error;
      }
    });
    if (wrong === undefined) return { ir };
    fields = new Map([...fields].filter(([k]) => k !== wrong));
  }
  if (fields.size === 0) return { ir };

  // the spec with times as offsets from now: reading the clock is 0, and every field of times moves by the tick
  const tick: Expr = ["ask", clockId, TICK, {}];
  const age = (key: string, x: unknown): Expr => (fields.get(key) === "time" ? ["-", x, tick] : ["mapv", x, "__v", ["-", ["var", "__v"], tick], key.slice(key.indexOf(".") + 1)]);
  const offsets = (x: unknown): unknown => {
    if (Array.isArray(x)) {
      if (x[0] === "ask" && x[1] === clockId && x[2] === clockPort) return 0;
      if (x[0] === "lit") return x;
      return x.map(offsets);
    }
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, offsets(v)]));
    return x;
  };
  const components = offsets(ir.components) as Record<string, ComponentIr>;
  for (const [id, c] of Object.entries(components)) {
    if (c.external) {
      if (id === clockId) {
        const { [clockPort]: _, ...rest } = c.external.queries;
        c.external = { ...c.external, queries: { ...rest, [TICK]: { params: {}, result: "int", elapsed: true } as unknown as (typeof rest)[string] } };
      }
      continue;
    }
    const aged = Object.keys(c.state ?? {}).filter((f) => fields.has(`${id}.${f}`));
    if (aged.length === 0) continue;
    for (const event of Object.values(c.events ?? {})) for (const f of aged) if (f in event.assign) event.assign[f] = age(`${id}.${f}`, event.assign[f]);
    c.events = { ...c.events, [AGE_EVENT]: { command: AGE_EVENT, guard: true, assign: Object.fromEntries(aged.map((f) => [f, age(`${id}.${f}`, ["state", f])])), calls: [] } };
  }
  return { ir: { ...ir, components }, aging: { clock: `${clockId}.${clockPort}`, tick: `${clockId}.${TICK}`, fields: [...fields.keys()] } };
}

/** A port of the outside world that answers how far the clock moved (never less than 0). */
export const isElapsed = (q: unknown) => (q as { elapsed?: boolean }).elapsed === true;
export type { Type };
