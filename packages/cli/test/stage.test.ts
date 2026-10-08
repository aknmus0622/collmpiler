import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { extract, payloadDiagnostics, referenceDiagnostics, referenceEvents } from "../src/extract.ts";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { references, stage1Payloads, stage1References } from "../src/stage1.ts";
import { implement } from "../src/loop.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import type { ImplementOptions } from "../src/loop.ts";
import { harness, repoRoot, specsDir } from "./support.ts";
import type { Script } from "./support.ts";

const { run } = harness("stage-loop");

// セルフホスト: フレームワークの一部（名前の検査）を、フレームワーク自身の仕様から生成したコード (Stage 1) で動かす。
// 手書きの版 (Stage 0) と、同じ結果になることを確かめる

const tmpRoot = join(import.meta.dirname, ".tmp-stage");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));
const selfSpecs = join(repoRoot, "packages/cli/self/specs");

// 宣言されていない状態と副作用への参照を、いろいろな場所に持つ仕様
function broken() {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { component, compose, from, goTo, input, interpretation, otherwise, when } from "@clp/core";
export const Thing = component({
  states: ["A", "B"],
  init: "A",
  effects: { Notify: input({}) },
  commands: {
    Place: compose(from("A", "Z"), when("It is big", goTo("Y")), otherwise(goTo("B"))),
    Back: compose(from("Q"), goTo("A")),
    Stay: compose(from("B")),
  },
});
export const Interpretation = interpretation(Thing, {
  structure: {
    commands: {
      Place: { when: { "It is big": { effects: [{ Notify: {} }, { Refund: {} }] }, otherwise: { effects: [{ Audit: {} }] } } },
      Back: { effects: [{ Refund: {} }] },
      Stay: {},
    },
  } as any,
  meanings: { conditions: { "It is big": () => true } } as any,
});
`,
  );
  return dir;
}

test("Stage 1: 生成したコードによる名前の検査は、手書きの版 (Stage 0) と同じ結果を、同じ順序で返す", async () => {
  const spec = await loadSpecs(broken());
  const stage0 = referenceDiagnostics(spec);
  assert.deepEqual(stage0, [
    { code: "unknown-state", command: "Back", caseName: "", subject: "Q" },
    { code: "unknown-effect", command: "Back", caseName: "otherwise", subject: "Refund" },
    { code: "unknown-state", command: "Place", caseName: "", subject: "Z" },
    { code: "unknown-state", command: "Place", caseName: "It is big", subject: "Y" },
    { code: "unknown-effect", command: "Place", caseName: "It is big", subject: "Refund" },
    { code: "unknown-effect", command: "Place", caseName: "otherwise", subject: "Audit" },
  ]);
  assert.deepEqual(await stage1References(spec), stage0);
  // 診断の全体（ほかの検査や、利用者向けの文面を含む）も一致する
  const viaStage1 = extract(spec, { references: (await stage1References(spec))! });
  assert.deepEqual(viaStage1, extract(spec));
  assert.deepEqual(viaStage1.diagnostics.filter((d) => d.code.startsWith("unknown-")).map((d) => d.message), [
    'from の "Q" は states にありません',
    '副作用 "Refund" は effects にありません',
    'from の "Z" は states にありません',
    'goTo の "Y" は states にありません',
    '副作用 "Refund" は effects にありません',
    '副作用 "Audit" は effects にありません',
  ]);
});

test("Stage 1: 誤りの無い仕様でも一致する（例の仕様と、フレームワーク自身の仕様）", async () => {
  for (const dir of [specsDir, selfSpecs]) {
    for (const component of await listComponents(dir)) {
      const spec = await loadSpecs(dir, { component });
      const stage1 = await stage1References(spec);
      assert.deepEqual(stage1, [], `${component}: Stage 1 が実行できること`);
      assert.deepEqual(stage1, referenceDiagnostics(spec));
      const payloads = await stage1Payloads(spec);
      assert.deepEqual(payloads, [], `${component}: ペイロードの検査も Stage 1 で実行できること`);
      assert.deepEqual(payloads, payloadDiagnostics(spec));
    }
  }
});

// 副作用のペイロードに、いろいろな合い方・合わなさを持つ仕様。effects は Place の副作用の列
function payloads(effects: string) {
  const dir = mkdtempSync(join(tmpRoot, "p-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { component, compose, decisionTable, description, goTo, input, interpretation, output, ref, typed } from "@clp/core";
const Size = decisionTable({ "It is big": { count: 10, urgent: true, label: "big", gap: null }, otherwise: { count: 1, urgent: false, label: "small", gap: 99 } });
export const Thing = component({
  states: ["A", "B"],
  init: "A",
  data: { memo: typed("string"), level: typed(["low", "high"]), wide: typed(["low", "high", "top"]), amount: typed("integer"), ratio: typed("number") },
  queries: { flag: output("boolean"), mode: output(["x", "y"]) },
  effects: {
    Notify: input({ text: "string", count: "integer" }),
    Grade: input({ level: ["low", "high"] }),
    Weigh: input({ grams: { type: "integer", min: 0, max: 10 }, ratio: { type: "number", min: 0.5 } }),
    Mark: input({ done: "boolean" }),
    Ping: input({}),
  },
  decisions: { size: Size },
  calculations: { title: compose(description("the memo, upper-cased"), output("string")) },
  commands: { Place: compose(input({ note: "string", n: "integer" }), goTo("B")) },
});
export const Interpretation = interpretation(Thing, {
  structure: { commands: { Place: { effects: [${effects}] } } } as any,
  meanings: { conditions: { "It is big": () => true }, calculations: { title: () => "t" } } as any,
});
`,
  );
  return dir;
}

test("Stage 1: ペイロードの検査は、手書きの版 (Stage 0) と同じ結果を返す（値そのもの、範囲、列挙の要素、参照の型）", async () => {
  // [副作用, Stage 0 が報告するはずのもの]。1つずつ、別の仕様として確かめる
  const cases: [string, string[]][] = [
    // 合っているもの
    [`{ Notify: { text: ref.input("note"), count: ref.decision("size", "count") } }`, []],
    [`{ Notify: { text: ref.data("level"), count: ref.input("n") } }`, []],                 // 列挙は文字列に入る
    [`{ Grade: { level: "low" } }, { Grade: { level: ref.data("level") } }, { Ping: {} }`, []],
    [`{ Weigh: { grams: 0, ratio: 0.5 } }, { Weigh: { grams: 10, ratio: 7 } }`, []],        // 範囲の端。整数は数値に入る
    [`{ Weigh: { grams: ref.data("amount"), ratio: ref.data("amount") } }`, []],            // 型だけの値は、範囲を見ない
    [`{ Mark: { done: ref.was("A") } }, { Mark: { done: ref.decision("size", "urgent") } }, { Mark: { done: ref.query("flag") } }`, []],
    [`{ Notify: { text: "x", count: ref.decision("size", "gap") } }`, []],                 // null のセルは見ない
    // 与えられていない、宣言されていない
    [`{ Notify: { text: "x" } }`, ["missing-field:0:count"]],
    [`{ Notify: {} }, { Ping: { extra: 1 } }`, ["missing-field:0:text", "missing-field:0:count", "bad-value:1:extra"]],
    // 値そのものが合わない
    [`{ Notify: { text: "x", count: 1.5 } }`, ["bad-value:0:count"]],
    [`{ Notify: { text: 1, count: "1" } }`, ["bad-value:0:text", "bad-value:0:count"]],
    [`{ Grade: { level: "top" } }`, ["bad-value:0:level"]],
    [`{ Mark: { done: "true" } }`, ["bad-value:0:done"]],
    // 範囲の外
    [`{ Weigh: { grams: 11, ratio: 1 } }, { Weigh: { grams: -1, ratio: 0.25 } }`, ["bad-value:0:grams", "bad-value:1:grams", "bad-value:1:ratio"]],
    // 決定表の列: 1つでも合わないセルがあれば、1回だけ報告する
    [`{ Notify: { text: "x", count: ref.decision("size", "urgent") } }`, ["bad-value:0:count"]],
    [`{ Grade: { level: ref.decision("size", "label") } }`, ["bad-value:0:level"]],
    [`{ Weigh: { grams: ref.decision("size", "count"), ratio: 1 } }`, []],
    [`{ Weigh: { grams: ref.decision("size", "gap"), ratio: 1 } }`, ["bad-value:0:grams"]],  // 99 は範囲の外
    // 参照の型が合わない
    [`{ Notify: { text: "x", count: ref.calculation("title") } }`, ["bad-value:0:count"]],
    [`{ Notify: { text: ref.input("n"), count: ref.data("ratio") } }`, ["bad-value:0:text", "bad-value:0:count"]],
    [`{ Grade: { level: ref.query("mode") } }, { Grade: { level: ref.data("wide") } }, { Grade: { level: ref.data("memo") } }`, ["bad-value:0:level", "bad-value:1:level", "bad-value:2:level"]],
    [`{ Mark: { done: ref.data("amount") } }, { Notify: { text: "x", count: ref.was("A") } }`, ["bad-value:0:done", "bad-value:1:count"]],
    // どこも指していない参照
    [`{ Notify: { text: ref.input("nota"), count: ref.decision("weight", "count") } }`, ["bad-value:0:text", "bad-value:0:count"]],
    // 宣言されていない副作用は、ここでは見ない（名前の検査が報告する）
    [`{ Refund: { amount: "lots" } }, { Notify: { text: "x" } }`, ["missing-field:1:count"]],
  ];
  for (const [effects, expected] of cases) {
    const spec = await loadSpecs(payloads(effects));
    const stage0 = payloadDiagnostics(spec);
    assert.deepEqual(stage0.map((d) => `${d.code}:${d.occurrence}:${d.field}`), expected, effects);
    assert.deepEqual(await stage1Payloads(spec), stage0, effects);
    // 診断の全体（文面を含む）も、どちらの Stage で動かしても同じ
    assert.deepEqual(extract(spec, await references(spec)), extract(spec), effects);
  }
});

test("Stage 1: 判断は、本当に生成したコードが行っている（差し替えると、結果が変わる）", async () => {
  // どの状態も宣言されていないと答える依存を渡すのではなく、すべての GoTo を報告する偽のアダプターに差し替える
  const dir = mkdtempSync(join(tmpRoot, "a-"));
  writeFileSync(
    join(dir, "fake.adapter.ts"),
    `let ports: any;
export const adapter = {
  async setupIsolation(given: any) { ports = given; },
  async teardownIsolation() {},
  async executeCommand(command: any) {
    if (command.name === "GoTo") ports.effects.ReportDiagnostic({ code: "unknown-state", command: "fake", caseName: "fake", subject: command.input.state });
  },
  async getCurrentState() { return "IDLE"; },
};
`,
  );
  const spec = await loadSpecs(specsDir);
  const goTos = [...referenceEvents(spec)].filter((event) => event.name === "GoTo").length;
  const found = await stage1References(spec, pathToFileURL(join(dir, "fake.adapter.ts")).href);
  assert.ok(goTos > 0);
  assert.equal(found?.length, goTos);
});

test("Stage 1: 読み込めない・実行できないときは、Stage 0 に落ちる。CLP_STAGE=0 で Stage 0 に固定できる", async () => {
  const spec = await loadSpecs(broken());
  // 生成したコードが無い
  assert.equal(await stage1References(spec, pathToFileURL(join(tmpRoot, "missing.adapter.ts")).href), undefined);
  // 生成したコードが、実行中に落ちる
  const dir = mkdtempSync(join(tmpRoot, "a-"));
  writeFileSync(join(dir, "crash.adapter.ts"), `export const adapter = { async setupIsolation() { throw new Error("not implemented"); }, async teardownIsolation() {}, async executeCommand() {}, async getCurrentState() { return "IDLE"; } };\n`);
  assert.equal(await stage1References(spec, pathToFileURL(join(dir, "crash.adapter.ts")).href), undefined);

  // 入口 (compile) の出力は、どちらの Stage でも同じ
  const dirOf = broken();
  const run = (env: NodeJS.ProcessEnv) =>
    spawnSync(process.execPath, [join(repoRoot, "packages/cli/src/compile.ts"), dirOf], { encoding: "utf8", env: { ...process.env, ...env } });
  const stage1 = run({ CLP_STAGE: "" });
  const stage0 = run({ CLP_STAGE: "0" });
  const errors = (text: string) => text.split("\n").filter((line) => line.startsWith("error["));
  assert.equal(stage1.status, 1);
  assert.ok(errors(stage1.stderr).length >= 6);
  assert.deepEqual(errors(stage1.stderr), errors(stage0.stderr));
  assert.equal(stage1.stdout, stage0.stdout);
  assert.doesNotMatch(stage1.stderr, /Stage 0 \(手書き\) で続けます/);
});

test("自分自身の検証: 自分の生成物の上で動くフレームワークが、自分のコンポーネントを採点し直して、合格する", async () => {
  // 写しを採点する（採点はファイルを一時的に書き換えるので、ほかのテストが読んでいる本物には触れない）。
  // 採点に使うフレームワークは、本物の packages/cli/self の上で動いている
  const self = join(repoRoot, "packages/cli/self");
  const copy = mkdtempSync(join(tmpRoot, "self-"));
  cpSync(self, copy, { recursive: true });
  const called: string[] = [];
  const strategy: ImplementationStrategy = { name: "nobody", run: ({ phase }) => void called.push(phase) };

  const result = await implement({ specs: join(copy, "specs"), out: copy, strategy, runs: 200 });

  // どのコンポーネントも、いまのコードのままで合格する。エージェントは呼ばれない
  assert.equal(result.status, "pass");
  assert.deepEqual(called, []);
  assert.deepEqual(result.attempts.map((a) => `${a.component}:${a.phase}:${a.attempt}:${a.feedback?.kind ?? "ok"}`), [
    "payload-check:implementation:0:ok",
    "pipeline:implementation:0:ok",
    "reference-check:implementation:0:ok",
  ]);
  // ミューテーションのゲートも通っている（壊した範囲は、それぞれが使うコードだけ）
  for (const attempt of result.attempts) assert.ok((attempt.mutation?.killed ?? 0) > 0, `${attempt.component}: ${JSON.stringify(attempt.mutation)}`);
  // 決定的な生成物（IR、契約、テストの入口）は、作り直しても、置いてあるものとバイト一致する
  for (const name of readdirSync(join(self, "clp")).filter((file) => !file.endsWith(".adapter.ts"))) {
    assert.equal(readFileSync(join(copy, "clp", name), "utf8"), readFileSync(join(self, "clp", name), "utf8"), name);
  }
  // 本番コードとアダプターは、採点のあとも変わっていない
  for (const dir of ["src", "clp"]) {
    for (const name of readdirSync(join(self, dir))) assert.equal(readFileSync(join(copy, dir, name), "utf8"), readFileSync(join(self, dir, name), "utf8"), name);
  }
});

// --- パイプライン: 段階の進め方を、生成した状態機械 (Stage 1) が決める ---

// 同じ筋書きを、Stage 0 に固定した場合と、既定 (Stage 1) とで実行する
async function both(script: Script, options: Partial<ImplementOptions> = {}) {
  const trail = (result: Awaited<ReturnType<typeof run>>) => ({
    status: result.status,
    attempts: result.attempts.map((a) => `${a.round}:${a.phase}:${a.attempt}:${a.feedback?.kind ?? "ok"}`),
    seen: result.seen.map((s) => s.phase),
  });
  const previous = process.env.CLP_STAGE;
  try {
    process.env.CLP_STAGE = "0";
    const stage0 = await run(script, options);
    delete process.env.CLP_STAGE;
    const stage1 = await run(script, options);
    return { stage0: trail(stage0), stage1: trail(stage1), stages: [stage0.stages, stage1.stages] };
  } finally {
    if (previous === undefined) delete process.env.CLP_STAGE;
    else process.env.CLP_STAGE = previous;
  }
}

test("パイプライン: 生成した状態機械は、手書きの手続き (Stage 0) と同じ順に、同じ段階を動かす", async () => {
  // すべて1回目で通る
  const clean = await both({}, { mutation: null });
  assert.deepEqual(clean.stages, [{ order: 0 }, { order: 1 }]);
  assert.deepEqual(clean.stage1, clean.stage0);
  assert.deepEqual(clean.stage1.attempts, ["1:design:1:ok", "1:wiring:1:ok", "1:implementation:1:ok"]);

  // 同じ段階の中での差し戻し
  const retried = await both({ design: ["crashing", "correct"], implementation: ["buggy", "correct"] }, { mutation: null });
  assert.deepEqual(retried.stage1, retried.stage0);
  assert.deepEqual(retried.stage1.attempts, ["1:design:1:crash", "1:design:2:ok", "1:wiring:1:ok", "1:implementation:1:pbt", "1:implementation:2:ok"]);
});

test("パイプライン: 上限回数まで直らなければ設計からやり直し、周回も尽きたら失敗で終わる (Stage 0 と一致)", async () => {
  // 1周目の実装が直らず、2周目で通る
  const restarted = await both({ implementation: ["buggy", "correct"] }, { mutation: null, maxAttempts: 1, maxRounds: 2 });
  assert.deepEqual(restarted.stage1, restarted.stage0);
  assert.deepEqual(restarted.stage1.attempts, [
    "1:design:1:ok", "1:wiring:1:ok", "1:implementation:1:pbt",
    "2:design:1:ok", "2:wiring:1:ok", "2:implementation:1:ok",
  ]);
  // 周回が尽きる
  const failed = await both({ implementation: ["buggy"] }, { mutation: null, maxAttempts: 2, maxRounds: 2 });
  assert.deepEqual(failed.stage1, failed.stage0);
  assert.equal(failed.stage1.status, "fail");
  assert.equal(failed.stage1.attempts.length, 8);
});

test("パイプライン: 仕様に無い指定 (--from、範囲の外の回数) は、Stage 0 が決める", async () => {
  const from = await run({}, { mutation: null, from: "design" });
  assert.deepEqual(from.stages, { order: 0 });
  const many = await run({}, { mutation: null, maxAttempts: 4 });
  assert.deepEqual(many.stages, { order: 0 });
  assert.equal(many.status, "pass");
});
