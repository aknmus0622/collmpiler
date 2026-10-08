import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import { extract, referenceDiagnostics, referenceEvents } from "../src/extract.ts";
import { listComponents, loadSpecs } from "../src/loader.ts";
import { stage1References } from "../src/stage1.ts";
import { repoRoot, specsDir } from "./support.ts";

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
    }
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
