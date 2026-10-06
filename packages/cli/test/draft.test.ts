import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { draftBinding } from "../src/draft.ts";
import { extract } from "../src/extract.ts";
import { loadSpecs } from "../src/loader.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";

// 結び付けの下書き。LLM の代役として、決まった内容を書く Strategy を使う。
// 仕様のコピーは packages/cli 配下に置く（@aac/core を解決できる場所）

const repoRoot = join(import.meta.dirname, "../../..");
const tmpRoot = join(import.meta.dirname, ".tmp-drafts");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

const reviewed = readFileSync(join(repoRoot, "specs/order.binding.ts"), "utf8");

// 例のコンポーネントだけを写した仕様ディレクトリ。binding を渡せば確定版の結び付けも置く
function specDir(binding?: string) {
  const dir = mkdtempSync(join(tmpRoot, "d-"));
  copyFileSync(join(repoRoot, "specs/order.component.ts"), join(dir, "order.component.ts"));
  if (binding !== undefined) writeFileSync(join(dir, "order.binding.ts"), binding);
  return dir;
}

// 試行ごとに決まった下書きを書き、作業場所で見えたものを記録する
function scripted(drafts: string[], extra?: (assignment: Assignment) => void) {
  const seen: { request: string; start: string; files: string[] }[] = [];
  const strategy: ImplementationStrategy = {
    name: "scripted",
    run(assignment) {
      const file = join(assignment.dir, "spec/order.binding.draft.ts");
      seen.push({
        request: readFileSync(join(assignment.dir, "aac/REQUEST.md"), "utf8"),
        start: readFileSync(file, "utf8"),
        files: ["order.component.ts", "order.binding.ts"].filter((name) => existsSync(join(assignment.dir, "spec", name))),
      });
      writeFileSync(file, drafts[Math.min(assignment.attempt, drafts.length) - 1]);
      extra?.(assignment);
    },
  };
  return { strategy, seen };
}

const compileWithDrafts = (dir: string) =>
  spawnSync(process.execPath, [join(repoRoot, "packages/cli/src/compile.ts"), dir, "--drafts"], { encoding: "utf8" });

test("下書き: 名前をすべて並べた雛形から始め、検査に通ったら .draft.ts として書き出す", async () => {
  const dir = specDir();
  const { strategy, seen } = scripted([reviewed]);
  const result = await draftBinding({ specs: dir, strategy });

  assert.equal(result.status, "drafted");
  assert.ok(result.status === "drafted" && result.attempts === 1);
  // エージェントには仕様のファイルと、結び付けるべき名前がすべて渡る
  assert.deepEqual(seen[0].files, ["order.component.ts"]);
  assert.match(seen[0].request, /"The payment succeeded"/);
  assert.match(seen[0].request, /"Amount charged: price × \(100 − discount percent\) ÷ 100, rounded down to a whole yen"/);
  assert.match(seen[0].start, /"The customer is a Silver member": \(state\) => \{\n      throw new Error\("TODO"\);/);
  assert.match(seen[0].start, /import \{ CampaignRules, CancelRules, Order, ShippingRules \} from "\.\/order\.component\.ts";/);

  // 書き出された下書きには、未確認であることが明記される
  const draft = readFileSync(join(dir, "order.binding.draft.ts"), "utf8");
  assert.match(draft, /^\/\/ DRAFT — written by an LLM, not yet reviewed\./);
  assert.ok(draft.endsWith(reviewed));
});

test("下書き: 人が名前を変えるまで、検証には使われない", async () => {
  const dir = specDir();
  await draftBinding({ specs: dir, strategy: scripted([reviewed]).strategy });

  // 既定の読み込みは下書きを無視するので、結び付けは無いまま
  const { diagnostics } = await extract(await loadSpecs(dir));
  assert.ok(diagnostics.some((d) => d.code === "unbound-condition"));
  assert.ok(diagnostics.some((d) => d.code === "unbound-formula"));
  // 下書きを読むよう明示したときだけ、仕様として通る
  assert.equal(compileWithDrafts(dir).status, 0);
});

test("下書き: 機械的に分かる誤り (条件の衝突) は、書き直させる", async () => {
  // シルバー会員の条件を「常に真」にすると、ゴールド会員かつ月末の条件と同時に成り立つ
  const conflicting = reviewed.replace('(state) => state.rank === "Silver"', "() => true");
  assert.notEqual(conflicting, reviewed);
  const dir = specDir();
  const { strategy, seen } = scripted([conflicting, reviewed]);
  const result = await draftBinding({ specs: dir, strategy });

  assert.ok(result.status === "drafted" && result.attempts === 2);
  assert.match(seen[1].request, /Problems found in the previous attempt[\s\S]*複数の条件が同時に成立しました/);
  // 2回目は、前回の下書きから始まる
  assert.ok(seen[1].start.endsWith(conflicting));
});

test("下書き: 上限回数まで直らなければ失敗で終わり、問題を報告する", async () => {
  const unfinished = reviewed.replace('(state) => state.paymentResult === "succeeded"', '() => { throw new Error("TODO"); }');
  const result = await draftBinding({ specs: specDir(), strategy: scripted([unfinished]).strategy, maxAttempts: 2 });
  assert.ok(result.status === "failed" && result.attempts === 2);
  assert.match(result.problems ?? "", /TODO/);
});

test("下書き: 仕様のファイルを書き換えたら差し戻す", async () => {
  const dir = specDir();
  const original = readFileSync(join(dir, "order.component.ts"), "utf8");
  const { strategy, seen } = scripted([reviewed], ({ dir: sandbox, attempt }) => {
    if (attempt === 1) writeFileSync(join(sandbox, "spec/order.component.ts"), "// changed\n");
  });
  const result = await draftBinding({ specs: dir, strategy });
  assert.ok(result.status === "drafted" && result.attempts === 2);
  assert.match(seen[1].request, /Only order\.binding\.draft\.ts may be edited, but these files were changed: order\.component\.ts/);
  assert.equal(readFileSync(join(dir, "order.component.ts"), "utf8"), original);
});

test("下書き: 確定版があれば、足りない名前だけを対象に、確定版の内容から始める", async () => {
  // 確定版から計算の結び付けを取り除いた状態（型検査はしないので、実行時に漏れとして見つかる）
  const start = reviewed.indexOf("  // Formulas");
  const end = reviewed.indexOf("  // Invariants");
  const partial = reviewed.slice(0, start) + reviewed.slice(end);
  const dir = specDir(partial);
  const { strategy, seen } = scripted([reviewed]);
  const result = await draftBinding({ specs: dir, strategy });

  assert.ok(result.status === "drafted");
  assert.deepEqual(result.missing, {
    conditions: [],
    formulas: ["Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen"],
    invariants: [],
  });
  assert.equal(seen[0].start, partial);
  assert.match(seen[0].request, /leave those functions exactly as they are/);
  // 確定版はそのまま残り、下書きは別のファイルになる
  assert.equal(readFileSync(join(dir, "order.binding.ts"), "utf8"), partial);
  assert.equal(compileWithDrafts(dir).status, 0);
});

test("下書き: 結び付けが揃っていれば、何もしない", () => {
  const out = execFileSync(
    process.execPath,
    [join(repoRoot, "packages/cli/src/draft-binding.ts"), "--specs", join(repoRoot, "specs"), "--agent", "false"],
    { encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(out), { status: "nothing-to-draft" });
});
