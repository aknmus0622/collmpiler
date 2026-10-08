import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { harness, repoRoot, specsDir } from "./support.ts";

// clp コマンド: サブコマンドの振り分け、使い方の表示、終了コード

const { tmpRoot } = harness("cli");
const clp = (args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) =>
  spawnSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), ...args], { encoding: "utf8", cwd: options.cwd ?? repoRoot, env: { ...process.env, ...options.env } });

test("clp: 使い方を表示する。コマンドが無い・知らないコマンドは、使い方と一緒に終了コード 2", () => {
  const help = clp(["--help"]);
  assert.equal(help.status, 0);
  for (const name of ["compile", "interpret", "apply", "verify"]) assert.match(help.stdout, new RegExp(`^  ${name} `, "m"));
  // 内部用のコマンドは、一覧に出さない
  assert.doesNotMatch(help.stdout, /__compare/);

  assert.equal(clp([]).status, 2);
  const unknown = clp(["implement"]);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /"implement" というコマンドはありません/);

  // コマンドごとの使い方
  for (const name of ["compile", "interpret", "apply", "verify"]) {
    const usage = clp([name, "--help"]);
    assert.equal(usage.status, 0);
    assert.match(usage.stdout, new RegExp(`^clp ${name} `));
  }
});

test("clp: 引数の誤りは、何が違うかと使い方を伝えて、終了コード 2", () => {
  const bogus = clp(["apply", "--bogus"]);
  assert.equal(bogus.status, 2);
  assert.match(bogus.stderr, /clp apply: Unknown option '--bogus'[\s\S]*clp apply \(--out <dir>/);
  const noOutput = clp(["apply"]);
  assert.equal(noOutput.status, 2);
  assert.match(noOutput.stderr, /出力先を指定してください/);
  assert.equal(clp(["verify"]).status, 2);
  const noAgent = clp(["interpret"]);
  assert.equal(noAgent.status, 2);
  assert.match(noAgent.stderr, /エージェントを指定してください \(--agent\)。確定するなら --accept です/);
});

test("clp compile: IR を標準出力に出す。呼び出した場所からの相対パスで読む", () => {
  const fromRoot = clp(["compile", "examples/checkout-ts/specs"]);
  assert.equal(fromRoot.status, 0);
  assert.equal(JSON.parse(fromRoot.stdout).irVersion, 5);
  // 別のディレクトリから呼んでも、同じ IR になる
  // 仕様のあるディレクトリ（プロジェクト）から呼べば、既定の specs が使われる
  const fromExample = clp(["compile"], { cwd: join(repoRoot, "examples/checkout-ts") });
  assert.equal(fromExample.stdout, fromRoot.stdout);
  assert.equal(clp(["compile", "specs"], { cwd: join(repoRoot, "examples/checkout-ts") }).stdout, fromRoot.stdout);
});

test("clp verify: すでにある本番コードを検証する。何も書き換えない。コンポーネントを選べる", () => {
  const passed = clp(["verify", "--specs", "examples/checkout-ts/specs", "--out", "examples/checkout-ts", "--runs", "50", "--seed", "7"]);
  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /CLP_RESULT \{"status":"pass","seed":7,"numRuns":50\}/);

  // フレームワーク自身の仕様: コンポーネントごとに実行する
  const self = ["verify", "--specs", "packages/cli/self/specs", "--out", "packages/cli/self", "--runs", "20"];
  const all = clp(self);
  assert.equal(all.status, 0);
  assert.equal(all.stdout.match(/CLP_RESULT \{"status":"pass"/g)?.length, 4);
  const one = clp([...self, "--component", "pipeline"]);
  assert.equal(one.stdout.match(/CLP_RESULT/g)?.length, 1);
  assert.equal(clp([...self, "--component", "nobody"]).status, 2);

  // テストの入口が無い出力先
  const empty = clp(["verify", "--specs", specsDir, "--out", mkdtempSync(join(tmpRoot, "empty-"))]);
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /テストの入口 \(clp\/order\.verify\.ts\) がありません。先に clp apply を実行してください/);
  // 仕様の無い場所で呼んだ
  const nowhere = clp(["verify", "--out", "examples/checkout-ts"]);
  assert.equal(nowhere.status, 1);
  assert.match(nowhere.stderr, /仕様のディレクトリがありません: [\s\S]*specs[\s\S]*--specs/);
});

test("clp apply: エージェントを指定しなくても、検証とテスト側の生成はできる。エージェントが要る場面では、そう伝えて止まる", () => {
  // すでに一致している出力先（写し）: 採点だけで終わる
  const out = mkdtempSync(join(tmpRoot, "out-"));
  cpSync(join(repoRoot, "examples/checkout-ts/src"), join(out, "src"), { recursive: true });
  cpSync(join(repoRoot, "examples/checkout-ts/clp"), join(out, "clp"), { recursive: true });
  const settled = clp(["apply", "--out", out, "--specs", specsDir, "--mutation", "off"]);
  assert.equal(settled.status, 0, settled.stderr);
  assert.match(settled.stderr, /verify: pass \(nothing to implement\)/);
  assert.equal(JSON.parse(settled.stdout).status, "pass");

  // 何も無い出力先: 設計の段階にエージェントが要る
  const fresh = clp(["apply", "--out", mkdtempSync(join(tmpRoot, "fresh-")), "--specs", specsDir]);
  assert.equal(fresh.status, 1);
  assert.match(fresh.stderr, /clp apply: design の段階 \(1 回目\) を進めるには、エージェントが要ります。--agent "<command>" を指定してください/);
});

after(() => rmSync(tmpRoot, { recursive: true, force: true }));
