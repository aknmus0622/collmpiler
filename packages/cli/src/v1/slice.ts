// What one question of the Alloy module needs (DSL.md §17.21): the state it reads, and everything that can change that
// state, to a fixed point (the cone of influence). Every step of the module may stutter, so an entry's event that writes
// nothing the question needs is, seen from what it needs, a stutter: leaving it out keeps the same traces of what the
// question sees, and the same answer. A command called by a kept event keeps all its events (it must happen in the same
// step; the one left out could be the one that lets it).

import type { Ir8 } from "./ir.ts";

/** What a question reads (expressions, each read in a component), and the events it names (it asks for them, or `on`). */
export type Uses = { reads: [string, unknown][]; events: string[] };
/** What a module made for a question keeps: state fields (`<id>.<field>`), events (`<id>.<event>`), queries of the outside world (`<id>.<port>`). */
export type Keep = { fields: Set<string>; events: Set<string>; env: Set<string> };

export function sliceOf(ir: Ir8, uses: Uses): Keep {
  const keep: Keep = { fields: new Set(), events: new Set(uses.events), env: new Set() };
  const walked = new Set<string>();
  const once = (key: string, then: () => void) => {
    if (walked.has(key)) return;
    walked.add(key);
    then();
  };
  // the state and the outside world an expression read in component `id` reaches, through the named parts it uses
  const read = (x: unknown, id: string): void => {
    if (!Array.isArray(x)) {
      if (x && typeof x === "object") for (const v of Object.values(x)) read(v, id);
      return;
    }
    // a list of expressions (not an operation): each of them
    if (typeof x[0] !== "string") {
      for (const y of x) read(y, id);
      return;
    }
    const [op, ...a] = x as [string, ...unknown[]];
    if (op === "lit") return;
    const c = ir.components[id];
    if (op === "state") keep.fields.add(`${id}.${a[0]}`);
    if (op === "cond") once(`cond:${id}.${a[0]}`, () => read(c?.conditions?.[a[0] as string]?.is, id));
    if (op === "calc") once(`calc:${id}.${a[0]}`, () => read(c?.calcs?.[a[0] as string]?.is, id));
    if (op === "decide") once(`decide:${id}.${a[0]}`, () => c?.decisions?.[a[0] as string]?.rows.forEach((row) => read([row.when, row.then], id)));
    if (op === "ask") {
      const target = ir.components[a[0] as string];
      if (target?.external) keep.env.add(`${a[0]}.${a[1]}`);
      else once(`ask:${a[0]}.${a[1]}`, () => read([target?.queries?.[a[1] as string]?.requires, target?.queries?.[a[1] as string]?.is], a[0] as string));
    }
    if (op === "failed" && Array.isArray(a[0]) && a[0][0] === "ask") keep.env.add(`${a[0][1]}.${a[0][2]}`);
    if (op === "outputOf") {
      const target = ir.components[a[0] as string];
      const def = target?.commands?.[a[1] as string];
      once(`out:${a[0]}.${a[1]}`, () => {
        read(def?.requires, a[0] as string);
        for (const e of def?.events ?? []) read([target.events![e].guard, target.events![e].output], a[0] as string);
      });
    }
    for (const y of a) read(y, id);
  };
  for (const [id, x] of uses.reads) read(x, id);

  // events that change what is needed, and what they read, until nothing more is needed
  const internal = Object.entries(ir.components).filter(([, c]) => !c.external);
  for (let before = ""; ; ) {
    const now = `${keep.fields.size}/${keep.events.size}/${keep.env.size}`;
    if (now === before) break;
    before = now;
    for (const [id, c] of internal) {
      for (const def of Object.values(c.commands ?? {})) {
        for (const e of def.events) {
          const event = c.events![e];
          const qualified = `${id}.${e}`;
          const writes = Object.keys(event.assign).some((f) => keep.fields.has(`${id}.${f}`));
          // a call of a part's command that changes what is needed
          const calls = event.calls.some((call) => !ir.components[call.component]?.external && (ir.components[call.component]?.commands?.[call.command]?.events ?? []).some((x) => keep.events.has(`${call.component}.${x}`)));
          if (!writes && !calls && !keep.events.has(qualified)) continue;
          keep.events.add(qualified);
          // whether it happens, what it writes that is needed, and the parts it calls (with what, and when)
          once(`event:${qualified}`, () => read([def.requires, event.guard], id));
          for (const [f, value] of Object.entries(event.assign)) if (keep.fields.has(`${id}.${f}`)) once(`assign:${qualified}.${f}`, () => read(value, id));
          for (const call of event.calls) {
            if (ir.components[call.component]?.external) continue;
            once(`call:${qualified}.${call.component}.${call.command}`, () => read([call.when, call.args], id));
            // the called command happens in the same step: every event of it stays (one left out could be the one that
            // lets the call happen); those that write nothing needed change nothing needed
            for (const x of ir.components[call.component]?.commands?.[call.command]?.events ?? []) keep.events.add(`${call.component}.${x}`);
          }
        }
      }
    }
  }
  return keep;
}
