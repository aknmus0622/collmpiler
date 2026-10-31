// What the Alloy module keeps of the IR, and how its numbers are made small (DSL.md §17.20, step C).
//
// Relevance: Alloy checks guards, requires, properties, that values read are defined, and that every case can happen.
// What only reaches an answer or an argument sent to the outside world is the PBT's to compare, so the module leaves
// it out: a state field read nowhere else, the answer of a command no other component reads.
//
// Numbers: when the relevant numbers do not fit Alloy's integers and they are only compared (no arithmetic), they are
// replaced by small numbers in the same order: an order-preserving embedding that fixes every constant. Numbers near
// zero (within WINDOW) stay as they are, so a count (never more than the atoms of the scope) is compared with the
// constants it is compared with in the spec; beyond, between two constants with integers between them there is one
// value, and none where there is no integer between them. The embedding is checked over Alloy's whole range every time
// it is made.

import type { ComponentIr, Ir8, Type } from "./ir.ts";
import { sortsOf } from "./sorts.ts";
import { boundsOf } from "./bounds.ts";
import type { Interval } from "./bounds.ts";
import { classesOf } from "./classes.ts";
import type { Table } from "./classes.ts";

/** What the module needs of the IR: the state fields and command answers it must keep. */
export type Relevance = {
  fields: Set<string>;
  outputs: Set<string>;
  asked: Set<string>;
  numbers: Set<number>;
  arithmetic: string[];
  counting: string[];
  /** Where the numbers the checks read are written (the array or object holding each, and its index or key). */
  literalsAt: WeakMap<object, Set<string | number>>;
  /** The arithmetic the checks read (each operation, by the array it is written as). */
  arithmeticAt: Set<unknown[]>;
};

const ARITHMETIC = new Set(["+", "-", "*", "div", "mod", "neg", "abs", "sum"]);
const COUNTING = new Set(["card", "count", "len", "strlen"]);
/** Numbers kept as they are: counts never exceed the atoms of the scope (6 at most), so they stay inside. */
export const WINDOW = 8;

/** The number that stands for a class in a trace: its lower end, or the upper, or 0 for a class with no end. */
export const representative = (c: readonly [number, number]): number => (Number.isFinite(c[0]) ? c[0] : Number.isFinite(c[1]) ? c[1] : 0);

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
  const literalsAt = new WeakMap<object, Set<string | number>>();
  const arithmeticAt = new Set<unknown[]>();
  const mark = (holder: object, key: string | number) => {
    if (!literalsAt.has(holder)) literalsAt.set(holder, new Set());
    literalsAt.get(holder)!.add(key);
  };
  // a value kept in an object (a constant there is a literal of its own)
  const walkAt = (holder: Record<string, unknown> | undefined, key: string, id: string) => {
    if (!holder) return;
    if (typeof holder[key] === "number") mark(holder, key);
    walk(holder[key], id);
  };
  // walks a relevant expression read in component `id`, through the named bodies it uses
  const walk = (x: unknown, id: string) => {
    if (typeof x === "number") numbers.add(x);
    if (!Array.isArray(x)) {
      if (x && typeof x === "object") {
        for (const [k, v] of Object.entries(x)) {
          if (typeof v === "number") mark(x, k);
          walk(v, id);
        }
      }
      return;
    }
    const [op, ...a] = x as [string, ...unknown[]];
    if (op === "lit") return;
    x.forEach((v, i) => typeof v === "number" && mark(x, i));
    if (ARITHMETIC.has(op)) {
      arithmetic.add(op);
      arithmeticAt.add(x);
    }
    if (COUNTING.has(op)) counting.add(op);
    const c = ir.components[id];
    const once = (key: string, then: () => void) => {
      if (seen.has(key)) return;
      seen.add(key);
      then();
    };
    if (op === "state") fields.add(`${id}.${a[0]}`);
    if (op === "cond") once(`cond:${id}.${a[0]}`, () => walk(c.conditions?.[a[0] as string]?.is, id));
    if (op === "calc") once(`calc:${id}.${a[0]}`, () => walkAt(c.calcs?.[a[0] as string], "is", id));
    if (op === "field" && Array.isArray(a[0]) && a[0][0] === "decide") {
      const table = c.decisions?.[a[0][1] as string];
      once(`decide:${id}.${a[0][1]}`, () => table?.rows.forEach((row) => walk(row.when, id)));
      once(`cells:${id}.${a[0][1]}.${a[1]}`, () =>
        table?.rows.forEach((row) => {
          if (typeof row.then[a[1] as string] === "number") mark(row.then, a[1] as string);
          walk(row.then[a[1] as string], id);
        }),
      );
      walk(a[0][2], id);
      return;
    }
    if (op === "ask" && !ir.components[a[0] as string]?.external) {
      const target = ir.components[a[0] as string];
      once(`ask:${a[0]}.${a[1]}`, () => {
        const q = target?.queries?.[a[1] as string];
        walk(q?.requires, a[0] as string);
        walkAt(q, "is", a[0] as string);
      });
    }
    if (op === "outputOf") {
      const target = ir.components[a[0] as string];
      const def = target?.commands?.[a[1] as string];
      once(`out:${a[0]}.${a[1]}`, () =>
        def?.events.forEach((e) => {
          const event = target.events![e];
          if (typeof event.output === "number") mark(event, "output");
          walk([event.guard, event.output], a[0] as string);
        }),
      );
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
        if (outputs.has(`${id}.${name}`)) {
          if (typeof event.output === "number") mark(event, "output");
          walk(event.output, id);
        }
        // the rows of every decision the event reads: a trace to each is searched for
        decisionRowsIn([event.assign, event.output, event.calls], c, id);
      }
    }
    for (const [name, q] of Object.entries(c.queries ?? {})) {
      walk(q.requires, id);
      if (asked.has(`${id}.${name}`)) walkAt(q, "is", id);
      else conditionsOf(q.is, c, id);
    }
  }
  // a field is relevant when a relevant expression reads it; then so is what is written to it
  for (let before = -1; before !== fields.size; ) {
    before = fields.size;
    for (const [id, c] of internal) {
      for (const f of Object.keys(c.state ?? {})) {
        if (!fields.has(`${id}.${f}`)) continue;
        if (typeof c.init?.[f] === "number") mark(c.init, f);
        walk(c.init?.[f], id);
        for (const event of Object.values(c.events ?? {})) {
          if (!(f in event.assign)) continue;
          if (typeof event.assign[f] === "number") mark(event.assign, f);
          walk(event.assign[f], id);
        }
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
  return { fields, outputs, asked, numbers, literalsAt, arithmeticAt, arithmetic: [...arithmetic].sort(), counting: [...counting].sort() };
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
  if (relevance.arithmetic.length > 0) {
    return { reason: `仕様の中の数が 7 ビット (−64〜63) に収まらず、計算 (${relevance.arithmetic.join(", ")}) に使われています。Alloy では確かめず、PBT に任せます` };
  }
  // anchors: the constants and the ends of the window, each with its image. Inside the window a number is itself;
  // outside, one step to a constant with no integer between, two (one value between) otherwise
  const anchors = [...new Set([...numbers, -WINDOW, WINDOW])].sort((a, b) => a - b);
  const images = new Array<number>(anchors.length);
  const at = anchors.indexOf(-WINDOW);
  for (let i = at; i < anchors.length; i++) images[i] = anchors[i] <= WINDOW ? anchors[i] : images[i - 1] + (anchors[i] - anchors[i - 1] > 1 ? 2 : 1);
  for (let i = at - 1; i >= 0; i--) images[i] = images[i + 1] - (anchors[i + 1] - anchors[i] > 1 ? 2 : 1);
  // room for at least two values beyond the outermost constants
  const bitwidth = bitsFor(Math.max(Math.abs(images[0] - 2), Math.abs(images[images.length - 1] + 2)));
  if (bitwidth > MAX_BITWIDTH) return { reason: `仕様の中の比べる定数が多すぎて、Alloy の数 (7 ビット) に並べられません。Alloy では確かめず、PBT に任せます` };
  const image = new Map(anchors.map((n, i) => [n, images[i]]));
  const last = anchors.length - 1;
  const ints: Ints = {
    bitwidth,
    embedded: true,
    toAlloy: (n) => image.get(n) ?? (Math.abs(n) <= WINDOW ? n : undefined),
    concrete(v) {
      if (v <= images[0]) return anchors[0] - (images[0] - v);
      if (v >= images[last]) return anchors[last] + (v - images[last]);
      const i = images.findIndex((x, k) => x <= v && v < images[k + 1]);
      if (v === images[i]) return anchors[i];
      // a stretch kept as it is (the window), or the one value between two constants
      return images[i + 1] - images[i] === anchors[i + 1] - anchors[i] ? anchors[i] + (v - images[i]) : anchors[i] + 1;
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
    if (ints.embedded && Math.abs(n) <= WINDOW && v !== n) throw new Error(`内部の誤り: 0 の近くの数 ${n} が置き換わっています`);
    if (v <= low || v >= high) throw new Error(`内部の誤り: 定数 ${n} が Alloy の数の端にあります`);
    if (ints.concrete(v) !== n) throw new Error(`内部の誤り: 定数 ${n} が戻りません`);
  }
}

/**
 * A sort whose numbers are only compared (DSL.md §17.20): written as a chain of named atoms in the same order as its
 * constants. Between two constants with integers between them, and beyond each end, as many atoms as there are places
 * holding values of the sort (at most SLOTS): a trace never needs more distinct values there than that. No integer of
 * Alloy is left for it.
 *
 * A count only compared with small constants is a chain too, from 0 to the largest constant and one more, the last atom
 * meaning "that many or more": counting is a homomorphism of monoids, and comparing with constants up to K sees only
 * its value cut at K + 1.
 */
export type Chain = {
  name: string;
  /** The number each atom stands for (for a sort computed with: a number of its class, read back from traces). */
  values: number[];
  count?: boolean;
  /** A sort computed with: the class of numbers each atom stands for (classes.ts). */
  classes?: Interval[];
};
/** An operation of the checks as a table between chains: the chains of its operands that are not numbers written, and of its result. */
export type OpTable = { name: string; from: string[]; to: string; entries: { args: number[]; results: number[] }[]; shift?: number };
/** Values put between and beyond constants (data independence: as many as values of the sort that can meet). */
const SLOTS = 4;

/** The IR as the module is written from it: its numbers made to fit sort by sort (sorts.ts). */
export type Prepared = {
  ir: Ir8;
  bitwidth: number;
  /** Whether some numbers were replaced (the module then writes nothing it does not need). */
  embedded: boolean;
  /** A number Alloy chose for a place (see `Sorts.place`), or an atom of a chain, as a value of the spec. */
  concrete(place: string, v: string): number;
  /** A string's length as written in the module, the signature lengths are of, and one Alloy chose as the spec's. */
  length(n: number): string;
  lengthSig: string;
  concreteLength(v: string): number;
  /** The sorts written as chains of atoms. */
  chains: Chain[];
  /** The class of numbers an atom of a chain stands for (a sort computed with), for traces read back. */
  classOf(raw: string): Interval | undefined;
  /** The operations written as tables (an `["optab", name, …operands]` in the IR stands for one). */
  tables: OpTable[];
  /** Why sorts computed with kept Alloy's integers (one line per group of sorts). */
  kept: string[];
  /** Some table gives more than one class (`pred`): the module over-approximates, and its traces are run on the spec before they are reported. */
  approximate: boolean;
};

/** The atom of a chain, as written in the module. */
export const chainAtom = (chain: string, i: number) => `s_${chain}_${i}`;

/** How numbers computed with are written: as classes (`CLP_ALLOY_CLASSES=off`: as Alloy's integers, as before). */
export type NumberOptions = { steps?: number; classes?: boolean; operations?: "fun" | "pred" };

export function prepareNumbers(ir: Ir8, relevance: Relevance, lengths: number[] = [], fixed?: number, options: NumberOptions = {}): Prepared | { reason: string } {
  const sorts = sortsOf(ir, relevance);
  const bySort = new Map<number, Set<number>>();
  const add = (sort: number, n: number) => {
    if (!bySort.has(sort)) bySort.set(sort, new Set());
    bySort.get(sort)!.add(n);
  };
  // every literal the checks read, with its sort (one the sorts do not know makes all numbers one sort)
  let unknown = false;
  const visit = (x: unknown) => {
    if (Array.isArray(x)) {
      if (x[0] === "lit") return;
      x.forEach((v, i) => {
        if (typeof v === "number" && relevance.literalsAt.get(x)?.has(i)) {
          const sort = sorts.literal(x, i);
          if (sort === undefined) unknown = true;
          else add(sort, v);
        } else visit(v);
      });
    } else if (x && typeof x === "object") {
      for (const [k, v] of Object.entries(x)) {
        if (typeof v === "number" && relevance.literalsAt.get(x)?.has(k)) {
          const sort = sorts.literal(x, k);
          if (sort === undefined) unknown = true;
          else add(sort, v);
        } else visit(v);
      }
    }
  };
  visit(ir.components);
  // numbers named by the types of inputs and of the outside world's answers
  const typed: [string, Type][] = [];
  for (const [id, c] of Object.entries(ir.components)) {
    for (const [name, def] of Object.entries(c.commands ?? {})) for (const [p, t] of Object.entries(def.params)) typed.push([`param:${id}.${name}.${p}`, t]);
    for (const [name, q] of Object.entries(c.queries ?? {})) for (const [p, t] of Object.entries(q.params)) typed.push([`qparam:${id}.${name}.${p}`, t]);
    for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
      typed.push([`env:${id}.${port}`, q.result]);
      for (const [p, t] of Object.entries(q.params)) typed.push([`envp:${id}.${port}.${p}`, t]);
    }
    for (const [f, t] of Object.entries(c.state ?? {})) if (relevance.fields.has(`${id}.${f}`)) typed.push([`state:${id}.${f}`, t]);
  }
  const enumsIn = (name: string, t: Type) => {
    if (typeof t !== "object") return;
    if ("optional" in t) return enumsIn(name, t.optional);
    if ("enum" in t) for (const v of t.enum) if (typeof v === "number") add(sorts.place(name) ?? -1, v);
    if ("record" in t) for (const [k, kt] of Object.entries(t.record)) enumsIn(`${name}.${k}`, kt);
    if ("list" in t) enumsIn(`${name}.#elem`, t.list);
    if ("set" in t) enumsIn(`${name}.#elem`, t.set);
    if ("map" in t) {
      enumsIn(`${name}.#k`, t.map[0]);
      enumsIn(`${name}.#v`, t.map[1]);
    }
  };
  for (const [name, t] of typed) enumsIn(name, t);
  for (const n of lengths) add(sorts.stringLength, n);
  if (lengths.length) add(sorts.stringLength, 0);
  if (unknown || bySort.has(-1)) {
    // not known: all numbers as one sort, as before the sorts
    const made = intsOf(relevance, fixed);
    if ("reason" in made) return made;
    return {
      ir,
      bitwidth: made.bitwidth,
      embedded: made.embedded,
      concrete: (_, v) => made.concrete(Number(v)),
      length: (n) => intText(made.toAlloy(n) ?? n),
      lengthSig: "Int",
      concreteLength: (v) => made.concrete(Number(v)),
      chains: [],
      classOf: () => undefined,
      tables: [],
      kept: [],
      approximate: false,
    };
  }
  // a sort only compared becomes a chain of atoms; the others stay integers, made to fit on their own
  const chainOf = new Map<number, { chain: Chain; index: { get(n: number): number | undefined } }>();
  const ints = new Map<number, Ints>();
  // sorts computed with, linked by their operations into groups: each group as classes (classes.ts), or as integers
  const tableOf = new Map<unknown[], Table>();
  const kept: string[] = [];
  let approximate = false;
  if (fixed === undefined && options.classes !== false && process.env.CLP_ALLOY_CLASSES !== "off" && sorts.arithmetic.size > 0) {
    const parent = new Map<number, number>();
    const root = (x: number): number => {
      while (parent.has(x) && parent.get(x) !== x) x = parent.get(x)!;
      return x;
    };
    for (const o of sorts.operations) for (const x of o.operands) if ("sort" in x) parent.set(root(x.sort), root(o.sort));
    const groups = new Map<number, Set<number>>();
    for (const sort of sorts.arithmetic) groups.set(root(sort), (groups.get(root(sort)) ?? new Set()).add(sort));
    const bounds = boundsOf(ir, options.steps ?? 12);
    // what the spec says about how to write them (`analysis` of the component a place is in, and `classes<T>` of its type)
    const { places } = sorts.members();
    const said = (place: string) => {
      const id = place.slice(place.indexOf(":") + 1).split(".")[0];
      const analysis = ir.components[id]?.analysis;
      const given = analysis?.classes?.find((c) => c.places.includes(place));
      return { operations: given?.operations ?? analysis?.operations, points: given?.points ?? [] };
    };
    const pointsOf = new Map<number, number[]>();
    const modeOf = new Map<number, "fun" | "pred">();
    for (const [place, sort] of places) {
      const { operations, points } = said(place);
      if (points.length) pointsOf.set(sort, [...(pointsOf.get(sort) ?? []), ...points]);
      if (operations === "fun" || (operations === "pred" && !modeOf.has(sort))) modeOf.set(sort, operations);
    }
    for (const group of groups.values()) {
      const special = [...group].some((s) => sorts.counting.has(s) || s === sorts.stringLength || sorts.summed.has(s));
      // `fun` when any of its places asks for it
      const modes = [...group].map((s) => modeOf.get(s));
      const mode = modes.includes("fun") ? "fun" : modes.includes("pred") ? "pred" : (options.operations ?? "pred");
      const made = special ? { reason: "数えた結果や和と一緒に計算されています" } : classesOf(group, sorts, bounds, bySort, mode, pointsOf);
      if ("reason" in made && mode === "fun") kept.push(`fun を指定した数を類に分けきれず、Alloy の整数で確かめます (${made.reason})`);
      if ("reason" in made) {
        if (mode !== "fun") kept.push(`数を類に分けられず、Alloy の整数で確かめます (${made.reason})`);
        continue;
      }
      for (const sort of [...group].sort((a, b) => a - b)) {
        const intervals = made.classes.get(sort)!;
        const values = intervals.map(representative);
        const chain: Chain = { name: `num${chainOf.size}`, values, classes: intervals };
        chainOf.set(sort, { chain, index: { get: (n) => ((i) => (i < 0 ? undefined : i))(intervals.findIndex((c) => c[0] <= n && n <= c[1])) } });
      }
      for (const [e, table] of made.tables) tableOf.set(e, table);
      if (!made.exact) approximate = true;
    }
  }
  for (const sort of [...new Set([...sorts.numeric, ...(lengths.length ? [sorts.stringLength] : [])])].sort((a, b) => a - b)) {
    if (chainOf.has(sort)) continue;
    const constants = [...(bySort.get(sort) ?? [])].sort((a, b) => a - b);
    if (!sorts.arithmetic.has(sort) && fixed === undefined) {
      const values: number[] = [];
      let count = false;
      if (sorts.counting.has(sort)) {
        // a count: 0 to the largest constant, then "one more or more"; only when the constants are small and not negative
        if (constants.some((n) => n < 0 || n > WINDOW - 1)) {
          const made = intsOf({ ...relevance, numbers: new Set(constants), arithmetic: [] }, fixed);
          if ("reason" in made) return made;
          ints.set(sort, made);
          continue;
        }
        const top = Math.max(0, ...constants) + 1;
        for (let n = 0; n <= top; n++) values.push(n);
        count = true;
      } else {
        const k = sorts.variables(sort, SLOTS);
        const run = (from: number, step: number, n: number) => Array.from({ length: n }, (_, i) => from + step * (i + 1));
        if (constants.length === 0) values.push(...run(-1, 1, Math.max(k, 2) * 2));
        else {
          values.push(...run(constants[0], -1, k).reverse());
          constants.forEach((n, i) => {
            values.push(n);
            if (i + 1 < constants.length) values.push(...run(n, 1, Math.min(k, constants[i + 1] - n - 1)));
          });
          values.push(...run(constants[constants.length - 1], 1, k));
        }
      }
      const chain: Chain = { name: `num${chainOf.size}`, values, ...(count ? { count } : {}) };
      chainOf.set(sort, { chain, index: new Map(values.map((v, i) => [v, i])) });
      continue;
    }
    const made = intsOf({ ...relevance, numbers: bySort.get(sort) ?? new Set(), arithmetic: sorts.arithmetic.has(sort) ? ["計算"] : [] }, fixed);
    if ("reason" in made) return made;
    ints.set(sort, made);
  }
  for (const [sort, numbers] of bySort) {
    if (ints.has(sort) || chainOf.has(sort)) continue;
    const made = intsOf({ ...relevance, numbers, arithmetic: sorts.arithmetic.has(sort) ? ["計算"] : [] }, fixed);
    if ("reason" in made) return made;
    ints.set(sort, made);
  }
  checkChains([...chainOf.values()]);
  const bitwidth = Math.max(4, ...[...ints.values()].map((i) => i.bitwidth));
  const embedded = chainOf.size > 0 || [...ints.values()].some((i) => i.embedded);
  const atomValue = new Map([...chainOf.values()].flatMap(({ chain }) => chain.values.map((v, i) => [chainAtom(chain.name, i), v] as const)));
  const atomClass = new Map([...chainOf.values()].flatMap(({ chain }) => (chain.classes ?? []).map((c, i) => [chainAtom(chain.name, i), c] as const)));
  const classOf = (raw: string) => atomClass.get(raw.replace(/\$\d+$/, ""));
  const concreteOf = (sort: number | undefined, raw: string) => {
    const atom = atomValue.get(raw.replace(/\$\d+$/, ""));
    if (atom !== undefined) return atom;
    const i = sort === undefined ? undefined : ints.get(sort);
    return i?.embedded ? i.concrete(Number(raw)) : Number(raw);
  };
  const lengthChain = chainOf.get(sorts.stringLength);
  const length = (n: number) => (lengthChain ? chainAtom(lengthChain.chain.name, lengthChain.index.get(n)!) : intText(ints.get(sorts.stringLength)?.toAlloy(n) ?? n));
  const lengthSig = lengthChain ? `s_${lengthChain.chain.name}` : "Int";
  const concreteLength = (v: string) => concreteOf(sorts.stringLength, v);
  const chains = [...chainOf.values()].map(({ chain }) => chain);
  // the tables of the operations, named in the order they are met
  const tables: OpTable[] = [];
  const tableName = new Map<Table, string>();
  const same = new Map<string, string>();
  for (const table of tableOf.values()) {
    const written = { from: table.from.map((s) => chainOf.get(s)!.chain.name), to: chainOf.get(table.to)!.chain.name, entries: table.entries, ...(table.shift !== undefined ? { shift: table.shift } : {}) };
    // two operations with the same table share it
    const key = JSON.stringify(written);
    if (!same.has(key)) {
      same.set(key, `op_${written.to}_${tables.length}`);
      tables.push({ name: same.get(key)!, ...written });
    }
    tableName.set(table, same.get(key)!);
  }
  if (!embedded) return { ir, bitwidth, embedded, concrete: (_, v) => Number(v), length, lengthSig, concreteLength, chains, classOf, tables, kept, approximate };
  // the IR with every number the checks read replaced: by a chain's atom, or by its sort's integer
  const image = (sort: number | undefined, n: number): unknown => {
    const chain = sort === undefined ? undefined : chainOf.get(sort);
    if (chain) return ["ord", chain.chain.name, chain.index.get(n)!];
    const i = sort === undefined ? undefined : ints.get(sort);
    return i?.embedded ? (i.toAlloy(n) ?? n) : n;
  };
  const ORDERED: Record<string, string> = { "<": "ord<", "<=": "ord<=", ">": "ord>", ">=": "ord>=", min: "ordmin", max: "ordmax" };
  const rewrite = (x: unknown): unknown => {
    if (Array.isArray(x)) {
      if (x[0] === "lit") return x;
      // a count of a sort written as a chain: the chain's atom for how many there are (cut at its last)
      const counted = x[0] === "card" || x[0] === "len" || x[0] === "count" ? sorts.countOf(x) : undefined;
      const countChain = counted === undefined ? undefined : chainOf.get(counted);
      if (countChain) return ["ordcount", countChain.chain.name, countChain.chain.values.length - 1, x.map((v) => rewrite(v))];
      // an operation on classes: its table, applied to the operands that are not numbers written
      const table = tableOf.get(x);
      if (table) {
        const operands = x.slice(1).filter((v) => typeof v !== "number").map((v) => rewrite(v));
        if (table.shift !== undefined) return ["ordshift", chainOf.get(table.to)!.chain.name, table.shift, operands[0]];
        // a table that gives more than one class: one of them, chosen at each step (alloy.ts)
        return [table.entries.some((x) => x.results.length > 1) ? "optabp" : "optab", tableName.get(table)!, ...operands];
      }
      const items = x.map((v, i) => (typeof v === "number" && relevance.literalsAt.get(x)?.has(i) ? image(sorts.literal(x, i), v) : rewrite(v)));
      // a comparison of a chain's values: along the chain
      const compared = typeof x[0] === "string" && x[0] in ORDERED ? sorts.compared(x) : undefined;
      const chain = compared === undefined ? undefined : chainOf.get(compared);
      return chain ? [ORDERED[x[0] as string], chain.chain.name, ...items.slice(1)] : items;
    }
    if (x && typeof x === "object") {
      return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === "number" && relevance.literalsAt.get(x)?.has(k) ? image(sorts.literal(x, k), v) : rewrite(v)]));
    }
    return x;
  };
  const retype = (name: string, t: Type): Type => {
    const sort = sorts.place(name);
    const chain = sort === undefined ? undefined : chainOf.get(sort);
    if (t === "int") return chain ? { atom: chain.chain.name } : t;
    if (typeof t !== "object") return t;
    if ("optional" in t) return { optional: retype(name, t.optional) };
    if ("enum" in t && t.enum.every((v) => typeof v === "number")) {
      // an enumeration of numbers in a chain: the chain's atoms it allows
      if (chain) return { atom: chain.chain.name, among: t.enum.map((v) => chain.index.get(v as number)!) } as unknown as Type;
      return { enum: t.enum.map((v) => image(sort, v as number)) } as Type;
    }
    if ("record" in t) return { record: Object.fromEntries(Object.entries(t.record).map(([k, kt]) => [k, retype(`${name}.${k}`, kt)])) };
    if ("list" in t) return { list: retype(`${name}.#elem`, t.list) };
    if ("set" in t) return { set: retype(`${name}.#elem`, t.set) };
    if ("map" in t) return { map: [retype(`${name}.#k`, t.map[0]), retype(`${name}.#v`, t.map[1])] };
    return t;
  };
  const components = rewrite(ir.components) as Ir8["components"];
  for (const [id, c] of Object.entries(components)) {
    for (const [name, def] of Object.entries(c.commands ?? {})) def.params = Object.fromEntries(Object.entries(def.params).map(([p, t]) => [p, retype(`param:${id}.${name}.${p}`, t)]));
    for (const [name, q] of Object.entries(c.queries ?? {})) q.params = Object.fromEntries(Object.entries(q.params).map(([p, t]) => [p, retype(`qparam:${id}.${name}.${p}`, t)]));
    for (const [port, q] of Object.entries(c.external?.queries ?? {})) {
      q.result = retype(`env:${id}.${port}`, q.result);
      q.params = Object.fromEntries(Object.entries(q.params).map(([p, t]) => [p, retype(`envp:${id}.${port}.${p}`, t)]));
    }
    for (const [f, t] of Object.entries(c.state ?? {})) if (relevance.fields.has(`${id}.${f}`)) c.state![f] = retype(`state:${id}.${f}`, t);
    for (const [name, calc] of Object.entries(c.calcs ?? {})) calc.params = Object.fromEntries(Object.entries(calc.params).map(([p, t]) => [p, retype(`calc:${id}.${name}.${p}`, t)]));
    for (const [name, cond] of Object.entries(c.conditions ?? {})) cond.params = Object.fromEntries(Object.entries(cond.params).map(([p, t]) => [p, retype(`cond:${id}.${name}.${p}`, t)]));
    for (const [name, table] of Object.entries(c.decisions ?? {})) table.params = Object.fromEntries(Object.entries(table.params).map(([p, t]) => [p, retype(`dparam:${id}.${name}.${p}`, t)]));
  }
  // only the chains the module refers to (an operation's result is a sort of its own, often never written)
  const written = JSON.stringify(components);
  const used = chains.filter((c) => c === lengthChain?.chain || written.includes(`"${c.name}"`) || tables.some((t) => t.to === c.name || t.from.includes(c.name)));
  return { ir: { ...ir, components }, bitwidth, embedded, concrete: (place, v) => concreteOf(sorts.place(place), v), length, lengthSig, concreteLength, chains: used, classOf, tables, kept, approximate };
}

const intText = (n: number) => (n < 0 ? `minus[0, ${-n}]` : String(n));

/** A chain is in the order of the numbers it stands for, and has no atom between two consecutive integers. */
export function checkChains(chains: { chain: Chain }[]): void {
  for (const { chain } of chains) {
    chain.values.forEach((v, i) => {
      if (i > 0 && !(chain.values[i - 1] < v)) throw new Error(`内部の誤り: 数の鎖 ${chain.name} が順に並んでいません (${chain.values[i - 1]}, ${v})`);
    });
  }
}
