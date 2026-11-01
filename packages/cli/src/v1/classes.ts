// Numbers that are computed with, as classes (DSL.md §17.21, removing Int, steps 2 and 3).
//
// The values of a sort are split into intervals, its classes, each an atom of a chain in the order of the numbers. An
// operation becomes a table from the classes of its operands to the class of its result, derived by interval arithmetic
// (`x + 1` along the chain is the ordering `next`; `owed + amount` a table). A comparison is along the chain. The split
// is exact (an Alloy function, `fun`) when every table gives one class and every comparison the checks read is decided
// by the classes: the classes are then a congruence, and what Alloy finds over them is what the spec does. It starts
// from the numbers each sort is compared with and the ranges bounds.ts read, and is made finer where a table gives more
// than one class (at the numbers where the result crosses from one class to the next), until it is exact or has too
// many classes (then the sort keeps Alloy's integers). Every table is checked against the oracle (eval.ts).
//
// Sorts linked by an operation are split together: a table needs both sides as classes.

import type { Interval } from "./bounds.ts";
import type { Bounds } from "./bounds.ts";
import { evaluate } from "./eval.ts";
import type { Sorts } from "./sorts.ts";

/** At most this many classes for one sort. */
export const MAX_CLASSES = 64;
/** At most this many for an over-approximation (`pred`): its tables give sets, chosen at every step, and grow fast. */
export const MAX_PRED_CLASSES = 16;

export type Table = {
  name: string;
  /** The sort of each operand that is not a number written (in order), and of the result. */
  from: number[];
  to: number;
  /** For each combination of the operands' classes (indices), the indices of the result's classes (one, when exact). */
  entries: { args: number[]; results: number[] }[];
  /** `x + c` along the chain: the result is always the class `shift` places on. */
  shift?: number;
};

export type Classes = {
  /** The classes of each sort of the group, in order. */
  classes: Map<number, Interval[]>;
  /** One table per operation, by the array the operation is written as. */
  tables: Map<unknown[], Table>;
  /** Every table gives one class (`fun`); otherwise some give several (`pred`, an over-approximation). */
  exact: boolean;
};

const meet = (a: Interval, b: Interval): Interval | undefined => {
  const lo = Math.max(a[0], b[0]);
  const hi = Math.min(a[1], b[1]);
  return lo <= hi ? [lo, hi] : undefined;
};
const size = (x: Interval) => x[1] - x[0] + 1;
const singleton = (x: Interval) => x[0] === x[1];

function arith(op: string, a: Interval, b: Interval): Interval | undefined {
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
      if (b[0] <= 0 && b[1] >= 0) return singleton(b) ? undefined : [-Infinity, Infinity];
      const ps = [a[0] / b[0], a[0] / b[1], a[1] / b[0], a[1] / b[1]].map((x) => (Number.isNaN(x) ? 0 : Math.floor(x)));
      return [Math.min(...ps), Math.max(...ps)];
    }
    case "mod": {
      if (singleton(a) && singleton(b) && b[0] !== 0) return [a[0] % b[0], a[0] % b[0]];
      const m = Math.max(Math.abs(b[0]), Math.abs(b[1])) - 1;
      return [a[0] >= 0 ? 0 : -m, a[1] <= 0 ? 0 : m];
    }
    case "neg":
      return [-a[1], -a[0]];
    case "abs":
      return a[0] >= 0 ? a : a[1] <= 0 ? [-a[1], -a[0]] : [0, Math.max(-a[0], a[1])];
  }
  return undefined;
}

/**
 * The classes of a group of sorts linked by operations, or why they cannot be made exact. `values` are the numbers
 * written in each sort.
 */
export function classesOf(group: Set<number>, sorts: Sorts, bounds: Bounds, values: Map<number, Set<number>>, mode: "fun" | "pred" = "fun", given: Map<number, number[]> = new Map()): Classes | { reason: string } {
  const { nodes, places } = sorts.members();
  // what each sort can hold: the ranges of its expressions and places, and the numbers written in it
  const hull = new Map<number, Interval>();
  const widen = (sort: number, x: Interval | undefined) => {
    if (!x || !group.has(sort)) return;
    const h = hull.get(sort);
    hull.set(sort, h ? [Math.min(h[0], x[0]), Math.max(h[1], x[1])] : x);
  };
  for (const [e, sort] of nodes) widen(sort, bounds.node(e));
  for (const [name, sort] of places) widen(sort, bounds.place(name));
  for (const sort of group) for (const n of values.get(sort) ?? []) widen(sort, [n, n]);
  const rangeOf = (x: unknown): Interval | undefined => (typeof x === "number" ? [x, x] : Array.isArray(x) ? bounds.node(x) : undefined);

  // start: the numbers each sort is compared with, as classes of their own
  const points = new Map<number, Set<number>>([...group].map((s) => [s, new Set<number>()]));
  const comparisons = sorts.comparisons().filter(([, s]) => group.has(s));
  for (const [e, sort] of comparisons) {
    for (const x of e.slice(1)) {
      const r = rangeOf(x);
      if (r && singleton(r)) {
        points.get(sort)!.add(r[0]);
        points.get(sort)!.add(r[0] + 1);
      }
    }
  }
  // and the numbers the spec says are classes of their own (`classes<T>`)
  for (const sort of group) {
    for (const p of given.get(sort) ?? []) {
      points.get(sort)!.add(p);
      points.get(sort)!.add(p + 1);
    }
  }
  const classes = new Map<number, Interval[]>();
  const rebuild = () => {
    for (const sort of group) {
      const h = hull.get(sort) ?? [0, 0];
      const cuts = [...points.get(sort)!].filter((p) => p > h[0] && p <= h[1]).sort((a, b) => a - b);
      const out: Interval[] = [];
      let lo = h[0];
      for (const p of cuts) {
        out.push([lo, p - 1]);
        lo = p;
      }
      out.push([lo, h[1]]);
      classes.set(sort, out);
    }
  };
  // cuts found in a round are made at its end (the round reads the classes as they were at its start)
  let pending = new Map<number, Set<number>>();
  const cut = (sort: number, p: number) => pending.set(sort, (pending.get(sort) ?? new Set()).add(p));
  /** Every number of a range a class of its own. */
  const apart = (sort: number, x: Interval): boolean => {
    if (!Number.isFinite(x[0]) || !Number.isFinite(x[1]) || size(x) > MAX_CLASSES) return false;
    for (let p = x[0]; p <= x[1] + 1; p++) cut(sort, p);
    return true;
  };
  const indexIn = (sort: number, x: Interval): number[] => classes.get(sort)!.flatMap((c, i) => (meet(c, x) ? [i] : []));

  const operations = sorts.operations.filter((o) => group.has(o.sort));
  const collected = new Set(places.filter(([name, sort]) => group.has(sort) && /\.(#elem|#k)$/.test(name)).map(([, sort]) => sort));
  // the finest split found so far where every comparison is decided (pred: the one used when no exact split is found)
  let decided: Map<number, Set<number>> | undefined;
  let exact = true;
  const giveUp = (reason: string): { reason: string } | undefined => {
    if (mode === "fun" || !decided) return { reason };
    points.clear();
    for (const [sort, ps] of decided) points.set(sort, ps);
    rebuild();
    exact = false;
    return undefined;
  };
  // (once an operation cannot be made exact, the split will be an over-approximation: kept small)
  let everStuck = false;
  const exactSoFar = () => !everStuck;
  let before = -1;
  for (let round = 0; ; round++) {
    rebuild();
    const total = [...classes.values()].reduce((m, c) => m + c.length, 0);
    if ([...group].some((sort) => classes.get(sort)!.length > MAX_CLASSES) || (mode === "pred" && !exactSoFar() && [...group].some((sort) => classes.get(sort)!.length > MAX_PRED_CLASSES))) {
      const failed = giveUp(`数の分け方が ${MAX_CLASSES} を超えました`);
      if (failed) return failed;
      break;
    }
    if (total === before) {
      const failed = giveUp("数の分け方を細かくしても、演算の結果が1つに決まりません");
      if (failed) return failed;
      break;
    }
    before = total;
    pending = new Map();
    let finer = false;
    let stuck: string | undefined;
    // a comparison of two values in one class that is not a single number is not decided by the classes
    let compared = true;
    for (const [e, sort] of comparisons) {
      const [x, y] = [rangeOf(e[1]), rangeOf(e[2])];
      if (!x || !y || singleton(x) || singleton(y)) continue;
      for (const k of indexIn(sort, x)) {
        const c = classes.get(sort)![k];
        if (singleton(c) || !meet(c, y)) continue;
        const both = meet(c, [Math.min(x[0], y[0]), Math.max(x[1], y[1])])!;
        // (never decided: Alloy's integers, in either mode)
        if (!apart(sort, both)) return { reason: "比べる2つの値が同じ類に入り、分けきれません" };
        compared = false;
        finer = true;
      }
    }
    // an element of a set or a key of a map: two numbers in one class would be one element
    for (const sort of collected) {
      for (const c of classes.get(sort)!) {
        if (singleton(c)) continue;
        if (!apart(sort, c)) return { reason: "集まりの要素や対応のキーになる数を、1つずつに分けきれません" };
        compared = false;
        finer = true;
      }
    }
    if (compared) decided = new Map([...points].map(([sort, ps]) => [sort, new Set(ps)]));
    for (const o of operations) {
      const result = bounds.node(o.e);
      if (!result) continue;
      const ranges = o.operands.map((x, i) => ("literal" in x ? ([x.literal, x.literal] as Interval) : rangeOf(o.e[i + 1])));
      if (ranges.some((r) => !r)) continue;
      const choices = o.operands.map((x, i) => ("literal" in x ? [ranges[i]!] : indexIn(x.sort, ranges[i]!).map((k) => meet(classes.get(x.sort)![k], ranges[i]!)!)));
      for (const args of product(choices)) {
        const r = arith(o.op, args[0], args[1] ?? args[0]);
        const value = r && meet(r, result);
        if (!value) continue;
        const hits = indexIn(o.sort, value);
        if (hits.length <= 1) continue;
        // where the result crosses into the next class: cut an operand there
        const crossings = hits.slice(1).map((k) => classes.get(o.sort)![k][0]);
        if (!refine(o.op, o.operands, args, crossings, cut, apart)) stuck = `演算 ${o.op} の結果が分け方で1つに決まりません`;
        finer = true;
      }
    }
    // (pred: what can still be made finer is, up to the limit; the finest split with every comparison decided is used)
    if (stuck && mode === "fun") return { reason: stuck };
    if (stuck) everStuck = true;
    if (!finer) {
      if (stuck) giveUp(stuck);
      break;
    }
    for (const [sort, ps] of pending) for (const p of ps) points.get(sort)!.add(p);
  }

  // the tables
  const tables = new Map<unknown[], Table>();
  let n = 0;
  for (const o of operations) {
    const result = bounds.node(o.e);
    const ranges = o.operands.map((x, i) => ("literal" in x ? ([x.literal, x.literal] as Interval) : rangeOf(o.e[i + 1])));
    const from = o.operands.flatMap((x) => ("sort" in x ? [x.sort] : []));
    const entries: Table["entries"] = [];
    if (result && ranges.every((r) => r)) {
      const choices = o.operands.map((x, i) => ("literal" in x ? [-1] : indexIn(x.sort, ranges[i]!)));
      for (const pick of product(choices)) {
        const args = pick.map((k, i) => (k < 0 ? ranges[i]! : meet(classes.get((o.operands[i] as { sort: number }).sort)![k], ranges[i]!)!));
        const r = arith(o.op, args[0], args[1] ?? args[0]);
        const value = r && meet(r, result);
        if (!value) continue;
        const hits = indexIn(o.sort, value);
        if (exact && hits.length !== 1) throw new Error(`内部の誤り: 演算 ${o.op} の表が1つに決まりません`);
        entries.push({ args: pick.filter((k) => k >= 0), results: hits });
      }
    }
    const table: Table = { name: `op${n++}`, from, to: o.sort, entries };
    if (from.length === 1 && from[0] === o.sort && entries.length > 0 && entries.every((x) => x.results.length === 1)) {
      const d = entries[0].results[0] - entries[0].args[0];
      if (entries.every((x) => x.results[0] - x.args[0] === d)) table.shift = d;
    }
    tables.set(o.e, table);
  }
  const made = { classes, tables, exact };
  checkTables(made, sorts, bounds);
  return made;
}

function* product<T>(choices: T[][]): Generator<T[]> {
  if (choices.length === 0) {
    yield [];
    return;
  }
  for (const x of choices[0]) for (const rest of product(choices.slice(1))) yield [x, ...rest];
}

/** Cuts an operand so that the result no longer crosses into the next class; false when no cut can help. */
function refine(op: string, operands: ({ sort: number } | { literal: number })[], args: Interval[], crossings: number[], cut: (sort: number, p: number) => void, apart: (sort: number, x: Interval) => boolean): boolean {
  const sortAt = (i: number) => ("sort" in operands[i] ? (operands[i] as { sort: number }).sort : undefined);
  const [a, b] = [args[0], args[1]];
  const [sa, sb] = [sortAt(0), sortAt(1)];
  // a single value on one side: cut the other at the inverse image of each crossing
  const cutAt = (sort: number | undefined, ps: number[]) => {
    if (sort === undefined) return false;
    for (const p of ps) if (Number.isFinite(p)) cut(sort, p);
    return true;
  };
  if (op === "neg") return cutAt(sa, crossings.map((q) => -q + 1));
  if (op === "+" && b && singleton(b) && sa !== undefined) return cutAt(sa, crossings.map((q) => q - b[0]));
  if (op === "+" && b && singleton(a) && sb !== undefined) return cutAt(sb, crossings.map((q) => q - a[0]));
  if (op === "-" && b && singleton(b) && sa !== undefined) return cutAt(sa, crossings.map((q) => q + b[0]));
  if (op === "-" && b && singleton(a) && sb !== undefined) return cutAt(sb, crossings.map((q) => a[0] - q + 1));
  if (op === "*" && b && singleton(b) && b[0] !== 0 && sa !== undefined) return cutAt(sa, crossings.map((q) => (b[0] > 0 ? Math.ceil(q / b[0]) : Math.floor(q / b[0]) + 1)));
  if (op === "*" && b && singleton(a) && a[0] !== 0 && sb !== undefined) return cutAt(sb, crossings.map((q) => (a[0] > 0 ? Math.ceil(q / a[0]) : Math.floor(q / a[0]) + 1)));
  if (op === "div" && b && singleton(b) && b[0] > 0 && sa !== undefined) return cutAt(sa, crossings.map((q) => q * b[0]));
  // otherwise every value of a side apart (the smaller one first)
  const sides = [0, 1].filter((i) => sortAt(i) !== undefined && args[i] && !singleton(args[i])).sort((i, j) => size(args[i]) - size(args[j]));
  for (const i of sides) if (apart(sortAt(i)!, args[i])) return true;
  return false;
}

/**
 * Every table agrees with the oracle: for each entry, the operation evaluated by eval.ts on numbers of the operands'
 * classes (all of them, for classes of few numbers; the ends and a few more otherwise) gives a number of the result's
 * class, whenever it is a value the result can take.
 */
function checkTables(made: Classes, sorts: Sorts, bounds: Bounds): void {
  const samples = (x: Interval): number[] => {
    if (Number.isFinite(x[0]) && Number.isFinite(x[1]) && size(x) <= 16) return Array.from({ length: size(x) }, (_, i) => x[0] + i);
    // a class with no end at all is sampled around 0
    const lo = Number.isFinite(x[0]) ? x[0] : Number.isFinite(x[1]) ? x[1] - 20 : -20;
    const hi = Number.isFinite(x[1]) ? x[1] : Number.isFinite(x[0]) ? x[0] + 20 : 20;
    return [...new Set([lo, lo + 1, Math.floor((lo + hi) / 2), hi - 1, hi])].filter((v) => v >= x[0] && v <= x[1]);
  };
  for (const o of sorts.operations) {
    const table = made.tables.get(o.e);
    const result = bounds.node(o.e);
    if (!table || !result) continue;
    const ranges = o.operands.map((x, i) => ("literal" in x ? ([x.literal, x.literal] as Interval) : typeof o.e[i + 1] === "number" ? ([o.e[i + 1], o.e[i + 1]] as Interval) : bounds.node(o.e[i + 1] as object)!));
    for (const entry of table.entries) {
      let k = 0;
      const args = o.operands.map((x, i) => ("literal" in x ? ranges[i] : meet(made.classes.get(x.sort)![entry.args[k++]], ranges[i])!));
      const targets = entry.results.map((k) => made.classes.get(o.sort)![k]);
      for (const pick of product(args.map(samples))) {
        let v: unknown;
        try {
          v = evaluate([o.op, ...pick], {} as never);
        } catch {
          continue;
        }
        if (typeof v !== "number" || v < result[0] || v > result[1]) continue;
        if (!targets.some((target) => target[0] <= v && v <= target[1])) throw new Error(`内部の誤り: 演算 ${o.op} ${JSON.stringify(pick)} の表が仕様の計算 (${v}) と合いません`);
      }
    }
  }
}
