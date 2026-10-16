import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { graphDiagnostics } from "../src/graph.ts";
import { loadSpecs } from "../src/loader.ts";

// 単一化と葉の検査 (DSL.md §16.7): 重ねたあとの木の、すべての道筋が葉で終わるか。終わらなければ、道筋つきで報告する

const tmpRoot = join(import.meta.dirname, ".tmp-leaves");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// uses: Layer 1 のまとまり、commands: コマンドのまとまりの中身、items: 解釈に並べるもの
function specDir(spec: { uses?: string; commands: string; states?: string; items?: string }) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { all, calculations, commands, conditions, data, effects, input, interpretation, not, otherwise, queries, service, states } from "@clp/core";
export const State = states(${spec.states ?? `["OPEN", "DONE"]`});
export const If = conditions({ big: "It is big", odd: "It is odd" });
export const Effect = effects({ Notify: input({}), Extra: input({}) });
export const Command = commands({ ${spec.commands} });
export const Thing = service({ init: State.OPEN, uses: [State, If, ${spec.uses ?? ""} Command] });
export const Interpretation = interpretation(Thing, [${spec.items ?? ""}]);
`,
  );
  return dir;
}
const report = async (dir: string) => extract(await loadSpecs(dir)).diagnostics.map((d) => `${d.code}: ${d.message}`);

test("起きることの末端: 文で言われた「起きること」が構造になっていなければ、道筋つきで報告する。nothing: true で明示できる", async () => {
  const layer1 = { uses: "effects({ Notify: input({}) }),", commands: `Close: "The thing is closed and a notice is sent."` };
  assert.deepEqual(await report(specDir(layer1)), ["incomplete: commands.Close: 文で言われた「起きること」が、構造になっていません。何も起きないなら nothing: true と書きます"]);
  assert.deepEqual(await report(specDir({ ...layer1, items: `Command.Close.with({ goTo: State.DONE, emits: [Effect.Notify()] })` })), []);
  assert.deepEqual(await report(specDir({ ...layer1, items: `Command.Close.with({ nothing: true })` })), []);
  // nothing と、起きることを両方書くのは、誤り
  assert.match((await report(specDir({ ...layer1, items: `Command.Close.with({ nothing: true, goTo: State.DONE })` }))).join("\n"), /commands\.Close: nothing と、起きること \(goTo\) が両方あります/);
  // 場合ごと: 文のある場合だけを見る
  const cased = { commands: `Go: { cases: [If.big.then({ does: "It moves." }), otherwise] }`, items: `If.big.means(() => true)` };
  assert.deepEqual(await report(specDir(cased)), ['incomplete: commands.Go.cases.It is big: 文で言われた「起きること」が、構造になっていません。何も起きないなら nothing: true と書きます']);
});

test("必須の席と、文だけのまとまり: 型の無い項目、項目の来なかったまとまり、otherwise の無い場合分け", async () => {
  const found = await report(
    specDir({
      uses: `data({ memo: { description: "A note." } }), queries("Whether it is raining."),`,
      commands: `Go: { cases: [If.big.then({ goTo: State.DONE })] }`,
      items: `If.big.means(() => true)`,
    }),
  );
  assert.deepEqual(found.sort(), [
    "incomplete: commands.Go.cases: otherwise がありません",
    "incomplete: data.memo.type: 型がありません",
    "incomplete: queries: 文だけのまま、項目がありません。解釈で項目を宣言してください",
  ]);
});

test("文の葉: 使われた条件・計算・不変条件に意味の関数が要る。組み合わせは、組み合わせる前の条件を見る", async () => {
  const found = await report(
    specDir({
      commands: `Go: { cases: [all(If.big, not(If.odd)).then({ goTo: State.DONE }), otherwise] }`,
      uses: `calculations({ total: { description: "the sum", output: "integer" } }),`,
      items: `If.big.means(() => true)`,
    }),
  );
  assert.deepEqual(found.sort(), ['incomplete: calculations.total: 意味の関数がありません（解釈の meanings に書きます）', 'incomplete: conditions."It is odd": 意味の関数がありません（解釈の meanings に書きます）']);
});

test("単一化: 閉じたまとまり（Layer 1 が項目を並べたもの）には足せない。計算は開いている。ぶつかりは道筋で言う", async () => {
  const layer1 = { uses: "effects({ Notify: input({}) }),", commands: `Go: { goTo: State.DONE }` };
  assert.match((await report(specDir({ ...layer1, items: `effects({ Extra: {} })` }))).join("\n"), /effects\.Extra: Layer 1 にありません/);
  assert.deepEqual(await report(specDir({ ...layer1, items: `calculations({ half: { description: "half", output: "integer" } })` })), ["incomplete: calculations.half: 意味の関数がありません（解釈の meanings に書きます）"]);
  assert.match((await report(specDir({ ...layer1, items: `Command.Go.with({ goTo: State.OPEN })` }))).join("\n"), /commands\.Go\.goTo: Layer 1 に書かれているので、解釈では書けません/);
});

test("到達点: 解釈が足した語彙が使われていなければ、strict で誤り（Layer 1 の語彙は注意のまま）。終わりの状態を宣言したら、出口の無い状態は誤り", async () => {
  const spec = await loadSpecs(specDir({ uses: "effects({ Notify: input({}) }),", commands: `Go: { goTo: State.DONE }`, items: `` }));
  const strict = graphDiagnostics(spec, undefined, true).map((d) => `${d.severity}[${d.code}]`);
  assert.deepEqual(strict, ["warning[unused-effect]"]);
  const prose = await loadSpecs(
    specDir({ uses: `effects("A notice."),`, commands: `Go: { goTo: State.DONE }`, items: `effects({ Notice: input({}) })` }),
  );
  assert.deepEqual(graphDiagnostics(prose, undefined, true).map((d) => `${d.severity}[${d.code}]`), ["error[unused-effect]"]);
  assert.deepEqual(graphDiagnostics(prose).map((d) => `${d.severity}[${d.code}]`), ["warning[unused-effect]"]);

  // 終わりの状態: DONE は終わり。STUCK は終わりでないのに出口が無い
  const finals = await loadSpecs(
    specDir({ states: `{ OPEN: "Open.", STUCK: "Stuck.", DONE: { description: "Done.", final: true } }`, commands: `Go: { from: State.OPEN, cases: [If.big.then({ goTo: State.DONE }), otherwise({ goTo: State.STUCK })] }`, items: `If.big.means(() => true)` }),
  );
  assert.deepEqual(extract(finals).diagnostics, []);
  assert.deepEqual((extract(finals).ir as { model: { final: string[] } }).model.final, ["DONE"]);
  assert.deepEqual(graphDiagnostics(finals).map((d) => d.message), ['状態 "STUCK" は終わりの状態ではありませんが、どのコマンドでも、ほかの状態へ出られません。出るコマンドを書くか、終わりの状態 (final: true) にしてください']);
});
