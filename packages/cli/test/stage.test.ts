import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { extract, referenceDiagnostics, referenceEvents, serialize, stableStringify, valuesToWrite } from "../src/extract.ts";
import { slotReportsStage0, slotsOf } from "../src/slots.ts";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { graphCheck, leafCheckPart, mutationVerdict, treeCheck, typeCheck, references, runStage1, stage1Payloads, stage1References, stage1Values } from "../src/stage1.ts";
import { verdictStage0 } from "../src/runtime.ts";
import { checkReports, commands, leafEvents, leafFactsOf, leafReportsStage0, otherwise, service, states, treeOf } from "@clp/core";
import type { Node } from "@clp/core";
import { graphReportsStage0, providedData } from "../src/graph.ts";
import { claimEvents, declaredEvents, declaredReportsStage0, failureEvents } from "../src/declared.ts";
import type { DeclaredEvent } from "../src/declared.ts";
import type { CellTrial } from "../src/runtime.ts";
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
    `import { commands, conditions, effects, input, interpretation, otherwise, service, states } from "@clp/core";
// 参照のための取っ手（宣言していない名前も含む）。宣言は、uses に並べたもの
const State = states(["A", "Z", "Y", "B", "Q", "C D"]);
const If = conditions({ big: "It is big" });
const Effect = effects({ Notify: input({}), Refund: input({}), Audit: input({}) });
const Command = commands({
  Place: { from: [State.A, State.Z], cases: [If.big.then({ goTo: State.Y }), otherwise({ goTo: State.B })] },
  Back: { from: State.Q, goTo: State.A },
  Stay: { from: State.B },
});
export const Thing = service({ init: State.A, uses: [states(["A", "B"]), effects({ Notify: input({}) }), If, Command] });
export const Interpretation = interpretation(Thing, [
  Command.Place.with({ cases: [If.big.then({ emits: [Effect.Notify(), Effect.Refund()] }), otherwise({ emits: [Effect.Audit()] })] }),
  Command.Back.with({ emits: [Effect.Refund()] }),
  If.big.means(() => true),
]);
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
      // 値の置き場所の検査: 構造を持つ型の比べ方は Stage 0 の結果を受けるので、どの仕様でも Stage 1 で実行できる
      const payloads = await stage1Payloads(spec);
      assert.deepEqual(payloads, [], `${component}: 値の置き場所の検査も Stage 1 で実行できること`);
      assert.deepEqual(payloads, slotsOf(spec).flatMap(slotReportsStage0));
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
    `import { calculations, commands, conditions, data, decisions, effects, input, interpretation, otherwise, queries, service, states, was } from "@clp/core";
const State = states(["A", "B", "C D"]);
const If = conditions({ big: "It is big" });
const Data = data({ memo: "string", total: "number", on: "boolean" });
const Query = queries({ flag: "boolean", lookUp: { input: input({ key: "string", depth: "integer" }), output: "string" } });
// 尋ねた答えの名前
const Asked = queries({ found: "string" });
const Effect = effects({ Notify: input({ text: "string", count: "integer", ratio: "number", sure: "boolean" }), Ping: input({}) });
const Calc = calculations({ "sum:all": { description: "the total", output: "integer" } });
const In = input({ note: "string", n: "integer" });
const Decision = decisions({ "the size": [If.big.then({ "count.max": 10, urgent: true }), otherwise({ "count.max": 1, urgent: false })] });
const Size = Decision["the size"];
const Command = commands({ Place: { input: In, goTo: State.B }, Back: { goTo: State.A } });
export const Thing = service({ init: State.A, uses: [State, Data, Query, Effect, Decision, Calc, If, Command] });
export const Interpretation = interpretation(Thing, [
  Command.Place.with({
    asks: [Query.lookUp({ key: In.note, depth: 3 }).as("found"), Query.lookUp({ key: "a:b.c", depth: In.n }).as("again")],
    set: [Data.memo.set(Asked.found), Data.total.set(-0.5), Data.on.set(false)],
    emits: [
      Effect.Notify({ text: "", count: Size["count.max"], ratio: 1e21, sure: Size["urgent"] }).onlyWhen(was(State.A, State["C D"])),
      Effect.Notify({ text: Data.memo, count: Calc["sum:all"], ratio: Data.total, sure: true }).onlyWhen(Query.flag),
      Effect.Ping().onlyWhen(If.big),
    ],
  }),
  Command.Back.with({ emits: [Effect.Ping().onlyWhen(was())], set: [Data.memo.set(" spaced  text ")] }),
  If.big.means(() => true),
  Calc["sum:all"].means(() => 1),
]);
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
    `import { calculations, commands, conditions, data, decisions, effects, input, integer, interpretation, number, otherwise, queries, service, states, was } from "@clp/core";
const State = states(["A", "B"]);
const If = conditions({ big: "It is big" });
const Data = data({ memo: "string", level: ["low", "high"], wide: ["low", "high", "top"], amount: "integer", ratio: "number" });
const Query = queries({ flag: "boolean", mode: ["x", "y"] });
const Effect = effects({
  Notify: input({ text: "string", count: "integer" }),
  Grade: input({ level: ["low", "high"] }),
  Weigh: input({ grams: integer({ min: 0, max: 10 }), ratio: number({ min: 0.5 }) }),
  Mark: input({ done: "boolean" }),
  Ping: input({}),
  // 宣言していない副作用（参照のための取っ手。uses には並べない）
  Refund: input({}),
});
const Calc = calculations({ title: { description: "the memo, upper-cased", output: "string" } });
// 参照のための取っ手（nota は宣言していない）
const In = input({ note: "string", n: "string", nota: "string" });
const Decision = decisions({ size: [If.big.then({ count: 10, urgent: true, label: "big", gap: null }), otherwise({ count: 1, urgent: false, label: "small", gap: 99 })] });
const Size = Decision.size;
// どこにも置かない決定表
const Unplaced = decisions({ unplaced: [otherwise({ count: 1 })] }).unplaced;
const Command = commands({ Place: { input: input({ note: "string", n: "integer" }), goTo: State.B } });
const Declared = effects({
  Notify: input({ text: "string", count: "integer" }),
  Grade: input({ level: ["low", "high"] }),
  Weigh: input({ grams: integer({ min: 0, max: 10 }), ratio: number({ min: 0.5 }) }),
  Mark: input({ done: "boolean" }),
  Ping: input({}),
});
export const Thing = service({ init: State.A, uses: [State, Data, Query, Declared, Decision, Calc, If, Command] });
export const Interpretation = interpretation(Thing, [
  Command.Place.with({ emits: [${effects}] }),
  If.big.means(() => true),
  Calc["title"].means(() => "t"),
]);
`,
  );
  return dir;
}

test("Stage 1: ペイロードの検査は、手書きの版 (Stage 0) と同じ結果を返す（値そのもの、範囲、列挙の要素、参照の型）", async () => {
  // [副作用, Stage 0 が報告するはずのもの]。1つずつ、別の仕様として確かめる
  const cases: [string, string[]][] = [
    // 合っているもの
    [`Effect.Notify({ text: In.note, count: Size["count"] })`, []],
    [`Effect.Notify({ text: Data.level, count: In.n })`, []],                 // 列挙は文字列に入る
    [`Effect.Grade({ level: "low" }), Effect.Grade({ level: Data.level }), Effect.Ping({})`, []],
    [`Effect.Weigh({ grams: 0, ratio: 0.5 }), Effect.Weigh({ grams: 10, ratio: 7 })`, []],        // 範囲の端。整数は数値に入る
    [`Effect.Weigh({ grams: Data.amount, ratio: Data.amount })`, []],            // 型だけの値は、範囲を見ない
    [`Effect.Mark({ done: was(State.A) }), Effect.Mark({ done: Size["urgent"] }), Effect.Mark({ done: Query.flag })`, []],
    [`Effect.Notify({ text: "x", count: Size["gap"] })`, []],                 // null のセルは見ない
    // 与えられていない、宣言されていない
    [`Effect.Notify({ text: "x" })`, ["missing-field:0:count"]],
    [`Effect.Notify({}), Effect.Ping({ extra: 1 })`, ["missing-field:0:text", "missing-field:0:count", "bad-value:1:extra"]],
    // 値そのものが合わない
    [`Effect.Notify({ text: "x", count: 1.5 })`, ["bad-value:0:count"]],
    [`Effect.Notify({ text: 1, count: "1" })`, ["bad-value:0:text", "bad-value:0:count"]],
    [`Effect.Grade({ level: "top" })`, ["bad-value:0:level"]],
    [`Effect.Mark({ done: "true" })`, ["bad-value:0:done"]],
    // 範囲の外
    [`Effect.Weigh({ grams: 11, ratio: 1 }), Effect.Weigh({ grams: -1, ratio: 0.25 })`, ["bad-value:0:grams", "bad-value:1:grams", "bad-value:1:ratio"]],
    // 決定表の列: 1つでも合わないセルがあれば、1回だけ報告する
    [`Effect.Notify({ text: "x", count: Size["urgent"] })`, ["bad-value:0:count"]],
    [`Effect.Grade({ level: Size["label"] })`, ["bad-value:0:level"]],
    [`Effect.Weigh({ grams: Size["count"], ratio: 1 })`, []],
    [`Effect.Weigh({ grams: Size["gap"], ratio: 1 })`, ["bad-value:0:grams"]],  // 99 は範囲の外
    // 参照の型が合わない
    [`Effect.Notify({ text: "x", count: Calc["title"] })`, ["bad-value:0:count"]],
    [`Effect.Notify({ text: In.n, count: Data.ratio })`, ["bad-value:0:text", "bad-value:0:count"]],
    [`Effect.Grade({ level: Query.mode }), Effect.Grade({ level: Data.wide }), Effect.Grade({ level: Data.memo })`, ["bad-value:0:level", "bad-value:1:level", "bad-value:2:level"]],
    [`Effect.Mark({ done: Data.amount }), Effect.Notify({ text: "x", count: was(State.A) })`, ["bad-value:0:done", "bad-value:1:count"]],
    // どこも指していない参照
    [`Effect.Notify({ text: In.nota, count: Unplaced["count"] })`, ["bad-value:0:text", "bad-value:0:count"]],
    // 宣言されていない副作用は、ここでは見ない（名前の検査が報告する）
    [`Effect.Refund({ amount: "lots" }), Effect.Notify({ text: "x" })`, ["missing-field:1:count"]],
  ];
  for (const [effects, expected] of cases) {
    const spec = await loadSpecs(payloads(effects));
    const stage0 = slotsOf(spec).flatMap(slotReportsStage0);
    // 副作用のスロット (鍵の最後が、その副作用の順番) について、以前の形 (missing-field / bad-value) に読み替えて比べる
    const effectReports = stage0.filter((d) => d.key.includes("|effect|")).map((d) => `${d.code === "missing-field" ? "missing-field" : "bad-value"}:${d.key.split("|").at(-1)}:${d.field}`);
    assert.deepEqual(effectReports, expected, effects);
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
    "gate-rules:implementation:0:ok",
    "graph-check:implementation:0:ok",
    "interpret-flow:implementation:0:ok",
    "leaf-check:implementation:0:ok",
    "mutation-judge:implementation:0:ok",
    "mutation-verdict:implementation:0:ok",
    "payload-check:implementation:0:ok",
    "pipeline:implementation:0:ok",
    "reference-check:implementation:0:ok",
    "text-plan:implementation:0:ok",
    "tree-check:implementation:0:ok",
    "type-check:implementation:0:ok",
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
  // ほかのコンポーネントの仕様が変わっても、この記録は古くならない（見るのは、自分の仕様と、そこから import するものだけ）
  writeFileSync(join(specs, "value-writer.decisions.ts"), `${readFileSync(join(specs, "value-writer.decisions.ts"), "utf8")}// changed\n`);
  assert.equal(staleness(record, specs), undefined);
  // 自分の仕様が import するファイルが変わった
  writeFileSync(join(specs, "pipeline.decisions.ts"), `${readFileSync(join(specs, "pipeline.decisions.ts"), "utf8")}// changed\n`);
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
const silverFifty = () => specVariant("order.decisions.ts", "CampaignIf.customerSilverMember.then({ discountPercent: 5,", "CampaignIf.customerSilverMember.then({ discountPercent: 50,");
const extraEffect = () => specVariant("order.component.ts", "  NotifyPaymentFailure: input({}),", "  NotifyPaymentFailure: input({}),\n  Audit: input({}),");

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

test("Stage 1: 仕様のミューテーションの判定は、手書きの版 (Stage 0) と同じ判定を、同じ順に返す (N10b)", async () => {
  // 試行の結果を台本で与える: シードごとに、結果が変わったか、実行できるかが変わったか
  const scripted = (value: CellTrial["value"], runs: [changed: boolean, enablementDiffers: boolean][], asked: number[] = []): CellTrial => ({
    table: "t",
    row: `r${asked.length}`,
    column: JSON.stringify(value) + runs.map(([c, e]) => `${+c}${+e}`).join(""),
    value,
    run: async (extra) => {
      asked.push(extra);
      const [changed, enablementDiffers] = runs[extra] ?? [false, false];
      return { changed, enablementDiffers };
    },
  });
  const cases: [CellTrial["value"], [boolean, boolean][]][] = [
    [null, []],
    [5, [[true, false]]],
    [5, [[false, false], [true, false]]],
    [5, [[false, false], [false, false], [true, true]]],
    [5, [[false, false], [false, false], [false, false]]],
    [5, [[false, true], [false, false], [false, false]]],
    [5, [[false, false], [false, false], [false, true]]],
    ["Gold", [[false, false], [false, false], [false, false]]],
    [true, [[false, false], [false, false], [false, false]]],
    [false, [[false, true], [false, false], [false, false]]],
    [true, [[false, false], [true, false]]],
  ];
  const stage0Asked: number[][] = cases.map(() => []);
  const stage1Asked: number[][] = cases.map(() => []);
  const stage0 = await verdictStage0(cases.map(([value, runs], index) => scripted(value, runs, stage0Asked[index])));
  const stage1 = await runStage1(mutationVerdict, cases.map(([value, runs], index) => scripted(value, runs, stage1Asked[index])));
  assert.ok(stage1, "Stage 1 が実行できること");
  assert.deepEqual(stage1.map(({ column, verdict, severity }) => [column, verdict, severity]), stage0.map(({ column, verdict, severity }) => [column, verdict, severity]));
  // 頼む試行も、同じ順に同じだけ
  assert.deepEqual(stage1Asked, stage0Asked);
  assert.ok(stage0.length >= 6);
});

test("Stage 1: グラフの検査は、手書きの版 (Stage 0) と同じ報告を、同じ順に返す (N10c)", async () => {
  // 誤りのある仕様: たどり着けない状態とコマンド、出口の無い状態、使われない語彙（Layer 1 のものと、解釈が足したもの）
  const dir = mkdtempSync(join(tmpRoot, "graph-"));
  writeFileSync(
    join(dir, "trip.component.ts"),
    `import { commands, conditions, data, effects, input, interpretation, otherwise, queries, service, states } from "@clp/core";
export const State = states({ PLANNED: "p", STARTED: "s", STUCK: "x", DONE: { description: "d", final: true }, ARCHIVED: "a" });
export const If = conditions({ rains: "It rains" });
export const Data = data({ memo: "string" });
export const Query = queries({ weather: { input: input({ place: "string" }), output: "string" }, now: "integer" });
export const Effect = effects({ Notify: input({}) });
export const Command = commands({
  Start: { from: State.PLANNED, goTo: State.STARTED },
  Stall: { from: State.STARTED, cases: [If.rains.then({ goTo: State.STUCK }), otherwise({ goTo: State.DONE })] },
  Wait: { from: State.STUCK, nothing: true },
  Restore: { from: State.ARCHIVED, goTo: State.PLANNED },
  Never: { from: [] },
});
export const Trip = service({ init: State.PLANNED, uses: [State, Data, Query, Effect, If, Command] });
const Added = effects({ Extra: input({}) });
const AddedData = data({ note: "string" });
export const Interpretation = interpretation(Trip, [If.rains.means(() => false)]);
void Added; void AddedData;
`,
  );
  const cases: { spec: Awaited<ReturnType<typeof loadSpecs>>; provided?: ReadonlySet<string> }[] = [{ spec: await loadSpecs(dir) }];
  for (const specs of [specsDir, selfSpecs, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "examples/todo-db-ts/specs")]) {
    const loaded = await Promise.all((await listComponents(specs)).map((component) => loadSpecs(specs, { component })));
    const provided = providedData(loaded);
    for (const spec of loaded) cases.push({ spec, provided: provided.get(spec.name!) });
  }
  let reports = 0;
  for (const { spec, provided } of cases) {
    for (const strict of [false, true]) {
      const stage0 = graphReportsStage0(spec, provided, strict);
      reports += stage0.length;
      assert.deepEqual(await runStage1(graphCheck, { spec, provided, strict }), stage0, `${spec.name} strict=${strict}`);
    }
  }
  assert.ok(reports >= 10, `報告のある場合を含むこと (${reports})`);
});

test("Stage 1: 木の検査は、手書きの版 (Stage 0) と同じ報告を、同じ順に返す (N10d)", async () => {
  // 文法に合わない所を持つ木（部品として読み込めないので、直接作る）: 種類に無い席、重なった状態、初期状態が状態に無い、裸の {}
  const State = states(["A", "B", "A"]);
  const Other = states(["Z"]);
  const Command = commands({ Go: { from: State.A, goto: State.B, nothing: true } as never, Stay: { cases: [{} as never, otherwise] } });
  const broken = service({ init: Other.Z, uses: [State, Command], bogus: 1 } as never);
  const trees = [broken as unknown as Node];
  for (const specs of [specsDir, selfSpecs, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "examples/todo-db-ts/specs")]) {
    for (const component of await listComponents(specs)) {
      const spec = await loadSpecs(specs, { component });
      for (const value of [spec.binding?.source, spec.binding]) {
        const found = value && treeOf(value as object);
        if (found) trees.push(found.tree);
      }
    }
  }
  let reports = 0;
  for (const tree of trees) {
    const stage0 = checkReports(tree);
    reports += stage0.length;
    const stage1 = await runStage1(treeCheck, tree);
    assert.ok(stage1, "Stage 1 が実行できること");
    assert.deepEqual(stage1.map((r) => [r.code, r.parent, r.node]), stage0.map((r) => [r.code, r.parent, r.node]));
  }
  assert.ok(trees.length >= 10 && reports >= 3, `${trees.length} trees, ${reports} reports`);
});

test("Stage 1: 葉の検査は、手書きの版 (Stage 0) と同じ報告を、同じ順に返す (N10d)", async () => {
  // 書き残しのある仕様: 文だけのまとまり、型の無い項目、otherwise の無い場合分け、構造になっていない文、意味の無い文と計算
  const dir = mkdtempSync(join(tmpRoot, "leaf-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { all, calculations, commands, conditions, data, effects, input, interpretation, invariants, not, otherwise, queries, service, states } from "@clp/core";
export const State = states(["OPEN", "DONE"]);
export const If = conditions({ big: "It is big", odd: "It is odd" });
export const Data = data({ memo: { description: "A note." } });
export const Query = queries("Whether it is raining.");
export const Effect = effects({ Notify: input({}) });
export const Calc = calculations({ total: { description: "the sum", output: "integer" } });
export const Inv = invariants({ ok: "It is fine" });
export const Command = commands({
  Close: "The thing is closed and a notice is sent.",
  Go: { cases: [all(If.big, not(If.odd)).then({ goTo: State.DONE }), If.odd.then({ does: "It moves." })] },
  Both: { cases: [If.big.then({ nothing: true, goTo: State.DONE }), otherwise] },
});
export const Thing = service({ init: State.OPEN, uses: [State, Data, Query, Effect, Calc, Inv, If, Command] });
export const Interpretation = interpretation(Thing, [If.big.means(() => true)]);
`,
  );
  const facts = [];
  for (const specs of [dir, specsDir, selfSpecs, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "examples/todo-db-ts/specs")]) {
    for (const component of await listComponents(specs)) {
      const binding = (await loadSpecs(specs, { component })).binding;
      const found = binding && leafFactsOf(binding);
      if (found) facts.push(found);
    }
  }
  let reports = 0;
  for (const fact of facts) {
    const stage0 = leafReportsStage0(leafEvents(fact));
    reports += stage0.length;
    const stage1 = await runStage1(leafCheckPart, fact);
    assert.ok(stage1, "Stage 1 が実行できること");
    assert.deepEqual(stage1, stage0);
  }
  assert.ok(facts.length >= 10 && reports >= 6, `${facts.length} specs, ${reports} reports`);
});

test("Stage 1: 宣言の検査（型、決定表の列、約束、失敗の条件、名前の衝突）は、手書きの版 (Stage 0) と同じ報告を返す (N10e)", async () => {
  // 誤りのある宣言: 空の列挙、範囲の矛盾、範囲の外のしきい値、種類の混ざった列、守れない約束、失敗しない問い合わせの failed、名前の衝突
  const dir = mkdtempSync(join(tmpRoot, "declared-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { all, commands, conditions, data, decisions, input, integer, interpretation, not, oneOf, otherwise, queries, record, service } from "@clp/core";
export const If = conditions({ big: "It is big" });
export const Decision = decisions({ t: [If.big.then({ v: 1, w: null }), otherwise({ v: "x", w: true })] });
export const Data = data({ level: integer({ min: 5, max: 1, around: [9] }), kind: [] as never, shape: oneOf({}), n: "integer" });
export const Query = queries({ now: { output: "boolean", increasing: true }, id: { output: "string", fresh: true, input: input({ k: "string" }) }, region: "string" });
export const When = conditions({ lost: all(If.big, Query.region.failed) });
export const Command = commands({ Go: { input: input({ m: "integer" }), cases: [When.lost.then({ nothing: true }), otherwise({ nothing: true })] } });
export const X = service({ uses: [Data, Query, Decision, If, When, Command] });
export const Interpretation = interpretation(X, [If.big.means(() => true)]);
`,
  );
  const specs: Awaited<ReturnType<typeof loadSpecs>>[] = [];
  for (const root of [specsDir, selfSpecs, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "examples/todo-db-ts/specs")]) {
    for (const component of await listComponents(root)) specs.push(await loadSpecs(root, { component }));
  }
  const broken = await loadSpecs(dir);
  assert.ok(broken.model, "壊れた宣言の仕様にも、語彙はある");
  specs.push(broken);
  const lists: DeclaredEvent[][] = specs.filter((spec) => spec.model).flatMap((spec) => [[...declaredEvents(spec)], [...failureEvents(spec)]]);
  // 名前の衝突（衝突があるとモデルが作られないので、事実の列を直接作る）
  const model = { init: "READY", states: ["READY"], data: { n: "integer", level: "integer" }, commands: { Go: { n: "integer" }, Stop: { n: "integer" }, Again: { status: "string" } }, queries: { n: { input: {}, output: "integer" } }, effects: {} } as never;
  lists.push([...claimEvents(model, ["answer", "answer", "n"], ["todos", "level"])]);
  const reports: string[] = [];
  for (const events of lists) {
    const stage0 = declaredReportsStage0(events);
    reports.push(...stage0.map((found) => found.code));
    const stage1 = await runStage1(typeCheck, events);
    assert.ok(stage1, "Stage 1 が実行できること");
    assert.deepEqual(stage1.map(({ code, owner, event }) => [code, owner, events.indexOf(event)]), stage0.map(({ code, owner, event }) => [code, owner, events.indexOf(event)]));
  }
  for (const code of ["empty-enum", "empty-one-of", "min-above-max", "around-outside", "mixed-column", "promise-kind", "promise-input", "failure-not-may-fail", "name-collision"]) {
    assert.ok(reports.includes(code), `${code}: ${reports.join(", ")}`);
  }
});

test("Stage 1: 値の置き場所の検査は、副作用のほかの置き場所でも、手書きの版 (Stage 0) と同じ判断を返す (N10e / N10f)", async () => {
  const dir = mkdtempSync(join(tmpRoot, "slots-"));
  writeFileSync(
    join(dir, "item.component.ts"),
    `import { commands, input, interpretation, service } from "@clp/core";
export const Command = commands({ Touch: { input: input({ times: "integer" }), output: "integer", responds: 1 } });
export const Item = service({ uses: [Command] });
export const Interpretation = interpretation(Item, []);
`,
  );
  writeFileSync(
    join(dir, "shop.component.ts"),
    `import { by, calculations, commands, conditions, data, effects, input, integer, interpretation, many, optional, otherwise, parts, queries, record, service } from "@clp/core";
import { Item } from "./item.component.ts";
export const If = conditions({ big: "It is big" });
export const Data = data({ memo: "string", count: { type: "integer", initially: "zero" }, kept: optional("string") });
const Undeclared = data({ ghost: "string" });
export const Query = queries({ price: { input: input({ sku: "string", qty: "integer" }), output: "integer" } });
export const Part = parts({ items: many(Item, by("id")) });
export const Calc = calculations({ label: { description: "a label", output: "string" } });
export const Effect = effects({ Note: input({ text: "string" }) });
export const BuyInput = input({ sku: "string", n: "integer" });
export const Command = commands({
  Buy: {
    input: BuyInput,
    asks: [Query.price({ sku: BuyInput.n, extra: 1 } as never).as("p"), Query.price({ sku: Calc.label, qty: 1 }).as("q")],
    calls: [Part.items.at(BuyInput.sku).Touch({ times: "many" } as never)],
    output: record({ status: integer({ min: 200, max: 599 }), note: "string" }),
    cases: [
      If.big.then({ responds: { status: 700, note: null, more: 1 } as never, set: [Data.memo.set(BuyInput.n), Undeclared.ghost.set("x"), Data.kept.set(null)] }),
      otherwise({ responds: 1 as never, adds: [Part.items.add(BuyInput.sku, { times: 2 } as never)], emits: [Effect.Note({ text: "x" }).onlyWhen(BuyInput.n as never)] }),
    ],
  },
  Look: { cases: [If.big.then({ responds: 1 as never }), otherwise({ nothing: true })] },
});
export const Shop = service({ uses: [Data, Query, Part, Calc, Effect, If, Command] });
export const Interpretation = interpretation(Shop, [If.big.means(() => true), Calc.label.means(() => "l")]);
`,
  );
  const shop = await loadSpecs(dir, { component: "shop" });
  const stage0 = slotsOf(shop).flatMap(slotReportsStage0);
  const codes = new Set(stage0.map((d) => d.code));
  for (const code of ["missing-field", "unknown-field", "bad-source", "mismatch", "no-output", "wrong-shape"]) assert.ok(codes.has(code as never), `${code}: ${[...codes].join(", ")}`);
  assert.deepEqual(await stage1Payloads(shop), stage0);
  // 診断の全体（文面を含む）も、どちらの Stage で動かしても同じ
  assert.deepEqual(extract(shop, await references(shop)), extract(shop));
});

test("Stage 1: 文面の判断（契約の型の書き方・注記・節、依頼文の節）は、手書きの版 (Stage 0) と同じ文面を作る (N10h)", async () => {
  const { contractPlan, requestPlan } = await import("../src/stage1.ts");
  const { generateContract, queryNotesStage0, contractSectionsStage0, registerContractPlan, typeTextStage0 } = await import("../src/generate.ts");
  const { requestSectionsStage0 } = await import("../src/request.ts");
  let compared = 0;
  for (const root of [specsDir, selfSpecs, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "examples/todo-ts/specs"), join(repoRoot, "examples/todo-db-ts/specs")]) {
    for (const component of await listComponents(root)) {
      const spec = await loadSpecs(root, { component });
      const ir = JSON.parse(stableStringify(extract(spec).ir));
      const stage0 = generateContract(ir);
      const plan = await runStage1(contractPlan, ir);
      assert.ok(plan, "Stage 1 が実行できること");
      // 判断ごとに、Stage 0 と同じ
      for (const [key, text] of plan.types) assert.equal(text, typeTextStage0(JSON.parse(key)), key);
      for (const [key, notes] of plan.notes) assert.deepEqual(notes, queryNotesStage0(JSON.parse(key)), key);
      for (const [key, sections] of plan.sections) assert.deepEqual(sections, contractSectionsStage0(JSON.parse(key)), key);
      // 登録したあとの契約も、バイト一致する
      registerContractPlan(ir, plan);
      assert.equal(generateContract(ir), stage0, `${component}`);
      compared += plan.types.size;
    }
  }
  assert.ok(compared > 50, `${compared} types`);
  // 型の書き方の、端の場合
  const edge = [
    { kind: "one-of", name: "", inner: "", entries: [], members: [] },
    { kind: "record", name: "", inner: "", entries: [], members: [] },
    { kind: "enum", name: "", inner: "", entries: [], members: [] },
    { kind: "list", name: "", inner: "{ a: string }", entries: [], members: [] },
    { kind: "list", name: "", inner: "string | null", entries: [], members: [] },
    { kind: "record", name: "", inner: "", entries: [{ name: "b", text: "number", optional: true }, { name: "a", text: "string", optional: false }], members: [] },
  ] as const;
  const { session } = await import("../src/stage1.ts");
  const texts = await runStage1({ component: "text-plan", run: (adapter, facts: readonly object[]) => session(adapter, { queries: {}, effects: {} }, facts.map((input) => ({ name: "TypeText", input }))) }, edge);
  assert.deepEqual(texts, edge.map((facts) => typeTextStage0(facts as never)));
  for (const phase of ["design", "wiring", "implementation"] as const) {
    for (const facts of [{ phase, attempt: 1, hasFeedback: false, others: 0, partFiles: 0 }, { phase, attempt: 1, hasFeedback: true, others: 2, partFiles: 0 }, { phase, attempt: 3, hasFeedback: true, others: 0, partFiles: 1 }]) {
      assert.deepEqual(await runStage1(requestPlan, facts), requestSectionsStage0(facts), JSON.stringify(facts));
    }
  }
});

test("採点の部品 (N11): ミューテーションの合否は、事例の集まりで Stage 0 と同じ判断を返す。R1〜R5 の決まりが効く", async () => {
  const { R1_CASES, grade, judgePart, runCases, setGradingByStage0, stage0HashOf, stage1Adapter } = await import("../src/stage1.ts");
  const { judgeEvents, judgeStage0 } = await import("../src/mutation.ts");
  const self = join(repoRoot, "packages/cli/self");
  // R3: 事例の集まり（入力だけ）を、生成したコードと Stage 0 の両方で判断して、一致する
  const cases = JSON.parse(readFileSync(join(self, "cases/mutation-judge.json"), "utf8")).cases as unknown[];
  const adapter = await stage1Adapter("mutation-judge");
  assert.ok(adapter, "Stage 0 が採点した記録があり、使えること (R2)");
  for (const given of cases) assert.equal(await R1_CASES["mutation-judge"].compare(adapter, given), undefined, JSON.stringify(given));
  const { resolveLayout, workspaceOf } = await import("../src/layout.ts");
  const { typescriptTarget } = await import("../src/target-typescript.ts");
  const workspace = (out: string) => workspaceOf(resolveLayout({ out }), typescriptTarget.files, "mutation-judge");
  // 事例の集まりを別のプロセスで流しても、食い違いは無い
  assert.equal(runCases(join(self, "specs"), workspace(self), "mutation-judge").problem, undefined);

  // R4: 両方を走らせ、厳しい側を取る。甘い Stage 1 は、Stage 0 なら落とすものを通さない
  const report = { strategy: "x", mutants: [{ file: "src/a.ts", line: 1, original: "20", mutated: "21", value: 20, killed: false }] };
  const events = [...judgeEvents(report, [20], "", false)];
  const stage0 = judgeStage0(events);
  assert.deepEqual(stage0.map((r) => r.code), ["survived"]);
  const lenient = { component: "mutation-judge", run: async () => [] as typeof stage0 };
  const union = (a: typeof stage0, b: typeof stage0) => [...a, ...b];
  assert.deepEqual((await grade(lenient, events, stage0, union, (a, b) => a.length === b.length)).map((r) => r.code), ["survived"]);
  // R1: 採点の部品を作り直す実行では、Stage 1 を呼ばない
  let called = false;
  setGradingByStage0(true);
  try {
    await grade({ component: "mutation-judge", run: async () => ((called = true), []) }, events, stage0, union, () => true);
  } finally {
    setGradingByStage0(false);
  }
  assert.equal(called, false);
  assert.deepEqual(await judgePart.run(adapter, events), stage0);

  // R2 / R5: 採点の部品の記録は、Stage 0 が採点したもので、対になる Stage 0 が変わっていないときだけ使える
  const copy = mkdtempSync(join(tmpRoot, "r1-"));
  cpSync(self, copy, { recursive: true });
  const record = join(copy, "clp/mutation-judge.verified.json");
  const specs = join(copy, "specs");
  const grading = { stage0: stage0HashOf("mutation-judge") };
  assert.equal(staleness(record, specs, grading), undefined);
  const written = JSON.parse(readFileSync(record, "utf8"));
  writeFileSync(record, JSON.stringify({ ...written, gradedBy: "stage1" }));
  assert.match(staleness(record, specs, grading) ?? "", /R2/);
  writeFileSync(record, JSON.stringify(written));
  assert.match(staleness(record, specs, { stage0: "sha256:changed" }) ?? "", /R5/);

  // R3: いまのコードが Stage 0 と食い違えば、記録を書かない（ここでは、何も報告しないアダプターに差し替えて確かめる）
  writeFileSync(join(copy, "clp/mutation-judge.adapter.ts"), `export const adapter = { async setupIsolation() {}, async teardownIsolation() {}, async executeCommand() {}, async getCurrentState() { return "VALUES"; } };\n`);
  const checked = runCases(specs, workspace(copy), "mutation-judge");
  assert.match(checked.problem ?? "", /事例 \d+: Stage 0/);
});

test("採点の部品 (N11c / N11d): 出口の門の判定は、事実のすべての組み合わせで Stage 0 と同じ判定を返す", async () => {
  const { R1_CASES, runCases, stage1Adapter } = await import("../src/stage1.ts");
  const self = join(repoRoot, "packages/cli/self");
  const adapter = await stage1Adapter("gate-rules");
  assert.ok(adapter, "Stage 0 が採点した記録があり、使えること (R2)");
  const cases = JSON.parse(readFileSync(join(self, "cases/gate-rules.json"), "utf8")).cases as unknown[];
  assert.ok(cases.length > 800);
  for (const given of cases) assert.equal(await R1_CASES["gate-rules"].compare(adapter, given), undefined, JSON.stringify(given));
  const { resolveLayout, workspaceOf } = await import("../src/layout.ts");
  const { typescriptTarget } = await import("../src/target-typescript.ts");
  assert.equal(runCases(join(self, "specs"), workspaceOf(resolveLayout({ out: self }), typescriptTarget.files, "gate-rules"), "gate-rules").problem, undefined);
});
