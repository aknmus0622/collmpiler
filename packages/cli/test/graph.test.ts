import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { graphDiagnostics } from "../src/graph.ts";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import type { ImplementationStrategy } from "../src/strategy.ts";
import { repoRoot, specsDir } from "./support.ts";

// グラフを土台にした検査: 仕様を実行せずに、書かれた構造だけから分かること（たどり着けない状態、使われない語彙）

const tmpRoot = join(import.meta.dirname, ".tmp-graph");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 語彙 (data / queries / effects の中身) と、コマンド (commands の中身)、解釈が足すもの (added) から、仕様を作る
function specDir(options: { data?: string; queries?: string; effects?: string; commands: string; added?: string }) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  const groups = [options.data ? "Data" : "", options.queries ? "Query" : "", options.effects ? "Effect" : ""].filter(Boolean);
  writeFileSync(
    join(dir, "trip.component.ts"),
    `import { commands, conditions, data, effects, input, interpretation, otherwise, queries, service, states } from "@clp/core";
const State = states(["PLANNED", "STARTED", "DONE", "ARCHIVED"]);
const If = conditions({ rains: "It rains" });
const Data = data(${options.data ?? "{}"});
const Query = queries(${options.queries ?? "{}"});
const Effect = effects(${options.effects ?? "{}"});
// 尋ねた答えの名前
const Asked = queries({ far: "string" });
const In = input({ place: "string" });
const Command = commands({
${options.commands}
});
export const Trip = service({ init: State.PLANNED, uses: [State, ${groups.map((name) => `${name}, `).join("")}If, Command] });
export const Interpretation = interpretation(Trip, [${options.added ?? ""}${options.added ? ", " : ""}If.rains.means(() => false)]);
`,
  );
  return dir;
}
const found = async (dir: string) => graphDiagnostics(await loadSpecs(dir)).map((d) => `${d.severity}[${d.code}] ${d.message}`);

test("グラフ: 初期状態からたどり着けない状態と、実行されることのないコマンドは、エラー", async () => {
  const dir = specDir({
    commands: `    Start: { from: State.PLANNED, goTo: State.STARTED },
    Finish: { from: State.STARTED, cases: [If.rains.then({}), otherwise({ goTo: State.DONE })] },
    Restore: { from: State.ARCHIVED, goTo: State.PLANNED },
    Never: { from: [] },`,
  });
  assert.deepEqual(await found(dir), [
    'error[unreachable-state] 状態 "ARCHIVED" には、初期状態 "PLANNED" から、どのコマンドでもたどり着けません。そこへ遷移する (goTo) コマンドを書くか、状態を消してください',
    'error[unreachable-command] コマンド "Restore" は、実行されることがありません: 実行できる状態 (ARCHIVED) のどれにも、たどり着けません',
    'error[unreachable-command] コマンド "Never" は、実行されることがありません: 実行できる状態 (from) が、1つもありません',
  ]);
  // extract の診断（解釈を重ねて分かる誤り）には、含めない
  assert.deepEqual(extract(await loadSpecs(dir)).diagnostics, []);

  // どこからでも実行できるコマンド（from が無い）は、どの状態にも道を作る
  const anywhere = specDir({
    commands: `    Start: { from: State.PLANNED, goTo: State.STARTED },
    Finish: { goTo: State.DONE },
    Archive: { from: State.DONE, goTo: State.ARCHIVED },`,
  });
  assert.deepEqual(await found(anywhere), []);
});

test("グラフ: 起こされない副作用、覚えられないデータ、尋ねられない引数つきの問い合わせは、注意", async () => {
  const vocabulary = {
    data: `{ note: "string", miles: "integer" }`,
    queries: `{ weather: "string", distanceTo: { input: input({ place: "string" }), output: "integer" }, fareTo: { input: input({ place: "string" }), output: "integer" } }`,
    effects: `{ Notify: input({ miles: "integer" }), Bill: input({ amount: "integer" }) }`,
  };
  const commands = `    Start: { input: In, from: State.PLANNED, goTo: State.STARTED },
    Finish: { from: State.STARTED, goTo: State.DONE },
    Archive: { from: State.DONE, goTo: State.ARCHIVED },`;
  const unused = specDir({ ...vocabulary, commands });
  assert.deepEqual(await found(unused), [
    'warning[unused-effect] 副作用 "Notify" を起こす (emits) コマンドが、1つもありません',
    'warning[unused-effect] 副作用 "Bill" を起こす (emits) コマンドが、1つもありません',
    'warning[unset-data] データ "note" を覚える (set) コマンドが、1つもありません。いつも未設定のままです',
    'warning[unset-data] データ "miles" を覚える (set) コマンドが、1つもありません。いつも未設定のままです',
    'warning[unasked-query] 引数つきの問い合わせ "distanceTo" を尋ねる (asks) コマンドが、1つもありません',
    'warning[unasked-query] 引数つきの問い合わせ "fareTo" を尋ねる (asks) コマンドが、1つもありません',
  ]);
  // 使えば、何も言わない。引数の無い問い合わせ (weather) は、意味の関数が読むかもしれないので、対象にしない
  const used = specDir({
    ...vocabulary,
    commands,
    added: `Command.Start.with({ asks: [Query.distanceTo({ place: In.place }).as("far"), Query.fareTo({ place: "home" }).as("fare")], set: [Data.miles.set(Asked.far), Data.note.set("go")], emits: [Effect.Notify({ miles: Asked.far })] }), Command.Finish.with({ emits: [Effect.Bill({ amount: Data.miles })] })`,
  });
  assert.deepEqual(await found(used), []);
});

test("グラフ: 例の仕様と、フレームワーク自身の仕様には、何も見つからない", async () => {
  for (const dir of [specsDir, join(repoRoot, "examples/library-ts/specs"), join(repoRoot, "packages/cli/self/specs")]) {
    for (const component of await listComponents(dir)) assert.deepEqual(graphDiagnostics(await loadSpecs(dir, { component })), [], `${dir} ${component}`);
  }
});

test("グラフ: clp compile と clp apply は、たどり着けない状態で止まる。注意は、止めない", async () => {
  const clp = (dir: string) => spawnSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), "compile", dir], { encoding: "utf8" });
  const unreachable = specDir({ commands: `    Start: { from: State.PLANNED, goTo: State.STARTED },\n    Finish: { from: State.STARTED, goTo: State.DONE },` });
  const rejected = clp(unreachable);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /error\[unreachable-state\] 状態 "ARCHIVED" には、初期状態 "PLANNED" から、どのコマンドでもたどり着けません/);

  const called: string[] = [];
  const strategy: ImplementationStrategy = { name: "nobody", run: ({ phase }) => void called.push(phase) };
  await assert.rejects(implement({ specs: unreachable, out: mkdtempSync(join(tmpRoot, "out-")), strategy }), /仕様 \(trip\) にエラーがあります:[\s\S]*状態 "ARCHIVED" には/);
  assert.deepEqual(called, []);

  const warned = clp(
    specDir({
      effects: `{ Notify: input({}) }`,
      commands: `    Start: { from: State.PLANNED, goTo: State.STARTED },\n    Finish: { from: State.STARTED, goTo: State.DONE },\n    Archive: { from: State.DONE, goTo: State.ARCHIVED },`,
    }),
  );
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(warned.stderr, /warning\[unused-effect\] 副作用 "Notify" を起こす/);
});
