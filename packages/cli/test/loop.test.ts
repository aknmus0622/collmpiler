import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkWorkspace } from "../src/check.ts";
import { extract, stableStringify } from "../src/extract.ts";
import { scrubEnv } from "../src/gates.ts";
import { generateAdapterSkeleton, generateContract, generateVerify } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import { commandStrategy } from "../src/strategy.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { write } from "./fixtures/scripted-agent.ts";
import type { Step } from "./fixtures/scripted-agent.ts";

// 出力先は packages/cli 配下に置く（verify.ts が @aac/cli/runtime を解決できる場所）
const repoRoot = join(import.meta.dirname, "../../..");
const tmpRoot = join(import.meta.dirname, ".tmp");
const specsDir = join(repoRoot, "specs");

mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));
const workdir = () => mkdtempSync(join(tmpRoot, "w-"));

// LLM の代役の Strategy。決まった実装を順に書き出し、作業場所で見えたものを記録する
function scripted(steps: Step[], extra?: (assignment: Assignment) => void) {
  const seen: { dir: string; files: Record<string, string> }[] = [];
  const strategy: ImplementationStrategy = {
    name: `scripted(${steps.join(",")})`,
    run(assignment) {
      const files: Record<string, string> = {};
      for (const name of readdirSync(assignment.dir, { recursive: true }) as string[]) {
        const path = join(assignment.dir, name);
        if (!name.includes(".")) continue;
        files[name.split("\\").join("/")] = readFileSync(path, "utf8");
      }
      seen.push({ dir: assignment.dir, files });
      write(steps[Math.min(assignment.attempt, steps.length) - 1], assignment.dir);
      extra?.(assignment);
    },
  };
  return { strategy, seen };
}

async function run(steps: Step[], maxAttempts: number, extra?: (assignment: Assignment) => void) {
  const out = workdir();
  const { strategy, seen } = scripted(steps, extra);
  return { out, seen, ...(await implement({ specs: specsDir, out, strategy, maxAttempts })) };
}

test("ループ: PBT の反例 → 余計なもの検査の違反 → 合格", async () => {
  const { out, seen, status, attempts } = await run(["buggy", "cheat", "correct"], 3);
  assert.equal(status, "pass");
  assert.deepEqual(attempts.map((a) => a.feedback?.kind ?? "pass"), ["pbt", "check", "pass"]);

  // 1回目: シルバー会員の割引違いが、最小の反例 (1手) として報告される
  const first = attempts[0].feedback;
  assert.ok(first?.kind === "pbt" && first.result.status === "fail");
  assert.deepEqual(
    first.result.steps.map((s) => [s.from, s.action, s.outcome, s.input.rank]),
    [["PENDING", "Checkout", "PaymentSuccess", "Silver"]],
  );
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

  // 差し戻しは次の依頼文に載り、前回の成果も作業場所に引き継がれる
  assert.match(seen[1].files["aac/REQUEST.md"], /attempt 2[\s\S]*"discount": 0.5/);
  assert.match(seen[2].files["aac/REQUEST.md"], /attempt 3[\s\S]*adapter-logic/);
  assert.ok("src/order-service.ts" in seen[1].files);

  // 合格した実装と採点基準は出力先に揃う
  assert.deepEqual(readdirSync(join(out, "aac")).sort(), ["adapter.contract.ts", "adapter.ts", "ir.json", "verify.ts"]);
  assert.deepEqual(readdirSync(join(out, "src")), ["order-service.ts"]);
});

test("複数ステップ: 2手でしか現れない不具合を、最小のアクション列まで縮めて報告する", async () => {
  const { attempts } = await run(["norefund"], 1);
  const feedback = attempts[0].feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  // 決済に成功してからキャンセルしたときだけ、返金が必要になる
  assert.deepEqual(
    feedback.result.steps.map((s) => [s.from, s.action, s.outcome]),
    [
      ["PENDING", "Checkout", "PaymentSuccess"],
      ["PAID", "Cancel", "Cancelled"],
    ],
  );
  assert.deepEqual(feedback.result.expected, { state: "CANCELLED", commands: [{ action: "Refund", payload: {} }] });
  assert.deepEqual(feedback.result.actual, { state: "CANCELLED", commands: [] });
});

test("隔離: エージェントに渡るのは許可した4ファイルだけで、リポジトリへの手がかりを含まない", async () => {
  const { seen, attempts } = await run(["correct"], 1);
  const inputs = ["aac/REQUEST.md", "aac/adapter.contract.ts", "aac/adapter.ts", "aac/ir.json"];
  assert.deepEqual(Object.keys(seen[0].files).sort(), inputs);
  assert.deepEqual(attempts[0].inputs, inputs);

  // 作業場所はリポジトリの外にあり、終了後は消える
  assert.ok(!seen[0].dir.startsWith(repoRoot));
  assert.ok(!existsSync(seen[0].dir));

  // 仕様のソース・PBT のグルー・リポジトリのパス・Layer 2 の評価関数は渡らない
  const everything = Object.values(seen[0].files).join("\n");
  assert.ok(!everything.includes(repoRoot));
  assert.ok(!everything.includes("specs/"));
  assert.ok(!everything.includes("verify.ts"));
  assert.ok(!everything.includes('=== "Gold"'));
});

test("隔離: 環境変数からリポジトリのパスを取り除く", () => {
  const env = scrubEnv(
    { PWD: "/repo/sub", INIT_CWD: "/repo", PATH: "/repo/node_modules/.bin:/usr/bin:/bin", HOME: "/home/u", LANG: "C" },
    ["/repo"],
  );
  assert.deepEqual(env, { PATH: "/usr/bin:/bin", HOME: "/home/u", LANG: "C" });
});

test("出口ゲート: 許可した出力以外は取り出さず、違反として差し戻す", async () => {
  const { out, attempts } = await run(["correct"], 1, ({ dir }) => {
    writeFileSync(join(dir, "notes.md"), "memo");
    writeFileSync(join(dir, "aac/helper.ts"), "export {};");
    writeFileSync(join(dir, "aac/ir.json"), "{}");
    rmSync(join(dir, "aac/adapter.contract.ts"));
    symlinkSync(join(specsDir, "vocabulary.ts"), join(dir, "src/oracle.ts"));
  });
  const feedback = attempts[0].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`).sort(), [
    "aac/adapter.contract.ts:generated-file-modified",
    "aac/helper.ts:unexpected-file",
    "aac/ir.json:generated-file-modified",
    "notes.md:unexpected-file",
    "src/oracle.ts:unexpected-file",
  ]);
  assert.ok(!existsSync(join(out, "notes.md")));
  assert.ok(!existsSync(join(out, "aac/helper.ts")));
  assert.ok(!existsSync(join(out, "src/oracle.ts")));
  // 採点基準は作業場所での改ざんの影響を受けない
  assert.notEqual(readFileSync(join(out, "aac/ir.json"), "utf8"), "{}");
});

test("ループ: 上限回数まで直らなければ失敗で止まる", async () => {
  const { status, attempts } = await run(["buggy"], 2);
  assert.equal(status, "fail");
  assert.equal(attempts.length, 2);
});

test("ループ: 検証は決定的 (同じ実装なら同じシード・同じ反例)", async () => {
  const a = await run(["buggy"], 1);
  const b = await run(["buggy"], 1);
  assert.deepEqual(a.attempts, b.attempts);
});

test("ループ: fresh を指定すると既存の実装を引き継がない", async () => {
  const first = await run(["correct"], 1);
  const { strategy, seen } = scripted(["correct"]);
  await implement({ specs: specsDir, out: first.out, strategy, maxAttempts: 1 });
  assert.ok("src/order-service.ts" in seen[0].files);
  await implement({ specs: specsDir, out: first.out, strategy, maxAttempts: 1, fresh: true });
  assert.ok(!("src/order-service.ts" in seen[1].files));
  assert.equal(seen[1].files["aac/adapter.ts"], generateAdapterSkeleton());
});

test("コマンド Strategy: 外部コマンドを作業場所で起動する", async () => {
  process.env.AAC_SCRIPT = "buggy,correct";
  const strategy = commandStrategy(`"${process.execPath}" "${join(import.meta.dirname, "fixtures/scripted-agent.ts")}"`);
  const { status, attempts } = await implement({ specs: specsDir, out: workdir(), strategy, maxAttempts: 2 });
  assert.equal(status, "pass");
  assert.equal(attempts.length, 2);
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

test("検査: アダプターは入力の中身・数値・ルール名に触れられない", async () => {
  const { rules, edit } = await workspace();
  edit("aac/adapter.ts", (text) =>
    text.replace(
      'if (action === "Ship")',
      'if (input.rank) ports.commands.SendReceipt({ discount: 0.2, why: "シルバー会員の場合", tpl: `${"Gold"}` } as never);\n    if (action === "Ship")',
    ),
  );
  assert.deepEqual(rules(), Array(4).fill("aac/adapter.ts:adapter-logic"));
});

test("検査: アダプターは仕様や IR を import できない", async () => {
  const { rules, edit } = await workspace();
  edit("aac/adapter.ts", (text) => `import { CampaignRules } from "../../../../../specs/campaign.dmn.ts";\n${text}`);
  assert.deepEqual(rules(), ["aac/adapter.ts:forbidden-import"]);
});
