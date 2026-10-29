import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ALLOY_SHA256, alloyJar, checkWithAlloy, emitAlloy, isPinnedJar, javaAvailable } from "../src/v1/alloy.ts";
import { checkEmbedding, intsOf, relevanceOf } from "../src/v1/abstraction.ts";
import type { Relevance } from "../src/v1/abstraction.ts";
import { compile, loadProgram } from "../src/v1/load.ts";
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
  assert.match(text, /var f_order_price: one s_num0/);
  assert.match(text, /fun next_num0: s_num0 -> s_num0/);
  assert.doesNotMatch(text, /10000|1000000/);
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
    const title = (what: string) => String(result.verdicts.find((v) => v.what === what)?.trace?.at(-1)?.params.title);
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
    // the result is cached under the module written
    assert.equal(readdir(join(cache, "clp", "alloy-results")).length, 1);
  } finally {
    for (const [key, value] of [["CLP_ALLOY_JAR", saved.jar], ["XDG_CACHE_HOME", saved.cache]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(cache, { recursive: true, force: true });
  }
});

const readdir = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);
