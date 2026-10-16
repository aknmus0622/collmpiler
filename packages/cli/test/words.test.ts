import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { generateContract } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { graphDiagnostics, providedData } from "../src/graph.ts";
import { loadSpecs } from "../src/loader.ts";
import { selfCheck } from "../src/runtime.ts";
import { typescriptTarget } from "../src/target-typescript.ts";

// 版 7 で足した語 (DSL.md §16.1): 共通の結果 (W1)、遷移先を決定表の列で (W2)、条件の組み合わせ (W3)、oneOf と value (W4、W5)、
// 数の列挙 (W9)、forwards (W10)、データと答えのフィールドの取っ手 (W12)、親が作るときに渡すデータ (W13)、型定義 (W14)

const tmpRoot = join(import.meta.dirname, ".tmp-words");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));
const specDir = (files: Record<string, string>) => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};
const load = async (dir: string, component?: string) => {
  const spec = await loadSpecs(dir, component === undefined ? {} : { component });
  const { ir, diagnostics } = extract(spec);
  return { spec, ir: ir as Ir, diagnostics: diagnostics.map((d) => `${d.code}: ${d.message}`) };
};

// 段階を進める部品: 計画の表が遷移先を決め (W2)、共通の結果をコマンドに1回だけ書き (W1)、条件を組み合わせる (W3)
const PIPELINE = `import { all, commands, conditions, data, decisions, effects, input, integer, interpretation, not, otherwise, queries, service, states } from "@clp/core";
export const State = states(["IDLE", "DESIGN", "WIRING", "DONE"]);
export const If = conditions({ noCode: "There is no code yet", passed: "The check passed", incremental: "Existing code is being changed" });
export const When = conditions({ passedFresh: all(If.passed, not(If.incremental)) });
export const Decision = decisions({
  plan: [If.noCode.then({ next: State.DESIGN, incremental: false }), otherwise({ next: State.WIRING, incremental: true })],
});
export const Data = data({ round: integer({ min: 0, max: 3 }), incremental: "boolean" });
export const Query = queries({ hasCode: "boolean" });
export const Effect = effects({ Started: input({ round: "integer" }) });
export const Command = commands({
  Start: { from: State.IDLE, goTo: Decision.plan.next, set: [Data.round.set(1), Data.incremental.set(Decision.plan.incremental)] },
  Checked: {
    input: input({ passed: "boolean" }),
    from: [State.DESIGN, State.WIRING],
    emits: [Effect.Started({ round: Data.round })],
    cases: [When.passedFresh.then({ goTo: State.DONE }), otherwise],
  },
});
export const Pipeline = service({ init: State.IDLE, uses: [State, If, When, Decision, Data, Query, Effect, Command] });
export const Interpretation = interpretation(Pipeline, [
  If.noCode.means((state) => !state.hasCode),
  If.passed.means((state) => state.passed === true),
  If.incremental.means((state) => state.incremental === true),
]);
`;

test("W1: コマンドに書いた「起きること」は、どの場合でも起きる（otherwise も足す）", async () => {
  const { ir, diagnostics } = await load(specDir({ "pipeline.component.ts": PIPELINE }));
  assert.deepEqual(diagnostics, []);
  const checked = ir.behaviors.find((behavior) => behavior.name === "Checked")!;
  for (const outcome of Object.values(checked.when) as { emits?: unknown[] }[]) {
    assert.deepEqual(outcome.emits, [{ effect: "Started", input: { round: { $ref: "data:round" } } }]);
  }
});

test("W2: 遷移先を、決定表の列（状態の取っ手を書いたセル）で決める。グラフは、その列の状態すべてを辺にする", async () => {
  const { spec, ir, diagnostics } = await load(specDir({ "pipeline.component.ts": PIPELINE }));
  assert.deepEqual(diagnostics, []);
  const start = ir.behaviors.find((behavior) => behavior.name === "Start")!;
  assert.deepEqual((start.when.otherwise as { goTo: unknown }).goTo, { $ref: "decision:plan.next" });
  assert.deepEqual(ir.decisions.plan.rows, { "There is no code yet": { next: "DESIGN", incremental: false }, otherwise: { next: "WIRING", incremental: true } });
  assert.deepEqual(graphDiagnostics(spec), []);
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 200 }), { ok: true, numRuns: 200 });
  // 列に状態でない値があれば、報告する
  const broken = await load(specDir({ "pipeline.component.ts": PIPELINE.replace("next: State.WIRING", 'next: "LIMBO"') }));
  assert.ok(broken.diagnostics.some((line) => line.includes('goTo の "LIMBO" は states にありません')), broken.diagnostics.join("\n"));
});

test("W3: 条件の組み合わせ。意味は、組み合わせる前の条件から決まり、IR に中身が出る。足りなければ報告する", async () => {
  const { spec, ir } = await load(specDir({ "pipeline.component.ts": PIPELINE }));
  const sentence = '("The check passed" and not "Existing code is being changed")';
  assert.ok(sentence in (ir.behaviors.find((behavior) => behavior.name === "Checked")!.when as object));
  assert.deepEqual((ir as Ir & { conditions?: unknown }).conditions, {
    [sentence]: { all: ["The check passed", 'not "Existing code is being changed"'] },
    'not "Existing code is being changed"': { not: "Existing code is being changed" },
  });
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 200 }), { ok: true, numRuns: 200 });
  const missing = await load(specDir({ "pipeline.component.ts": PIPELINE.replace('  If.incremental.means((state) => state.incremental === true),\n', "") }));
  assert.ok(missing.diagnostics.some((line) => line.startsWith('unbound-condition: 条件 "Existing code is being changed"')), missing.diagnostics.join("\n"));
});

// 値を書き出す部品: どれか1つの形 (W4)、何でも入る値 (W5)、数の列挙 (W9)、答えのフィールドの取っ手 (W12)
const WRITER = `import { commands, conditions, data, input, interpretation, list, oneOf, otherwise, queries, record, service, value } from "@clp/core";
export const Value = oneOf({ constant: value(), reference: record({ name: "string" }), was: list("string") });
export const Data = data({ last: { type: record({ status: [200, 404], note: "string" }), initially: { status: 200, note: "" } } });
export const Query = queries({ lookUp: { input: input({ key: "string" }), output: record({ found: "boolean", code: [200, 404] }) } });
export const WriteInput = input({ value: Value, key: "string" });
export const If = conditions({ found: "The key was found" });
const asked = Query.lookUp({ key: WriteInput.key }).as("looked");
export const Command = commands({
  Write: {
    input: WriteInput,
    asks: [asked],
    output: record({ written: Value, status: [200, 404] }),
    cases: [If.found.then({ responds: { written: WriteInput.value, status: asked.answer.code } }), otherwise({ responds: { written: WriteInput.value, status: 404 } })],
    set: [Data.last.set({ status: 200, note: "x" })],
  },
  Last: { output: [200, 404], responds: Data.last.status },
});
export const Writer = service({ uses: [Data, Query, If, Command] });
export const Interpretation = interpretation(Writer, [If.found.means((state) => state.looked.found === true)]);
`;

test("W4、W5、W9、W12: どれか1つの形、何でも入る値、数の列挙、データと答えのフィールド。検査、契約、生成が扱う", async () => {
  const { spec, ir, diagnostics } = await load(specDir({ "writer.component.ts": WRITER }));
  assert.deepEqual(diagnostics, []);
  const model = ir.model!;
  assert.deepEqual(model.commands.Write.value, { oneOf: { constant: "value", reference: { record: { name: "string" } }, was: { list: "string" } } });
  assert.deepEqual(model.outputs!.Last, [200, 404]);
  const last = ir.behaviors.find((behavior) => behavior.name === "Last")!;
  assert.deepEqual((last.when.otherwise as { responds: unknown }).responds, { $ref: "data:last.status" });
  const write = ir.behaviors.find((behavior) => behavior.name === "Write")!;
  assert.deepEqual((write.when["The key was found"] as { responds: { status: unknown } }).responds.status, { $ref: "query:looked.code" });
  const contract = generateContract(ir);
  assert.match(contract, /Last: 200 \| 404;/);
  assert.match(contract, /\{ constant: null \| boolean \| number \| string \| unknown\[\] \| \{ \[field: string\]: unknown \} \} \| \{ reference: \{ name: string \} \} \| \{ was: string\[\] \}/);
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
  // 型に合わない値は、報告する
  const wrong = await load(specDir({ "writer.component.ts": WRITER.replace("status: 404 } })]", "status: 500 } })]") }));
  assert.ok(wrong.diagnostics.some((line) => line.includes("500 は 200 | 404 に入りません")), wrong.diagnostics.join("\n"));
  const field = await load(specDir({ "writer.component.ts": WRITER.replace("responds: Data.last.status", 'responds: { $ref: "data", path: "last.code" } as never') }));
  assert.ok(field.diagnostics.some((line) => line.includes('last に、フィールド "code" はありません')), field.diagnostics.join("\n"));
});

// 子のコマンドを、そのまま親の口に出す (W10)。親が作るときに渡すデータ (W13)
const ITEM = `import { commands, conditions, data, interpretation, otherwise, service, states } from "@clp/core";
export const State = states(["OPEN", "DONE"]);
export const If = conditions({ done: "The item is done" });
export const Data = data({ title: "string" });
export const Command = commands({
  Complete: { output: ["completed", "already-done"], cases: [If.done.then({ responds: "already-done" }), otherwise({ goTo: State.DONE, responds: "completed" })] },
});
export const Item = service({ init: State.OPEN, uses: [State, If, Data, Command] });
export const Interpretation = interpretation(Item, [If.done.means((state) => state.status === "DONE")]);
`;
const LIST = `import { by, commands, input, interpretation, many, parts, queries, service } from "@clp/core";
import { Item } from "./item.component.ts";
export const Part = parts({ items: many(Item, by("id")) });
export const Query = queries({ newId: { output: "string", fresh: true } });
export const AddInput = input({ title: "string" });
export const Command = commands({
  Add: { input: AddInput, adds: [Part.items.add(Query.newId, { title: AddInput.title })] },
  Complete: Part.items.Complete.forward({ missing: "not-found" }),
});
export const List = service({ uses: [Part, Query, Command] });
export const Interpretation = interpretation(List, []);
`;

test("W10: forwards は、キーと子の入力を取り、子の答えか missing を返すコマンドに展開される", async () => {
  const dir = specDir({ "item.component.ts": ITEM, "list.component.ts": LIST });
  const { spec, ir, diagnostics } = await load(dir, "list");
  assert.deepEqual(diagnostics, []);
  const complete = ir.behaviors.find((behavior) => behavior.name === "Complete")!;
  assert.deepEqual(ir.model!.commands.Complete, { id: { type: "string", among: { data: "items" } } });
  assert.deepEqual(ir.model!.outputs!.Complete, ["completed", "already-done", "not-found"]);
  assert.deepEqual(Object.keys(complete.when), ["There is no items with the given id (Complete)", "otherwise"]);
  assert.deepEqual(await selfCheck(spec, { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
});

test("W13: 親が作るときに渡すデータは、覚えるコマンドが無くても「設定されない」と言わない", async () => {
  const dir = specDir({ "item.component.ts": ITEM, "list.component.ts": LIST });
  const [item, list] = [await loadSpecs(dir, { component: "item" }), await loadSpecs(dir, { component: "list" })];
  assert.match(graphDiagnostics(item).map((d) => d.message).join("\n"), /データ "title" を覚える/);
  const provided = providedData([item, list]);
  assert.deepEqual([...(provided.get("item") ?? [])], ["title"]);
  assert.deepEqual(graphDiagnostics(item, provided.get("item")), []);
});

test("W14: 作業場所には、許した組み込みの型定義を置く（エージェントが自分で型を確かめられる）", () => {
  const files = typescriptTarget.toolchain!();
  assert.ok("node_modules/@types/node/http.d.ts" in files);
  assert.ok("node_modules/@types/node/package.json" in files);
});
