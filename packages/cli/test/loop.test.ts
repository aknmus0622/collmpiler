import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkWorkspace } from "../src/check.ts";
import { extract, stableStringify } from "../src/extract.ts";
import { generateAdapterSkeleton, generateContract, generateVerify } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import { write } from "./fixtures/scripted-agent.ts";

// 作業ディレクトリは packages/cli 配下に置く（verify.ts が @aac/cli/runtime を解決できる場所）
const tmpRoot = join(import.meta.dirname, ".tmp");
const specsDir = join(import.meta.dirname, "../../../specs");
const agent = `"${process.execPath}" "${join(import.meta.dirname, "fixtures/scripted-agent.ts")}"`;

mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));
const workdir = () => mkdtempSync(join(tmpRoot, "w-"));

async function run(script: string, maxAttempts: number) {
  process.env.AAC_SCRIPT = script;
  const out = workdir();
  return { out, ...(await implement({ specs: specsDir, out, agent, maxAttempts })) };
}

test("ループ: PBT の反例 → 余計なもの検査の違反 → 合格", async () => {
  const { out, status, attempts } = await run("buggy,cheat,correct", 3);
  assert.equal(status, "pass");
  assert.deepEqual(attempts.map((a) => a.feedback?.kind ?? "pass"), ["pbt", "check", "pass"]);

  // 1回目: シルバー会員の割引違いが、最小の反例として報告される
  const first = attempts[0].feedback;
  assert.ok(first?.kind === "pbt" && first.result.status === "fail");
  assert.equal(first.result.given.data.rank, "Silver");
  assert.deepEqual(first.result.expected, {
    state: "PAID",
    commands: [{ action: "SendReceipt", payload: { discount: 0.05 } }],
  });
  assert.deepEqual(first.result.actual, {
    state: "PAID",
    commands: [{ action: "SendReceipt", payload: { discount: 0.5 } }],
  });

  // 2回目: アダプターに業務ロジックを書いたので PBT の前に弾かれる
  const second = attempts[1].feedback;
  assert.ok(second?.kind === "check");
  assert.deepEqual([...new Set(second.violations.map((v) => v.rule))], ["adapter-logic"]);

  // 差し戻しの内容は依頼ファイルに書かれる
  assert.match(readFileSync(join(out, "aac/REQUEST.md"), "utf8"), /attempt 3[\s\S]*adapter-logic/);
});

test("ループ: 上限回数まで直らなければ失敗で止まる", async () => {
  const { status, attempts } = await run("buggy", 2);
  assert.equal(status, "fail");
  assert.equal(attempts.length, 2);
});

test("ループ: 検証は決定的 (同じ実装なら同じシード・同じ反例)", async () => {
  const a = await run("buggy", 1);
  const b = await run("buggy", 1);
  assert.deepEqual(a.attempts, b.attempts);
});

// --- 余計なもの検査 ---

async function workspace() {
  const out = workdir();
  const ir = JSON.parse(stableStringify((await extract(await loadSpecs(specsDir))).ir)) as Ir;
  mkdirSync(join(out, "aac"), { recursive: true });
  writeFileSync(join(out, "aac/ir.json"), stableStringify(ir));
  writeFileSync(join(out, "aac/adapter.contract.ts"), generateContract(ir));
  writeFileSync(join(out, "aac/verify.ts"), generateVerify(ir, join(out, "aac"), specsDir));
  write("correct", out);
  const rules = () => checkWorkspace(out, ir, specsDir).map((v) => `${v.file}:${v.rule}`);
  const edit = (file: string, fn: (text: string) => string) =>
    writeFileSync(join(out, file), fn(readFileSync(join(out, file), "utf8")));
  return { out, rules, edit };
}

test("検査: 正しい実装は違反なし", async () => {
  assert.deepEqual((await workspace()).rules(), []);
});

test("検査: 未実装のスケルトンだけでは本番コードが無いので違反", async () => {
  const { out, rules } = await workspace();
  rmSync(join(out, "src"), { recursive: true });
  writeFileSync(join(out, "aac/adapter.ts"), generateAdapterSkeleton());
  assert.deepEqual(rules(), ["src:missing-file"]);
});

test("検査: 本番コードはフレームワーク・仕様・テスト側・組み込みモジュールに依存できない", async () => {
  const { rules, edit } = await workspace();
  edit("src/order-service.ts", (text) =>
    [
      `import { applyDecision } from "@aac/core";`,
      `import ir from "../aac/ir.json" with { type: "json" };`,
      `import { readFileSync } from "node:fs";`,
      `export * from "../../../../../specs/campaign.dmn.ts";`,
      text,
    ].join("\n"),
  );
  assert.deepEqual(rules(), Array(4).fill("src/order-service.ts:forbidden-import"));
});

test("検査: 動的ロードは不可。コメント・文字列・正規表現の中は対象外", async () => {
  const { rules, edit } = await workspace();
  edit("src/order-service.ts", (text) => `// import x from "node:fs"\nconst s = 'import("node:fs")'; const r = /from "x"/;\n${text}`);
  assert.deepEqual(rules(), []);
  edit("src/order-service.ts", (text) => `const fs = await import("node:fs");\n${text}`);
  assert.deepEqual(rules(), ["src/order-service.ts:dynamic-import"]);
});

test("検査: 生成ファイルの書き換え・削除、余計なファイルの追加", async () => {
  const { out, rules, edit } = await workspace();
  edit("aac/verify.ts", (text) => text.replace("await runPbt", "// await runPbt"));
  rmSync(join(out, "aac/ir.json"));
  writeFileSync(join(out, "aac/helper.ts"), "");
  writeFileSync(join(out, "notes.md"), "");
  writeFileSync(join(out, "src/data.json"), "{}");
  assert.deepEqual(rules().sort(), [
    "aac/helper.ts:unexpected-file",
    "aac/ir.json:generated-file-modified",
    "aac/verify.ts:generated-file-modified",
    "notes.md:unexpected-file",
    "src/data.json:unexpected-file",
  ]);
});

test("検査: アダプターは data の中身・数値・ルール名に触れられない", async () => {
  const { rules, edit } = await workspace();
  edit("aac/adapter.ts", (text) =>
    text.replace(
      "service.load(state, data);",
      'service.load(state, data);\n    if (data.isMonthEnd) service.outbox.push({ rate: 0.2, why: "シルバー会員の場合", tpl: `${data.rank}` });',
    ),
  );
  assert.deepEqual(rules(), Array(4).fill("aac/adapter.ts:adapter-logic"));
});

test("検査: アダプターは仕様や IR を import できない", async () => {
  const { rules, edit } = await workspace();
  edit("aac/adapter.ts", (text) => `import { CampaignRules } from "../../../../../specs/campaign.dmn.ts";\n${text}`);
  assert.deepEqual(rules(), ["aac/adapter.ts:forbidden-import"]);
});
