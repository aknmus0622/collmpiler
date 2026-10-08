import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { extract, payloadDiagnostics, referenceDiagnostics, referenceEvents, serialize, stableStringify, valuesToWrite } from "../src/extract.ts";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { references, stage1Payloads, stage1References, stage1Values } from "../src/stage1.ts";
import { implement } from "../src/loop.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import { staleness } from "../src/verified.ts";
import type { ImplementOptions } from "../src/loop.ts";
import { harness, repoRoot, specsDir, unstamped } from "./support.ts";
import type { Script } from "./support.ts";

const { run, workdir, scripted } = harness("stage-loop");

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
      // 値の直列化: IR が、どちらの Stage で作ってもバイト一致する
      assert.ok(await stage1Values(spec), `${component}: 値の直列化も Stage 1 で実行できること`);
      assert.equal(stableStringify(extract(spec, await references(spec)).ir), stableStringify(extract(spec).ir));
    }
  }
});

test("Stage 1: 値の直列化は、手書きの版 (Stage 0) と同じものを書く（定数、参照、決定表の列、実行前の状態）", async () => {
  // 名前に、区切りに使う文字（コロン、ドット）や空白を含む値も混ぜる
  const dir = mkdtempSync(join(tmpRoot, "v-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { asks, component, compose, decisionTable, description, goTo, input, interpretation, output, ref, typed } from "@clp/core";
const Size = decisionTable({ "It is big": { "count.max": 10, urgent: true }, otherwise: { "count.max": 1, urgent: false } });
export const Thing = component({
  states: ["A", "B", "C D"],
  init: "A",
  data: { memo: typed("string"), total: typed("number"), on: typed("boolean") },
  queries: { flag: output("boolean"), lookUp: compose(input({ key: "string", depth: "integer" }), output("string")) },
  effects: { Notify: input({ text: "string", count: "integer", ratio: "number", sure: "boolean" }), Ping: input({}) },
  decisions: { "the size": Size },
  calculations: { "sum:all": compose(description("the total"), output("integer")) },
  commands: { Place: compose(input({ note: "string", n: "integer" }), goTo("B")), Back: compose(goTo("A")) },
});
export const Interpretation = interpretation(Thing, {
  structure: {
    commands: {
      Place: {
        asks: { found: { lookUp: { key: ref.input("note"), depth: 3 } }, again: { lookUp: { key: "a:b.c", depth: ref.input("n") } } },
        set: { memo: ref.query("found"), total: -0.5, on: false },
        effects: [
          { Notify: { text: "", count: ref.decision("the size", "count.max"), ratio: 1e21, sure: ref.decision("the size", "urgent") }, when: ref.was("A", "C D") },
          { Notify: { text: ref.data("memo"), count: ref.calculation("sum:all"), ratio: ref.data("total"), sure: true }, when: ref.query("flag") },
          { Ping: {}, when: "It is big" },
        ],
      },
      Back: { effects: [{ Ping: {}, when: ref.was() }], set: { memo: " spaced  text " } },
    },
  } as any,
  meanings: { conditions: { "It is big": () => true }, calculations: { "sum:all": () => 1 } } as any,
});
`,
  );
  const spec = await loadSpecs(dir);
  const stage0 = new Map([...valuesToWrite(spec)].map(([slot, value]) => [slot, serialize(value)]));
  assert.equal(stage0.size, 19);
  assert.deepEqual(stage0.get("Place|otherwise|effects|0|count"), { $ref: "decision:the size.count.max" });
  assert.deepEqual(stage0.get("Place|otherwise|effects|0|when"), { $was: ["A", "C D"] });
  assert.deepEqual(stage0.get("Back|otherwise|effects|0|when"), { $was: [] });
  assert.deepEqual(await stage1Values(spec), stage0);
  // IR の全体が、バイト一致する
  assert.equal(stableStringify(extract(spec, await references(spec)).ir), stableStringify(extract(spec).ir));
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
    spawnSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), "compile", dirOf], { encoding: "utf8", env: { ...process.env, ...env } });
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
    "value-writer:implementation:0:ok",
  ]);
  // ミューテーションのゲートも通っている（壊した範囲は、それぞれが使うコードだけ）
  for (const attempt of result.attempts) assert.ok((attempt.mutation?.killed ?? 0) > 0, `${attempt.component}: ${JSON.stringify(attempt.mutation)}`);
  // 決定的な生成物（IR、契約、テストの入口）は、作り直しても、置いてあるものとバイト一致する
  for (const name of readdirSync(join(self, "clp")).filter((file) => !file.endsWith(".adapter.ts"))) {
    assert.equal(readFileSync(join(copy, "clp", name), "utf8"), readFileSync(join(self, "clp", name), "utf8"), name);
  }
  // 本番コードとアダプターは、採点のあとも変わっていない
  for (const dir of ["src", "clp"]) {
    // 本番コードの置き方（平らか、ディレクトリに分けるか）は、書いたエージェントが決める
    for (const name of readdirSync(join(self, dir), { recursive: true, encoding: "utf8" }).filter((file) => file.endsWith(".ts") || file.endsWith(".json"))) assert.equal(readFileSync(join(copy, dir, name), "utf8"), readFileSync(join(self, dir, name), "utf8"), name);
  }
});

test("合格の記録: Stage 1 が使うのは、検証に合格した、いまの仕様の版だけ", async () => {
  // 置いてある生成物は、合格済みで、いまの仕様のもの
  const self = join(repoRoot, "packages/cli/self");
  for (const name of await listComponents(selfSpecs)) assert.equal(staleness(join(self, "clp", `${name}.verified.json`), selfSpecs), undefined, name);

  // 写しで、記録が合わなくなる場合を確かめる
  const copy = mkdtempSync(join(tmpRoot, "verified-"));
  cpSync(self, copy, { recursive: true });
  const record = join(copy, "clp/pipeline.verified.json");
  const specs = join(copy, "specs");
  assert.equal(staleness(record, specs), undefined);
  // コードが変わった（手で書き換えた、作りかけ、ミューテーションの途中で止まった）
  const { files } = JSON.parse(readFileSync(record, "utf8")) as { files: string[] };
  const source = join(copy, "clp", files.find((file) => file.endsWith("pipeline.ts"))!);
  const original = readFileSync(source, "utf8");
  writeFileSync(source, `${original}// changed\n`);
  assert.equal(staleness(record, specs), "合格したあとで、コードが変わっています");
  writeFileSync(source, original);
  assert.equal(staleness(record, specs), undefined);
  // アダプターも、コードのうち
  assert.ok(files.includes("pipeline.adapter.ts"));
  // 仕様が変わった（ほかのコンポーネントの仕様でも: 仕様のディレクトリ全体を見る）
  writeFileSync(join(specs, "value-writer.decisions.ts"), `${readFileSync(join(specs, "value-writer.decisions.ts"), "utf8")}// changed\n`);
  assert.equal(staleness(record, specs), "合格したあとで、仕様が変わっています");
  // 下書きは、仕様に数えない
  cpSync(join(self, "specs"), specs, { recursive: true });
  writeFileSync(join(specs, "pipeline.interpretation.draft.ts"), "// draft\n");
  assert.equal(staleness(record, specs), undefined);
  // 記録が無い
  rmSync(record);
  assert.equal(staleness(record, specs), "検証に合格した記録がありません");
});

test("合格の記録: 合格したときにだけ書かれる。合格しなければ、前の記録は残らない", async () => {
  const out = mkdtempSync(join(tmpRoot, "record-"));
  cpSync(join(repoRoot, "examples/checkout-ts/src"), join(out, "src"), { recursive: true });
  cpSync(join(repoRoot, "examples/checkout-ts/clp"), join(out, "clp"), { recursive: true });
  const record = join(out, "clp/order.verified.json");
  rmSync(record, { force: true });
  const nobody: ImplementationStrategy = { name: "nobody", run: () => { throw new Error("no agent"); } };

  assert.equal((await implement({ specs: specsDir, out, strategy: nobody, runs: 200, mutation: null })).status, "pass");
  assert.equal(staleness(record, specsDir), undefined);
  // 同じものを採点し直せば、同じ記録になる（時刻も回数も入らない）
  const first = readFileSync(record, "utf8");
  await implement({ specs: specsDir, out, strategy: nobody, runs: 300, mutation: null });
  assert.equal(readFileSync(record, "utf8"), first);

  // 本番コードを壊すと、採点に落ちて、エージェントが要る。前の記録は消えている
  const policy = readdirSync(join(out, "src"), { recursive: true, encoding: "utf8" }).find((file) => file.endsWith("policy.ts"))!;
  writeFileSync(join(out, "src", policy), readFileSync(join(out, "src", policy), "utf8").replace("20", "21"));
  await assert.rejects(implement({ specs: specsDir, out, strategy: nobody, runs: 200, mutation: null }), /no agent/);
  assert.equal(staleness(record, specsDir), "検証に合格した記録がありません");
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

// 例の仕様を写して、一部を書き換えた仕様（仕様が変わる前の版として使う）
function specVariant(file: string, from: string, to: string) {
  const dir = mkdtempSync(join(tmpRoot, "v-"));
  for (const name of readdirSync(specsDir)) {
    const text = readFileSync(join(specsDir, name), "utf8");
    if (name === file) assert.ok(text.includes(from), from);
    writeFileSync(join(dir, name), unstamped(name === file ? text.replace(from, to) : text));
  }
  return dir;
}
// すでにあるコードから始める筋書きを、両方の Stage で実行する。
// before: 前の版の仕様で、いまの状態を作る（どちらの Stage でも、同じ状態から始める）。after: いまの仕様で、もう一度
async function bothOnExisting(
  before: { specs?: () => string; script?: Script; then?: (out: string) => void },
  after: { script?: Script; options?: Partial<ImplementOptions> },
) {
  const once = async () => {
    const out = workdir();
    const first = await implement({ specs: before.specs?.() ?? specsDir, out, strategy: scripted(before.script ?? {}).strategy, maxAttempts: 1, mutation: null });
    assert.equal(first.status, "pass");
    before.then?.(out);
    const { strategy, seen } = scripted(after.script ?? {});
    const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 1, maxRounds: 1, mutation: null, ...after.options });
    return {
      trail: {
        status: result.status,
        attempts: result.attempts.map((a) => `${a.round}:${a.phase}:${a.attempt}:${a.feedback?.kind ?? "ok"}`),
        seen: seen.map((s) => s.phase),
        // 直しきれなくても、すでにあった本番コードは残る
        kept: existsSync(join(out, "src/order-service.ts")),
      },
      stages: result.stages,
    };
  };
  const previous = process.env.CLP_STAGE;
  try {
    process.env.CLP_STAGE = "0";
    const stage0 = await once();
    delete process.env.CLP_STAGE;
    const stage1 = await once();
    assert.deepEqual([stage0.stages, stage1.stages], [{ order: 0 }, { order: 1 }]);
    assert.deepEqual(stage1.trail, stage0.trail);
    return stage1.trail;
  } finally {
    if (previous === undefined) delete process.env.CLP_STAGE;
    else process.env.CLP_STAGE = previous;
  }
}
const silverFifty = () => specVariant("order.decisions.ts", '"The customer is a Silver member": { discountPercent: 5,', '"The customer is a Silver member": { discountPercent: 50,');
const extraEffect = () => specVariant("order.component.ts", "    NotifyPaymentFailure: input({}),", "    NotifyPaymentFailure: input({}),\n    Audit: input({}),");

test("パイプライン: すでにあるコードを直す経路でも、Stage 0 と同じ順に、同じ段階を動かす", async () => {
  // 何も変わっていない: 採点だけ
  const unchanged = await bothOnExisting({}, {});
  assert.deepEqual(unchanged.attempts, ["1:implementation:0:ok"]);
  assert.deepEqual(unchanged.seen, []);

  // 仕様の値だけが変わった: 採点に落ちて、実装の段階だけが動く
  const value = await bothOnExisting({ specs: silverFifty, script: { implementation: ["buggy"] } }, {});
  assert.deepEqual(value.attempts, ["1:implementation:0:pbt", "1:implementation:1:ok"]);

  // アダプターだけが無い: 配線から
  const noAdapter = await bothOnExisting({ then: (out) => rmSync(join(out, "clp/order.adapter.ts")) }, {});
  assert.deepEqual(noAdapter.seen, ["wiring"]);
  assert.deepEqual(noAdapter.attempts, ["1:wiring:1:ok", "1:implementation:0:ok"]);

  // 契約が変わった: 設計から。すでにコードがあるので、実装の前に、いまのコードを採点する
  const contract = await bothOnExisting({ specs: extraEffect }, {});
  assert.deepEqual(contract.attempts, ["1:design:1:ok", "1:wiring:1:ok", "1:implementation:0:pbt", "1:implementation:1:ok"]);

  // 契約が変わったが、いまのコードで満たされている: 配線のあとは、採点だけ
  const kept = await bothOnExisting({ specs: extraEffect }, { script: { design: ["kept"] } });
  assert.deepEqual(kept.seen, ["design", "wiring"]);
  assert.deepEqual(kept.attempts, ["1:design:1:ok", "1:wiring:1:ok", "1:implementation:0:ok"]);
});

test("パイプライン: すでにあるコードを直しきれないときの、やり直しと失敗も、Stage 0 と一致する（コードは捨てない）", async () => {
  // 新しい仕様 (5%) に対して、50% のままの実装しか書けないエージェント
  const stuck = await bothOnExisting({ specs: silverFifty, script: { implementation: ["buggy"] } }, { script: { implementation: ["buggy"] }, options: { maxRounds: 2 } });
  assert.equal(stuck.status, "fail");
  assert.deepEqual(stuck.seen, ["implementation", "design", "wiring", "implementation"]);
  assert.deepEqual(stuck.attempts, ["1:implementation:0:pbt", "1:implementation:1:pbt", "2:design:1:ok", "2:wiring:1:ok", "2:implementation:0:pbt", "2:implementation:1:pbt"]);
  assert.equal(stuck.kept, true);

  // 2周目で直る
  const recovered = await bothOnExisting(
    { specs: silverFifty, script: { implementation: ["buggy"] } },
    { script: { implementation: ["buggy", "correct"] }, options: { maxRounds: 2 } },
  );
  assert.equal(recovered.status, "pass");
  assert.deepEqual(recovered.attempts, ["1:implementation:0:pbt", "1:implementation:1:pbt", "2:design:1:ok", "2:wiring:1:ok", "2:implementation:0:pbt", "2:implementation:1:ok"]);
});

test("パイプライン: 仕様に無い指定 (--from、範囲の外の回数) は、Stage 0 が決める", async () => {
  const from = await run({}, { mutation: null, from: "design" });
  assert.deepEqual(from.stages, { order: 0 });
  const many = await run({}, { mutation: null, maxAttempts: 4 });
  assert.deepEqual(many.stages, { order: 0 });
  assert.equal(many.status, "pass");
});
