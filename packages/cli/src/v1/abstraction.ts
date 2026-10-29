// What the Alloy module keeps of the IR, and how its numbers are made small (DSL.md §17.20, step C).
//
// Relevance: Alloy checks guards, requires, properties, that values read are defined, and that every case can happen.
// What only reaches an answer or an argument sent to the outside world is the PBT's to compare, so the module leaves
// it out: a state field read nowhere else, the answer of a command no other component reads.
//
// Numbers: when the relevant numbers do not fit Alloy's integers and they are only compared (no arithmetic, no
// counting), they are replaced by small numbers in the same order: an order-preserving embedding that fixes every
// constant. Between two constants with integers between them there are two values; below the smallest and above the
// largest, the rest of Alloy's range. The embedding is checked over Alloy's whole range every time it is made.

import type { ComponentIr, Ir8, Type } from "./ir.ts";

/** What the module needs of the IR: the state fields and command answers it must keep. */
export type Relevance = { fields: Set<string>; outputs: Set<string>; asked: Set<string>; numbers: Set<number>; arithmetic: string[]; counting: string[] };

const ARITHMETIC = new Set(["+", "-", "*", "div", "mod", "neg", "abs", "sum"]);
const COUNTING = new Set(["card", "count", "len", "strlen"]);

export function relevanceOf(ir: Ir8): Relevance {
  const internal = Object.entries(ir.components).filter(([, c]) => !c.external);
  const outputs = new Set<string>();
  const asked = new Set<string>();
  const scan = (x: unknown) => {
    if (Array.isArray(x)) {
      if (x[0] === "outputOf") outputs.add(`${x[1]}.${x[2]}`);
      if (x[0] === "ask" && !ir.components[x[1] as string]?.external) asked.add(`${x[1]}.${x[2]}`);
      x.forEach(scan);
    } else if (x && typeof x === "object") Object.values(x).forEach(scan);
  };
  scan(ir.components);

  const fields = new Set<string>();
  const numbers = new Set<number>();
  const arithmetic = new Set<string>();
  const counting = new Set<string>();
  const seen = new Set<string>();
  // walks a relevant expression read in component `id`, through the named bodies it uses
  const walk = (x: unknown, id: string) => {
    if (typeof x === "number") numbers.add(x);
    if (!Array.isArray(x)) {
      if (x && typeof x === "object") for (const v of Object.values(x)) walk(v, id);
      return;
    }
    const [op, ...a] = x as [string, ...unknown[]];
    if (op === "lit") return;
    if (ARITHMETIC.has(op)) arithmetic.add(op);
    if (COUNTING.has(op)) counting.add(op);
    const c = ir.components[id];
    const once = (key: string, then: () => void) => {
      if (seen.has(key)) return;
      seen.add(key);
      then();
    };
    if (op === "state") fields.add(`${id}.${a[0]}`);
    if (op === "cond") once(`cond:${id}.${a[0]}`, () => walk(c.conditions?.[a[0] as string]?.is, id));
    if (op === "calc") once(`calc:${id}.${a[0]}`, () => walk(c.calcs?.[a[0] as string]?.is, id));
    if (op === "field" && Array.isArray(a[0]) && a[0][0] === "decide") {
      const table = c.decisions?.[a[0][1] as string];
      once(`decide:${id}.${a[0][1]}`, () => table?.rows.forEach((row) => walk(row.when, id)));
      once(`cells:${id}.${a[0][1]}.${a[1]}`, () => table?.rows.forEach((row) => walk(row.then[a[1] as string], id)));
      walk(a[0][2], id);
      return;
    }
    if (op === "ask" && !ir.components[a[0] as string]?.external) {
      const target = ir.components[a[0] as string];
      once(`ask:${a[0]}.${a[1]}`, () => {
        const q = target?.queries?.[a[1] as string];
        walk(q?.requires, a[0] as string);
        walk(q?.is, a[0] as string);
      });
    }
    if (op === "outputOf") {
      const target = ir.components[a[0] as string];
      const def = target?.commands?.[a[1] as string];
      once(`out:${a[0]}.${a[1]}`, () => def?.events.forEach((e) => walk([target.events![e].guard, target.events![e].output], a[0] as string)));
    }
    for (const y of a) walk(y, id);
  };
  // the conditions that choose a case of an answer (its values are not checked)
  const conditionsOf = (x: unknown, c: ComponentIr, id: string) => {
    if (!Array.isArray(x)) return;
    if (x[0] === "ite") {
      walk(x[1], id);
      conditionsOf(x[2], c, id);
      conditionsOf(x[3], c, id);
    } else if (x[0] === "calc") conditionsOf(c.calcs?.[x[1] as string]?.is, c, id);
    else if (x[0] === "field" && Array.isArray(x[1]) && x[1][0] === "decide") c.decisions?.[x[1][1] as string]?.rows.forEach((row) => walk(row.when, id));
  };
  const decisionRowsIn = (x: unknown, c: ComponentIr, id: string) => {
    if (Array.isArray(x)) {
      if (x[0] === "decide") c.decisions?.[x[1] as string]?.rows.forEach((row) => walk(row.when, id));
      x.forEach((y) => decisionRowsIn(y, c, id));
    } else if (x && typeof x === "object") Object.values(x).forEach((y) => decisionRowsIn(y, c, id));
  };

  for (const [id, c] of internal) {
    for (const p of Object.values(c.properties ?? {})) walk(p.is, id);
    for (const [name, def] of Object.entries(c.commands ?? {})) {
      walk(def.requires, id);
      for (const e of def.events) {
        const event = c.events![e];
        walk(event.guard, id);
        for (const call of event.calls) {
          walk(call.when, id);
          if (!ir.components[call.component]?.external) walk(call.args, id);
        }
        if (outputs.has(`${id}.${name}`)) walk(event.output, id);
        // the rows of every decision the event reads: a trace to each is searched for
        decisionRowsIn([event.assign, event.output, event.calls], c, id);
      }
    }
    for (const [name, q] of Object.entries(c.queries ?? {})) {
      walk(q.requires, id);
      if (asked.has(`${id}.${name}`)) walk(q.is, id);
      else conditionsOf(q.is, c, id);
    }
  }
  // a field is relevant when a relevant expression reads it; then so is what is written to it
  for (let before = -1; before !== fields.size; ) {
    before = fields.size;
    for (const [id, c] of internal) {
      for (const f of Object.keys(c.state ?? {})) {
        if (!fields.has(`${id}.${f}`)) continue;
        walk(c.init?.[f], id);
        for (const event of Object.values(c.events ?? {})) if (f in event.assign) walk(event.assign[f], id);
      }
    }
  }
  // numbers named by types (numeric enums of inputs and of the outside world's answers) are constants too
  const enums = (t: Type | undefined) => {
    if (t && typeof t === "object") {
      if ("enum" in t) for (const v of t.enum) if (typeof v === "number") numbers.add(v);
      if ("optional" in t) enums(t.optional);
    }
  };
  for (const [id, c] of Object.entries(ir.components)) {
    for (const def of [...Object.values(c.commands ?? {}), ...Object.values(c.queries ?? {})]) Object.values(def.params).forEach(enums);
    for (const q of Object.values(c.external?.queries ?? {})) [...Object.values(q.params), q.result].forEach(enums);
    for (const [f, t] of Object.entries(c.state ?? {})) if (fields.has(`${id}.${f}`)) enums(t);
  }
  return { fields, outputs, asked, numbers, arithmetic: [...arithmetic].sort(), counting: [...counting].sort() };
}

/** How the module's integers stand for the spec's. */
export type Ints = {
  bitwidth: number;
  /** The number written in the module for a constant of the spec (undefined: not one the module was made for). */
  toAlloy(n: number): number | undefined;
  /** A value of the spec for a number Alloy chose (for traces read back). */
  concrete(v: number): number;
  /** Whether the numbers were replaced (the module then must not compute with them). */
  embedded: boolean;
};

const MAX_BITWIDTH = 7;
const bitsFor = (max: number) => Math.max(Math.ceil(Math.log2(max + 1)) + 1, 4);

/** The integers of the module, or why the numbers cannot be made to fit. */
export function intsOf(relevance: Relevance, fixed?: number): Ints | { reason: string } {
  const numbers = [...relevance.numbers].sort((a, b) => a - b);
  const max = Math.max(3, ...numbers.map(Math.abs));
  const identity = (bitwidth: number): Ints => ({ bitwidth, toAlloy: (n) => n, concrete: (v) => v, embedded: false });
  if (fixed) return identity(fixed);
  if (bitsFor(max) <= MAX_BITWIDTH) return identity(bitsFor(max));
  if (relevance.arithmetic.length > 0 || relevance.counting.length > 0) {
    return { reason: `仕様の中の数が 7 ビット (−64〜63) に収まらず、計算 (${[...relevance.arithmetic, ...relevance.counting].join(", ")}) に使われています。Alloy では確かめず、PBT に任せます` };
  }
  // ranks: one step between constants with no integer between them, two (one value between) otherwise
  const ranks: number[] = [];
  numbers.forEach((n, i) => ranks.push(i === 0 ? 0 : ranks[i - 1] + (n - numbers[i - 1] > 1 ? 2 : 1)));
  const shift = -Math.floor(ranks[ranks.length - 1] / 2);
  const images = ranks.map((r) => r + shift);
  // room for at least two values below the smallest constant and above the largest
  const bitwidth = bitsFor(Math.max(Math.abs(images[0] - 2), Math.abs(images[images.length - 1] + 2)));
  if (bitwidth > MAX_BITWIDTH) return { reason: `仕様の中の比べる定数が多すぎて、Alloy の数 (7 ビット) に並べられません。Alloy では確かめず、PBT に任せます` };
  const image = new Map(numbers.map((n, i) => [n, images[i]]));
  const ints: Ints = {
    bitwidth,
    embedded: true,
    toAlloy: (n) => image.get(n),
    concrete(v) {
      if (v <= images[0]) return numbers[0] - (images[0] - v);
      if (v >= images[images.length - 1]) return numbers[numbers.length - 1] + (v - images[images.length - 1]);
      const i = images.findIndex((x, k) => x <= v && v < images[k + 1]);
      return v === images[i] ? numbers[i] : numbers[i] + 1;
    },
  };
  checkEmbedding(ints, numbers);
  return ints;
}

/**
 * The embedding is exact for comparisons: over Alloy's whole range, `concrete` is strictly increasing, gives every
 * constant back, and never names a value between two constants that have no integer between them.
 */
export function checkEmbedding(ints: Ints, numbers: number[]): void {
  const low = -(2 ** (ints.bitwidth - 1));
  const high = 2 ** (ints.bitwidth - 1) - 1;
  for (let v = low; v < high; v++) {
    if (!(ints.concrete(v) < ints.concrete(v + 1))) throw new Error(`内部の誤り: 数の置き換えが順序を保ちません (${v}, ${v + 1})`);
  }
  for (const n of numbers) {
    const v = ints.toAlloy(n)!;
    if (v <= low || v >= high) throw new Error(`内部の誤り: 定数 ${n} が Alloy の数の端にあります`);
    if (ints.concrete(v) !== n) throw new Error(`内部の誤り: 定数 ${n} が戻りません`);
  }
}
