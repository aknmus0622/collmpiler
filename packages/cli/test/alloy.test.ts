import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ALLOY_SHA256, alloyJar, atomsNeeded, checkWithAlloy, emitAlloy, isPinnedJar, javaAvailable, replays } from "../src/v1/alloy.ts";
import { checkEmbedding, intsOf, relevanceOf } from "../src/v1/abstraction.ts";
import type { Relevance } from "../src/v1/abstraction.ts";
import { compile, loadProgram } from "../src/v1/load.ts";
import { layer1Hash } from "../src/v1/stamp.ts";
import { problemText } from "../src/v1/read.ts";
import { boundsOf } from "../src/v1/bounds.ts";
import { MAX_STEPS, Simulation, sequences } from "../src/v1/pbt.ts";
import { VMap, VSet } from "../src/v1/eval.ts";
import type { World } from "../src/v1/eval.ts";
import type { Type } from "../src/v1/ir.ts";
import fc from "fast-check";
import { repoRoot } from "./support.ts";

// The Alloy checker (DSL.md §17.20). What is written for Alloy is compared with the expected modules, so a change in
// how the IR is written shows here without Java; Alloy itself runs on one small component when Java and the jar are
// at hand. After an intended change: CLP_UPDATE_ALLOY=1 node --test packages/cli/test/alloy.test.ts, then read the diff.

const EXPECTED = join(import.meta.dirname, "fixtures/alloy");
const update = process.env.CLP_UPDATE_ALLOY === "1";
const SPECS = ["examples/checkout-ts/specs", "examples/library-ts/specs", "examples/lending-ts/specs", "examples/todo-ts/specs", "examples/todo-db-ts/specs", "packages/cli/self/specs"];
const label = (dir: string) => (dir.startsWith("packages/cli/self") ? "self" : dir.split("/")[1]);

function expect(file: string, actual: string) {
  const path = join(EXPECTED, file);
  if (update) {
    mkdirSync(EXPECTED, { recursive: true });
    writeFileSync(path, actual);
    return;
  }
  assert.ok(existsSync(path), `${file} がありません (CLP_UPDATE_ALLOY=1 で作る)`);
  assert.equal(actual, readFileSync(path, "utf8"), `${file} が変わりました (意図した変更なら CLP_UPDATE_ALLOY=1 で更新する)`);
}

test("Alloy: 例と self の部品ごとに、何を確かめるか (飛ばす理由、命令の数) と、書き出す模型", () => {
  const lines: string[] = [];
  for (const dir of SPECS) {
    for (const component of loadProgram(join(repoRoot, dir)).components) {
      const { ir } = compile(join(repoRoot, dir), component);
      assert.ok(ir, `${dir} ${component}`);
      const emitted = emitAlloy(ir);
      const kinds = Object.entries(emitted.commands.reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {}))
        .sort()
        .map(([k, n]) => `${k} ${n}`)
        .join(", ");
      lines.push(`${label(dir)} ${component}: commands: ${kinds || "none"}${emitted.skipped.length ? `; skipped: ${emitted.skipped.join(" / ")}` : ""}`);
      if (emitted.commands.length > 0) expect(`${label(dir)}-${component}.als`, emitted.text);
    }
  }
  expect("coverage.txt", `${lines.join("\n")}\n`);
});

const relevance = (numbers: number[], arithmetic: string[] = []): Relevance => ({
  fields: new Set(),
  outputs: new Set(),
  asked: new Set(),
  numbers: new Set(numbers),
  arithmetic,
  counting: [],
  literalsAt: new WeakMap(),
  arithmeticAt: new Set(),
});

test("Alloy の数の範囲 (DSL.md §17.21): 仕様を実行して状態に入る数は、どれも bounds.ts が読んだ範囲に入る", () => {
  // the numbers a value of a type holds, with the place each is at (`.field`, `.#elem`, `.#k`, `.#v`)
  const numbersIn = (name: string, t: Type, v: unknown, out: [string, number][]) => {
    if (v === null || v === undefined) return;
    if (t === "int" || (typeof t === "object" && "enum" in t)) {
      if (typeof v === "number") out.push([name, v]);
      return;
    }
    if (typeof t !== "object") return;
    if ("optional" in t) return numbersIn(name, t.optional, v, out);
    if ("record" in t) for (const [k, kt] of Object.entries(t.record)) numbersIn(`${name}.${k}`, kt, (v as Record<string, unknown>)[k], out);
    if ("list" in t) for (const x of v as unknown[]) numbersIn(`${name}.#elem`, t.list, x, out);
    if ("set" in t) for (const x of (v as VSet).values()) numbersIn(`${name}.#elem`, t.set, x, out);
    if ("map" in t) {
      for (const [k, x] of (v as VMap).pairs()) {
        numbersIn(`${name}.#k`, t.map[0], k, out);
        numbersIn(`${name}.#v`, t.map[1], x, out);
      }
    }
  };
  let checked = 0;
  for (const dir of SPECS) {
    for (const component of loadProgram(join(repoRoot, dir)).components) {
      const { ir } = compile(join(repoRoot, dir), component);
      assert.ok(ir);
      const bounds = boundsOf(ir, MAX_STEPS);
      for (const raw of fc.sample(sequences(ir), { numRuns: 150, seed: 7 })) {
        const sim = new Simulation(ir);
        for (const step of raw) {
          try {
            sim.step(step);
          } catch {
            break;
          }
          const world = (sim as unknown as { world: World }).world;
          const found: [string, number][] = [];
          for (const [id, state] of Object.entries(world)) {
            for (const [f, t] of Object.entries(ir.components[id].state ?? {})) numbersIn(`state:${id}.${f}`, t, state[f], found);
          }
          for (const [place, n] of found) {
            const range = bounds.place(place);
            assert.ok(range, `${component}: ${place} に範囲がありません (値 ${n})`);
            assert.ok(range[0] <= n && n <= range[1], `${component}: ${place} の値 ${n} が範囲 [${range}] の外です (${sim.steps.map((s) => s.name).join(" → ")})`);
            checked++;
          }
        }
      }
    }
  }
  assert.ok(checked > 1000, `確かめた値が少なすぎます (${checked})`);
});

test("Alloy の数: 比べるだけの大きな数は、順序を保った小さな数に置き換え、戻すと同じ値になる", () => {
  const ints = intsOf(relevance([0, 9999, 10000, 1000000]));
  assert.ok(!("reason" in ints));
  assert.ok(ints.embedded && ints.bitwidth <= 7);
  // 0 の近く (±8) はそのまま。9999 と 10000 の間には整数が無いので、Alloy でも間に値を置かない。ほかの定数の間には、1 つ置く
  const [a, b, c, d] = [0, 9999, 10000, 1000000].map((n) => ints.toAlloy(n)!);
  assert.equal(a, 0);
  assert.deepEqual([b - 8, c - b, d - c], [2, 1, 2]);
  assert.equal(ints.concrete(a + 1), 1);
  assert.equal(ints.concrete(c + 1), 10001);
  assert.equal(ints.concrete(a - 3), -3);
  // 数を数えた結果 (原子の数を超えない) は、0 の近くの定数とそのまま比べられる
  assert.equal(ints.concrete(5), 5);
  // 計算に使われる数は置き換えない
  assert.match((intsOf(relevance([0, 10000], ["*"])) as { reason: string }).reason, /計算 \(\*\)/);
  // 収まる数は、そのまま
  assert.equal((intsOf(relevance([0, 30])) as { embedded: boolean }).embedded, false);
  // 順序を保たない置き換えは、作った時点で分かる
  assert.throws(() => checkEmbedding({ bitwidth: 4, embedded: true, toAlloy: (n) => n, concrete: (v) => (v === 2 ? 0 : v) }, [0]), /順序を保ちません/);
});

test("Alloy に渡すもの: 答えと外の世界にしか流れない計算は捨てる (checkout の請求額)", () => {
  const { ir } = compile(join(repoRoot, "examples/checkout-ts/specs"), "order");
  const found = relevanceOf(ir!);
  assert.ok(found.fields.has("order.price") && found.fields.has("order.status"));
  assert.ok(!found.fields.has("order.amountPaid"));
  assert.deepEqual(found.arithmetic, []);
  // 比べるだけの値段は、Alloy の数ではなく、定数の順に並べた原子の鎖になる (大きな数は模型に残らない)
  const { text } = emitAlloy(ir!);
  const chain = /var f_order_price: one s_(num\d+)/.exec(text)?.[1];
  assert.ok(chain, text);
  assert.match(text, new RegExp(`fun next_${chain}: s_${chain} -> s_${chain}`));
  assert.doesNotMatch(text, /10000|1000000/);
});

// --- Int をなくす (DSL.md §17.21) ---

const tmp = join(import.meta.dirname, ".tmp-alloy");
mkdirSync(tmp, { recursive: true });
after(() => rmSync(tmp, { recursive: true, force: true }));
function specs(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmp, "s-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
/** The declarations and computations of numbers the module writes as Alloy's integers. */
const intsIn = (text: string) => [...text.matchAll(/[:>] *(?:lone |one |set )?Int\b|plus\[|minus\[|mul\[|div\[|rem\[/g)].length;

test("Alloy の数: どの部品の模型にも Alloy の整数が残らない (比べる・足す・時計・変数どうしの計算は、類の鎖とその表)", () => {
  const left: string[] = [];
  for (const dir of SPECS) {
    for (const component of loadProgram(join(repoRoot, dir)).components) {
      const { ir } = compile(join(repoRoot, dir), component);
      const emitted = emitAlloy(ir!);
      if (intsIn(emitted.text) > 0) left.push(`${component} (${emitted.notes?.join(" / ") ?? ""})`);
    }
  }
  assert.deepEqual(left, []);
  // 試行回数の +1 は鎖に沿った next、時計は今からのずれ、延滞料の和は表 (fun)
  const flow = emitAlloy(compile(join(repoRoot, "packages/cli/self/specs"), "mutation-verdict").ir!).text;
  assert.match(flow, /f_mutation_verdict_extra' = .*\(\(c_mutation_verdict\.f_mutation_verdict_extra\)\.next_num0\)/);
  const library = emitAlloy(compile(join(repoRoot, "examples/lending-ts/specs"), "library").ir!);
  assert.match(library.text, /var env_clock___tick: one s_num\d+/);
  assert.doesNotMatch(library.text, /env_clock_Today/);
  assert.ok(!library.approximate);
  // library-ts の残り日数 (残り − 日数) は類に分けきれず、既定の pred で過大近似になる
  const loan = emitAlloy(compile(join(repoRoot, "examples/library-ts/specs"), "loan").ir!);
  assert.ok(loan.approximate);
  assert.match(loan.text, /one sig Choice \{ var ch_op_/);
});

test("Alloy の数: analysis で fun を指定すると、類に分けきれない数は Alloy の整数で確かめ、そう知らせる", () => {
  const { ir } = compile(join(repoRoot, "examples/library-ts/specs"), "loan");
  ir!.components.loan.analysis = { operations: "fun" };
  const emitted = emitAlloy(ir!);
  assert.ok(!emitted.approximate);
  assert.ok(intsIn(emitted.text) > 0);
  assert.match(emitted.notes!.join("\n"), /fun を指定した数を類に分けきれず、Alloy の整数で確かめます/);
});

const DAYS = `import { classes, init, requires, service } from "@clp/core";
import type { Int } from "@clp/core";
export type Days = Int;
export const Stock = service("在庫の日数", {
  state: { left: init<Days>(10), used: init<{ total: Days }>({ total: 0 }) },
  commands: {
    Use(days: Days) {
      requires(days >= 1 && days <= 2);
      this.left = this.left - days;
    },
  },
  ANALYSIS
});
`;

test("analysis (DSL.md §17.21): Layer 1 の operations と classes<T> は、型 T の状態と引数の場所として IR に入る。解釈は Layer 1 が書いていないときだけ書ける", () => {
  const written = specs({ "stock.component.ts": DAYS.replace("ANALYSIS", 'analysis: { operations: "fun", classes: [classes<Days>([0, -3], { operations: "pred" })] },') });
  const { ir, problems } = compile(written, "stock");
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  assert.deepEqual(ir!.components.stock.analysis, {
    operations: "fun",
    classes: [{ type: "Days", places: ["param:stock.Use.days", "state:stock.left", "state:stock.used.total"], points: [0, -3], operations: "pred" }],
  });
  // 書き方の誤り
  const wrong = specs({ "stock.component.ts": DAYS.replace("ANALYSIS", 'analysis: { operations: "exact" },') });
  assert.match(compile(wrong, "stock").problems.map(problemText).join("\n"), /error\[syntax\] Stock\.analysis/);
  // Layer 1 が書いたものを解釈は書き換えられない。書いていなければ、解釈が補える
  const interpretation = `import { interpretation } from "@clp/core";
import { Stock } from "./stock.component.ts";
export const StockInterpretation = interpretation(Stock, { analysis: { operations: "pred" } });
`;
  const both = specs({ "stock.component.ts": DAYS.replace("ANALYSIS", 'analysis: { operations: "fun" },'), "stock.interpretation.ts": interpretation });
  assert.match(compile(both, "stock").problems.map(problemText).join("\n"), /error\[overwrite\] Stock\.analysis/);
  const filled = specs({ "stock.component.ts": DAYS.replace("ANALYSIS", ""), "stock.interpretation.ts": interpretation });
  assert.deepEqual(compile(filled, "stock").ir?.components.stock.analysis, { operations: "pred" });
  // 意味を変えない設定なので、Layer 1 の印 (stamp) は変わらない
  const hash = (dir: string) => {
    const { program } = loadProgram(dir);
    return layer1Hash(program.units.find((u) => u.id === "stock")!, program);
  };
  assert.equal(hash(written), hash(specs({ "stock.component.ts": DAYS.replace("ANALYSIS", "") })));
});

test("Alloy を実際に動かす: 反例は仕様で実行してから報告する。わざと誤りを入れた性質の反例は、仕様でも再現する (DSL.md §17.21 段4)", (t) => {
  const jar = process.env.CLP_ALLOY_JAR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-6.2.0.jar");
  if (!javaAvailable() || !existsSync(jar)) return t.skip("Java か Alloy の jar がありません");
  // 残りは 0 を下回らない、と書いたが、使う日数の上限を確かめていない
  const broken = specs({
    "stock.component.ts": DAYS.replace("ANALYSIS", "").replace(
      "  commands: {",
      "  rules: { neverNegative() { return always(() => this.left >= 0); } },\n  commands: {",
    ).replace('import { classes, init, requires, service } from "@clp/core";', 'import { always, init, requires, service } from "@clp/core";').replace("init<Days>(10)", "init<Days>(3)"),
  });
  const { ir, problems } = compile(broken, "stock");
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  const saved = process.env.CLP_ALLOY_JAR;
  process.env.CLP_ALLOY_JAR = jar;
  try {
    const result = checkWithAlloy(ir!);
    const property = result.verdicts.find((v) => v.kind === "property")!;
    assert.equal(property.status, "broken");
    assert.equal(property.replayed, true);
    // 最後の手順を除くと、仕様では誤りに至らない
    assert.equal(replays(ir!, "property", property.trace!.slice(0, -1)), false);
    // 届く問いの手順も、仕様で実行すると、そのイベントに至る
    for (const v of result.verdicts.filter((x) => x.kind === "reach" && x.status === "reached")) assert.equal(v.replayed, true, v.what);
  } finally {
    if (saved === undefined) delete process.env.CLP_ALLOY_JAR;
    else process.env.CLP_ALLOY_JAR = saved;
  }
});

test("Alloy の原子の数: 一度に比べうる値の数 (1つの入力の引数 + 問いが量化する変数 + 1) が範囲より多ければ、その種類だけ増やす", () => {
  // text-plan の問い合わせ Notes は文字列を 4 つ取る: 文字列の原子は 5 個要る (範囲の 3 より多い)
  const { ir } = compile(join(repoRoot, "packages/cli/self/specs"), "text-plan");
  const notes = emitAlloy(ir!).commands.find((c) => c.what.startsWith("text-plan.Notes"))!;
  assert.equal(atomsNeeded(ir!, notes).Str, 5);
});

test("Alloy の原子の数: 上限と比べて数える種類は、上限ぶんと入力のぶんだけ増やす (届くのに範囲が足りない問いを、広げて探し直さない)", () => {
  const { ir } = compile(join(repoRoot, "examples/lending-ts/specs"), "library");
  const { commands } = emitAlloy(ir!);
  const limit = commands.find((c) => c.kind === "reach" && c.event === "library.Borrow.atLimit");
  assert.ok(limit);
  assert.equal(atomsNeeded(ir!, limit).s_BookId, 4);
  const other = commands.find((c) => c.kind === "reach" && c.event === "library.Return.case1");
  assert.ok(other);
  assert.notEqual(atomsNeeded(ir!, other).s_BookId, 4);
});

test("Alloy の jar: 固定したハッシュと違う jar は、その jar と分かる。CLP_ALLOY_JAR はそのまま使う (違えば警告)", () => {
  const dir = mkdtempSync(join(tmpdir(), "clp-jar-"));
  try {
    const fake = join(dir, "fake.jar");
    writeFileSync(fake, "not alloy");
    assert.equal(isPinnedJar(fake), false);
    const before = process.env.CLP_ALLOY_JAR;
    process.env.CLP_ALLOY_JAR = fake;
    try {
      assert.equal(alloyJar(), fake);
    } finally {
      if (before === undefined) delete process.env.CLP_ALLOY_JAR;
      else process.env.CLP_ALLOY_JAR = before;
    }
    assert.match(ALLOY_SHA256, /^[0-9a-f]{64}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Alloy を実際に動かす: 問い合わせだけの部品は、答えのどの場合にも当たる入力があることを、すべての入力で確かめる", (t) => {
  const jar = process.env.CLP_ALLOY_JAR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-6.2.0.jar");
  if (!javaAvailable() || !existsSync(jar)) return t.skip("Java か Alloy の jar がありません");
  const { ir } = compile(join(repoRoot, "packages/cli/self/specs"), "checker-verdict");
  const saved = process.env.CLP_ALLOY_JAR;
  process.env.CLP_ALLOY_JAR = jar;
  try {
    const result = checkWithAlloy(ir!);
    assert.equal(result.verdicts.length, 6);
    for (const verdict of result.verdicts) assert.deepEqual([verdict.kind, verdict.status, verdict.bound], ["reach", "reached", "exhaustive"], verdict.what);
  } finally {
    if (saved === undefined) delete process.env.CLP_ALLOY_JAR;
    else process.env.CLP_ALLOY_JAR = saved;
  }
});

test("Alloy を実際に動かす: 並びと文字列の長さ。100 文字の境目の両側の手順が、その長さの文字列で戻る (todo)", (t) => {
  const jar = process.env.CLP_ALLOY_JAR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-6.2.0.jar");
  if (!javaAvailable() || !existsSync(jar)) return t.skip("Java か Alloy の jar がありません");
  const { ir } = compile(join(repoRoot, "examples/todo-ts/specs"), "todos");
  const saved = process.env.CLP_ALLOY_JAR;
  process.env.CLP_ALLOY_JAR = jar;
  try {
    const result = checkWithAlloy(ir!);
    assert.deepEqual(result.skipped ?? [], []);
    for (const verdict of result.verdicts) assert.ok(verdict.status === "holds" || verdict.status === "reached", JSON.stringify(verdict));
    // the title of the step that reaches the case (a trace may go on after it)
    const title = (what: string) => String(result.verdicts.find((v) => v.what === what)?.trace?.findLast((step) => step.event === "Add")?.params.title);
    assert.ok(title("todos.Add.case2").length > 100 && title("todos.Add.case2").trim() !== "");
    assert.ok(title("todos.Add.otherwise").length <= 100 && title("todos.Add.otherwise").trim() !== "");
    assert.equal(title("todos.Add.case1").trim(), "");
  } finally {
    if (saved === undefined) delete process.env.CLP_ALLOY_JAR;
    else process.env.CLP_ALLOY_JAR = saved;
  }
});

test("Alloy を実際に動かす: lending の会員 (到達の検査 3 つ)", (t) => {
  const jar = process.env.CLP_ALLOY_JAR ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "clp", "alloy-6.2.0.jar");
  if (!javaAvailable() || !existsSync(jar)) return t.skip("Java か Alloy の jar がありません");
  const { ir } = compile(join(repoRoot, "examples/lending-ts/specs"), "members");
  const cache = mkdtempSync(join(tmpdir(), "clp-alloy-cache-"));
  const saved = { jar: process.env.CLP_ALLOY_JAR, cache: process.env.XDG_CACHE_HOME };
  process.env.CLP_ALLOY_JAR = jar;
  process.env.XDG_CACHE_HOME = cache;
  try {
    const result = checkWithAlloy(ir!);
    assert.deepEqual(result.skipped ?? [], []);
    assert.equal(result.verdicts.length, 3);
    for (const verdict of result.verdicts) assert.equal(verdict.status, "reached", JSON.stringify(verdict));
    // each answer is cached under its question and the module it ran in (with each module's question whether it has a trace)
    assert.ok(readdir(join(cache, "clp", "alloy-results")).length >= 3);
  } finally {
    for (const [key, value] of [["CLP_ALLOY_JAR", saved.jar], ["XDG_CACHE_HOME", saved.cache]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(cache, { recursive: true, force: true });
  }
});

const readdir = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);
