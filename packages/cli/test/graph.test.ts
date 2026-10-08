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

// 語彙の中身 (vocabulary) と、コマンド (commands)、解釈が足すもの (added) から、仕様を作る
function specDir(options: { vocabulary?: string; commands: string; added?: string }) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  const names = [...options.commands.matchAll(/^\s*(\w+): component\(/gm)].map((match) => match[1]);
  writeFileSync(
    join(dir, "trip.component.ts"),
    `import { asks, component, emits, from, goTo, input, interpretation, otherwise, output, ref, set, when } from "@clp/core";
export const Trip = component({
  states: ["PLANNED", "STARTED", "DONE", "ARCHIVED"],
  init: "PLANNED",
  ${options.vocabulary ?? ""}
  commands: {
${options.commands}
  },
});
export const Interpretation = interpretation(Trip, {
  commands: { ${options.added ?? names.map((name) => `${name}: component()`).join(", ")} },
  meanings: { conditions: { "It rains": () => false } },
});
`,
  );
  return dir;
}
const found = async (dir: string) => graphDiagnostics(await loadSpecs(dir)).map((d) => `${d.severity}[${d.code}] ${d.message}`);

test("グラフ: 初期状態からたどり着けない状態と、実行されることのないコマンドは、エラー", async () => {
  const dir = specDir({
    commands: `    Start: component(from("PLANNED"), goTo("STARTED")),
    Finish: component(from("STARTED"), when("It rains"), otherwise(goTo("DONE"))),
    Restore: component(from("ARCHIVED"), goTo("PLANNED")),
    Never: component(from()),`,
    added: `Start: component(), Finish: component(when("It rains"), otherwise()), Restore: component(), Never: component()`,
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
    commands: `    Start: component(from("PLANNED"), goTo("STARTED")),
    Finish: component(goTo("DONE")),
    Archive: component(from("DONE"), goTo("ARCHIVED")),`,
  });
  assert.deepEqual(await found(anywhere), []);
});

test("グラフ: 起こされない副作用、覚えられないデータ、尋ねられない引数つきの問い合わせは、注意", async () => {
  const vocabulary = `data: { note: "string", miles: "integer" },
  queries: { weather: output("string"), distanceTo: component(input({ place: "string" }), output("integer")), fareTo: component(input({ place: "string" }), output("integer")) },
  effects: { Notify: input({ miles: "integer" }), Bill: input({ amount: "integer" }) },`;
  const commands = `    Start: component(input({ place: "string" }), from("PLANNED"), goTo("STARTED")),
    Finish: component(from("STARTED"), goTo("DONE")),
    Archive: component(from("DONE"), goTo("ARCHIVED")),`;
  const unused = specDir({ vocabulary, commands });
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
    vocabulary,
    commands,
    added: `Start: component(asks("far", "distanceTo", { place: ref.input("place") }), asks("fare", "fareTo", { place: "home" }), set({ miles: ref.query("far"), note: "go" }), emits("Notify", { miles: ref.query("far") })), Finish: component(emits("Bill", { amount: ref.data("miles") })), Archive: component()`,
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
  const unreachable = specDir({ commands: `    Start: component(from("PLANNED"), goTo("STARTED")),\n    Finish: component(from("STARTED"), goTo("DONE")),` });
  const rejected = clp(unreachable);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /error\[unreachable-state\] 状態 "ARCHIVED" には、初期状態 "PLANNED" から、どのコマンドでもたどり着けません/);

  const called: string[] = [];
  const strategy: ImplementationStrategy = { name: "nobody", run: ({ phase }) => void called.push(phase) };
  await assert.rejects(implement({ specs: unreachable, out: mkdtempSync(join(tmpRoot, "out-")), strategy }), /仕様 \(trip\) にエラーがあります:[\s\S]*状態 "ARCHIVED" には/);
  assert.deepEqual(called, []);

  const warned = clp(
    specDir({
      vocabulary: `effects: { Notify: input({}) },`,
      commands: `    Start: component(from("PLANNED"), goTo("STARTED")),\n    Finish: component(from("STARTED"), goTo("DONE")),\n    Archive: component(from("DONE"), goTo("ARCHIVED")),`,
    }),
  );
  assert.equal(warned.status, 0, warned.stderr);
  assert.match(warned.stderr, /warning\[unused-effect\] 副作用 "Notify" を起こす/);
});
