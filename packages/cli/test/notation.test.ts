import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { parseModule } from "../src/v1/syntax.ts";
import { compile } from "../src/v1/load.ts";
import { problemText } from "../src/v1/read.ts";
import { check8, checkExamples, selfCheck8 } from "../src/v1/pbt.ts";
import type { Adapter8 } from "../src/v1/pbt.ts";
import { compare8 } from "../src/v1/compare.ts";
import { readOut } from "../src/v1/ops.ts";
import { shapeProblems } from "../src/v1/shape.ts";
import { contract8, specView } from "../src/v1/generate.ts";
import { repoRoot } from "./support.ts";

// The 1.0 notation (DSL.md §17): reading, IR version 8, the oracle, the PBT and the comparison of interpretations.
// Alloy is not used here (alloy.test.ts writes its modules and runs it).
process.env.CLP_ALLOY = "off";

const lending = join(repoRoot, "examples/lending-ts/specs");
const tmp = join(import.meta.dirname, ".tmp-notation");
mkdirSync(tmp, { recursive: true });
after(() => rmSync(tmp, { recursive: true, force: true }));

/** A spec directory with the given files (the 1.0 vocabulary is imported as `@clp/core`). */
function specs(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmp, "s-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}
const problemsOf = (dir: string, component?: string) => compile(dir, component).problems.map(problemText);

const COUNTER = `import { init, is, service } from "@clp/core";
import type { Int } from "@clp/core";
export const Counter = service("数を数える。上限は 3。", {
  state: { count: init<Int>(0) },
  commands: {
    Add(by: Int) {
      if (is.full("上限を超える", this.count + by > 3)) return "full";
      this.count += by;
      return "added";
    },
  },
  queries: { Count() { return this.count; } },
});
`;

test("構文: 部分集合の外は、場所つきの誤りになる", () => {
  for (const [source, message] of [
    ["const x = () => { for (;;) {} };", /ループは書けません/],
    ["const x = () => { let a = 1; };", /let \/ var は書けません/],
    ["const x = () => { throw 1; };", /例外は書けません/],
    ["const x = /a/;", /正規表現は書けません/],
  ] as const) {
    assert.throws(() => parseModule(source, "spec.ts"), message);
  }
  const module = parseModule(COUNTER, "counter.ts");
  assert.deepEqual(module.imports.map((i) => i.from), ["@clp/core", "@clp/core"]);
});

test("読み取り: 本体は、上から順の場合ごとのイベントになる（ガードは互いに排他）", () => {
  const { ir, problems } = compile(specs({ "counter.component.ts": COUNTER }), "counter");
  assert.deepEqual(problems.map(problemText), []);
  const c = ir!.components.counter;
  assert.deepEqual(c.commands!.Add.events, ["Add.full", "Add.otherwise"]);
  assert.deepEqual(c.events!["Add.otherwise"].guard, ["not", ["cond", "full", { by: ["var", "by"] }]]);
  assert.deepEqual(c.events!["Add.otherwise"].assign, { count: ["+", ["state", "count"], ["var", "by"]] });
  assert.deepEqual(c.commands!.Add.output, { enum: ["full", "added"] });
  assert.deepEqual(ir!.entries, { commands: ["counter.Add"], queries: ["counter.Count"] });
  assert.deepEqual(shapeProblems(ir!), []);
  assert.equal(readOut(c.conditions!.full.is, "ja"), "this.count + by が 3 より大きい");
});

test("読み取り: 文が残る所、書き換え、見出しの違い、読み直しは誤り", () => {
  const dir = specs({
    "a.component.ts": `import { does, is, Map, service } from "@clp/core";
import type { Id } from "@clp/core";
export type K = Id<"キー">;
export const A = service("A", {
  state: { m: Map<K, K>(), note: "覚えること" },
  commands: {
    Put(k: K) {
      this.m.set(k, k);
      if (this.m.has(k)) return "again";
      return "ok";
    },
    Other(k: K) {
      if (is.known("知っている")) return "yes";
      does.remember("覚える");
      return "no";
    },
  },
  queries: { Q: "問い合わせ" },
});
`,
    "a.interpretation.ts": `import { interpretation } from "@clp/core";
import { A } from "./a.component.ts";
export const AI = interpretation(A, {
  commands: { Put(k: string) { return "x"; }, Q() { return 1; } },
});
`,
  });
  const found = problemsOf(dir, "a").join("\n");
  assert.match(found, /error\[read-after-write\] A\.commands\.Put/);
  assert.match(found, /error\[overwrite\] A\.commands\.Put/);
  assert.match(found, /error\[wrong-heading\] A\.commands\.Q/);
  assert.match(found, /error\[prose-left\] A\.state\.note/);
  assert.match(found, /error\[prose-left\] A\.commands\.Other: 「知っている」\(is\.known\)/);
  assert.match(found, /error\[prose-left\] A\.commands\.Other: 「覚える」\(does\.remember\)/);
  assert.match(found, /error\[stale-interpretation\] A/);
});

test("読み取り: 条件の場所の文は、式として読めない（文の分類）", () => {
  const dir = specs({
    "b.component.ts": `import { service } from "@clp/core";
export const B = service("B", { commands: { Go() { if ("まだ決めていない条件") return "a"; return "b"; } } });
`,
  });
  assert.match(problemsOf(dir).join("\n"), /error\[prose-in-expression\] B\.commands\.Go: 文「まだ決めていない条件」は、式の場所には書けません/);
});

test("図書館の例: 部品の木、仕様だけの実行、具体例", async () => {
  const { ir, problems } = compile(lending, "library");
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  assert.deepEqual(ir!.components.library.contains, ["fines", "members"]);
  assert.deepEqual(ir!.components.library.relies, ["clock"]);
  assert.deepEqual(ir!.entries.commands, ["library.Borrow", "library.Return", "fines.Pay", "members.Extend", "members.Register"]);
  assert.deepEqual(checkExamples(ir!), []);
  const checked = await selfCheck8(ir!, { seed: 1 });
  assert.equal(checked.ok, true);
  assert.match(contract8(ir!), /executeQuery\(query: Query\)/);
  assert.match(specView(ir!), /### Command `Borrow\(member: MemberId, book: BookId\)`/);
});

test("仕様だけの実行: どの場合にも当たらない、無いキーを読む、は仕様の誤り", async () => {
  const dir = specs({
    "c.component.ts": `import { Map, service } from "@clp/core";
import type { Id, Int } from "@clp/core";
export type K = Id<"キー">;
export const C = service("C", {
  state: { m: Map<K, Int>() },
  commands: { Read(k: K) { return this.m.get(k); } },
});
`,
  });
  const { ir } = compile(dir, "c");
  const checked = await selfCheck8(ir!, { seed: 1 });
  assert.equal(checked.ok, false);
  assert.match(checked.ok ? "" : checked.message, /Map にキー .* がありません/);
});

function counterAdapter(bug = false): Adapter8 {
  let count = 0;
  return {
    async setupIsolation() {
      count = 0;
    },
    async teardownIsolation() {},
    async executeCommand(command) {
      const by = command.input.by as number;
      if (count + by > (bug ? 4 : 3)) return "full";
      count += by;
      return "added";
    },
    async executeQuery() {
      return count;
    },
  };
}

test("PBT: 正しい実装は通り、しきい値の誤りは最短の反例で落ちる", async () => {
  const { ir } = compile(specs({ "counter.component.ts": COUNTER }), "counter");
  const pass = await check8(ir!, counterAdapter(), { seed: 1, numRuns: 300 });
  assert.equal(pass.status, "pass");
  const fail = await check8(ir!, counterAdapter(true), { seed: 1, numRuns: 300 });
  assert.equal(fail.status, "fail");
  if (fail.status === "fail") assert.ok(fail.steps.length <= 2, JSON.stringify(fail.steps));
});

test("PBT: 狙った手順（固定の手順）は、ランダムな手順の前に流れる", async () => {
  const { ir } = compile(specs({ "counter.component.ts": COUNTER }), "counter");
  const fail = await check8(ir!, counterAdapter(true), { seed: 1, numRuns: 1, traces: [{ event: "counter.Add.full", steps: [{ event: "Add", params: { by: 4 } }] }] });
  assert.equal(fail.status, "fail");
  if (fail.status === "fail") assert.equal(fail.path, "trace:counter.Add.full");
});

test("2つの解釈の比べ合い: 振る舞いの違う所を、コマンドと観点で報告する", async () => {
  const { ir: a } = compile(specs({ "counter.component.ts": COUNTER }), "counter");
  const { ir: b } = compile(specs({ "counter.component.ts": COUNTER.replace("> 3", ">= 3") }), "counter");
  const differences = await compare8(a!, b!, { seed: 1 });
  assert.deepEqual(differences.map((d) => `${d.command}:${d.aspect}`), ["Add:output", "Count:output"]);
});

const PHASES = `import { does, init, requires, service } from "@clp/core";
export const P = service("段階を進める", {
  state: { phase: init<"A" | "B" | "C">("A") },
  commands: {
    ToB() { requires(this.phase === "A"); const said = this.phase === "A" ? "from-a" : "elsewhere"; this.phase = "B"; return said; },
    ToC() { requires(this.phase === "B"); this.phase = "C"; return "c"; },
    Back() { requires(this.phase === "C"); this.phase = "A"; return "back"; },
  },
});
`;

test("読み取り: requires で決まる状態を問う条件は、その場で畳み込まれる（通らない枝の値は IR に残らない）", () => {
  const { ir, problems } = compile(specs({ "p.component.ts": PHASES }), "p");
  assert.deepEqual(problems.map(problemText), []);
  assert.deepEqual(ir!.components.p.events!["ToB.otherwise"].output, ["lit", "from-a"]);
});

test("PBT: 範囲外 (requires) のコマンドを引いた手は、実行できるほかのコマンドに回す（深い状態にも届く）", async () => {
  const { ir } = compile(specs({ "p.component.ts": PHASES }), "p");
  const checked = await selfCheck8(ir!, { seed: 1, numRuns: 50 });
  assert.equal(checked.ok, true);
  assert.ok(checked.ok && (checked.coverage.events["p.Back.otherwise"] ?? 0) > 0);
});

test("並びの文字列は join でつなぐ（いくつあっても）", async () => {
  const { ir, problems } = compile(specs({ "j.component.ts": `import { service } from "@clp/core";
export const J = service("J", { queries: { Joined(parts: string[]): string { return parts.join(" | "); } } });
` }), "j");
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  assert.deepEqual(ir!.components.j.queries!.Joined.is, ["join", ["var", "parts"], ["lit", " | "]]);
  assert.ok((await selfCheck8(ir!, { seed: 1 })).ok);
});
