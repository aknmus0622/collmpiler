import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkWorkspace } from "../src/check.ts";
import { extract, stableStringify } from "../src/extract.ts";
import { scrubEnv } from "../src/gates.ts";
import { generateAdapterSkeleton, generateContract, generateVerify } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { DEFAULT_GUIDE } from "../src/guide.ts";
import { resolveLayout, workspaceOf } from "../src/layout.ts";
import { loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import type { ImplementOptions } from "../src/loop.ts";
import { judge } from "../src/mutation.ts";
import type { MutationStrategy } from "../src/mutation.ts";
import type { StaticCheckStrategy } from "../src/static-check.ts";
import { commandStrategy } from "../src/strategy.ts";
import { typescriptTarget } from "../src/target-typescript.ts";
import type { Target } from "../src/target.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { write } from "./fixtures/scripted-agent.ts";
import type { Phase, Place, Step } from "./fixtures/scripted-agent.ts";
import { defaultWorkspace, harness, of, repoRoot, specsDir } from "./support.ts";

const { tmpRoot, workdir, scripted, run } = harness("loop");

// --- TDD の3段階 ---

test("3段階: 設計 → 配線 (赤) → 実装 (緑) の順に、別々の依頼として進む", async () => {
  const { out, seen, status, trail, attempts } = await run({});
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:ok", "wiring:ok", "implementation:ok"]);
  assert.match(of(seen, "design")[0].files["clp/REQUEST.md"], /^# Step 1 of 3/);
  assert.match(of(seen, "wiring")[0].files["clp/REQUEST.md"], /^# Step 2 of 3/);
  assert.match(of(seen, "implementation")[0].files["clp/REQUEST.md"], /^# Step 3 of 3/);

  // 合格した実装と採点基準は出力先に揃う。ミューテーションは実装の段階でだけ走る
  assert.deepEqual(readdirSync(join(out, "clp")).sort(), ["order.adapter.contract.ts", "order.adapter.ts", "order.ir.json", "order.verified.json", "order.verify.ts"]);
  assert.deepEqual(readdirSync(join(out, "src")), ["order-service.ts"]);
  assert.deepEqual(attempts.map((a) => a.mutation?.strategy), [undefined, undefined, "builtin"]);
});

test("3段階: 段階ごとに見せるものが違う (配線は IR を見ない。設計と実装はテストの口を見ない)", async () => {
  const { seen } = await run({}, { mutation: null });
  const keys = (phase: Phase) => Object.keys(of(seen, phase)[0].files).sort();
  assert.deepEqual(keys("design"), ["clp/REQUEST.md", "clp/order.ir.json"]);
  assert.deepEqual(keys("wiring"), ["clp/REQUEST.md", "clp/order.adapter.contract.ts", "clp/order.adapter.ts", "src/order-service.ts"]);
  assert.deepEqual(keys("implementation"), ["clp/REQUEST.md", "clp/order.ir.json", "src/order-service.ts"]);

  // 配線の段階には、条件の文も決定表の値も渡らない
  const wiring = Object.values(of(seen, "wiring")[0].files).join("\n");
  assert.ok(!wiring.includes("Gold member and it is month-end"));
  assert.ok(!wiring.includes("discountPercent\": 20"));
  // 設計と実装の段階には、テストの口 (代役の形) が渡らない
  for (const phase of ["design", "implementation"] as const) {
    const text = Object.values(of(seen, phase)[0].files).join("\n");
    assert.ok(!text.includes("TargetSystemAdapter"));
    assert.ok(!text.includes("ports."));
  }
});

test("設計: 型エラーや構文エラーのある骨組みは差し戻す", async () => {
  const { status, trail, attempts } = await run({ design: ["broken", "correct"] }, { mutation: null });
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:check", "design:ok", "wiring:ok", "implementation:ok"]);
  const feedback = attempts[0].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual([...new Set(feedback.violations.map((v) => `${v.file}:${v.rule}`))], ["src/order-service.ts:type-error"]);
});

test("設計: 読み込むと失敗する骨組みは差し戻す", async () => {
  const { trail, seen } = await run({ design: ["crashing", "correct"] }, { mutation: null });
  assert.deepEqual(trail, ["design:crash", "design:ok", "wiring:ok", "implementation:ok"]);
  assert.match(of(seen, "design")[1].files["clp/REQUEST.md"], /crashed before producing a test result[\s\S]*boom at load/);
});

test("設計: 仕様の文をそのまま書き写した骨組みは差し戻す (配線の段階に仕様が漏れるため)", async () => {
  const { trail, attempts } = await run({ design: ["leaky", "correct"] }, { mutation: null });
  assert.deepEqual(trail, ["design:check", "design:ok", "wiring:ok", "implementation:ok"]);
  const feedback = attempts[0].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => v.rule), ["spec-text-in-skeleton"]);
  assert.match(feedback.violations[0].message, /The customer is a Silver member/);
});

test("配線 (赤): 骨組みのままテストが通るアダプターは不合格", async () => {
  const { status, trail, attempts } = await run({ wiring: ["fake", "correct"] }, { mutation: null });
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:ok", "wiring:red", "wiring:ok", "implementation:ok"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "red");
  assert.match(feedback.message, /pass although the production code is not implemented/);
});

test("配線 (赤): アダプター自身の誤りによる失敗は、未実装による失敗と区別する", async () => {
  const { status, trail, attempts } = await run({ wiring: ["miswired", "correct"] }, { mutation: null });
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:ok", "wiring:red", "wiring:ok", "implementation:ok"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "red");
  assert.match(feedback.message, /error in the adapter[\s\S]*placeOrder is not a function/);
});

test("配線 (赤): 雛形のまま何も書かなかったアダプターは不合格 (本番コードの未実装とは区別する)", async () => {
  const { trail, attempts } = await run({ wiring: ["idle"] }, { maxAttempts: 1 });
  assert.deepEqual(trail, ["design:ok", "wiring:red"]);
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "red");
  assert.match(feedback.message, /error in the adapter[\s\S]*the adapter is not written yet/);
});

test("配線: 骨組みに無いメンバーを呼ぶアダプターは、型エラーとして差し戻す", async () => {
  const { trail, attempts } = await run({ wiring: ["mistyped", "correct"] }, { mutation: null });
  assert.deepEqual(trail, ["design:ok", "wiring:check", "wiring:ok", "implementation:ok"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["clp/order.adapter.ts:type-error"]);
  assert.match(feedback.violations[0].message, /placeOrder/);
});

test("実装: 骨組みのシグネチャを変えると、アダプターが型エラーになって差し戻される", async () => {
  // 実装の段階でメソッド名を変えてしまう例
  const { trail, attempts } = await run({}, { maxAttempts: 1, mutation: null }, ({ dir, phase }) => {
    if (phase !== "implementation") return;
    const file = join(dir, "src/order-service.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("  ship() {", "  dispatch() {"));
  });
  assert.deepEqual(trail, ["design:ok", "wiring:ok", "implementation:check"]);
  const feedback = attempts[2].feedback;
  assert.ok(feedback?.kind === "check");
  // 実装の段階はアダプターを見られないので、何が起きたかを言葉で伝える
  assert.match(feedback.violations[0].message, /an exported name or signature was changed[\s\S]*ship/);
  assert.equal(attempts[2].staticCheck, "tsc");
  assert.equal(feedback.violations[0].file, "src");
});

test("静的検査: Strategy として差し替えられ、使ったものが結果に残る。誤りの伝え方はゲートが決める", async () => {
  // アダプターに誤りがある、と報告するだけの Strategy
  const stub: StaticCheckStrategy = {
    name: "stub",
    check: ({ files }) => (files.includes("clp/order.adapter.ts") ? [{ file: "clp/order.adapter.ts", rule: "type-error", message: "line 1: boom" }] : []),
  };
  const { trail, attempts } = await run({}, { maxAttempts: 1, mutation: null, staticCheck: stub });
  // 設計の段階はアダプターを対象にしないので通り、配線の段階で止まる
  assert.deepEqual(trail, ["design:ok", "wiring:check"]);
  assert.deepEqual(attempts.map((a) => a.staticCheck), ["stub", "stub"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations, [{ file: "clp/order.adapter.ts", rule: "type-error", message: "line 1: boom" }]);

  // 既定は TypeScript の型チェック
  const standard = await run({}, { mutation: null });
  assert.deepEqual(standard.attempts.map((a) => a.staticCheck), ["tsc", "tsc", "tsc"]);
});

test("静的検査: 無しにしても、誤りは PBT の段階で見つかる (動的型の言語を想定)", async () => {
  // 骨組みに無いメンバーを呼ぶアダプター。型チェックが無ければ、赤の検査で実行時の誤りとして見つかる
  const wiring = await run({ wiring: ["mistyped", "correct"] }, { mutation: null, staticCheck: null });
  assert.deepEqual(wiring.trail, ["design:ok", "wiring:red", "wiring:ok", "implementation:ok"]);
  assert.deepEqual(wiring.attempts.map((a) => a.staticCheck), [undefined, undefined, undefined, undefined]);

  // 実装の段階がメソッド名を変えた場合も、PBT の失敗として見つかる
  const renamed = await run({}, { maxAttempts: 1, mutation: null, staticCheck: null }, ({ dir, phase }) => {
    if (phase !== "implementation") return;
    const file = join(dir, "src/order-service.ts");
    writeFileSync(file, readFileSync(file, "utf8").replace("  ship() {", "  dispatch() {"));
  });
  assert.deepEqual(renamed.trail, ["design:ok", "wiring:ok", "implementation:pbt"]);
  const feedback = renamed.attempts[2].feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  assert.match(JSON.stringify(feedback.result.actual), /ship is not a function/);
});

test("配線: 本番コード (骨組み) を書き換えたら不合格", async () => {
  const { trail, attempts } = await run({ wiring: ["touch", "correct"] }, { mutation: null });
  assert.deepEqual(trail.slice(0, 3), ["design:ok", "wiring:check", "wiring:ok"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["src/order-service.ts:read-only-file-modified"]);
});

test("実装 (緑): PBT の反例を差し戻し、次の試行で合格する", async () => {
  const { status, trail, attempts, seen } = await run({ implementation: ["buggy", "correct"] });
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:ok", "wiring:ok", "implementation:pbt", "implementation:ok"]);

  // シルバー会員の割引違いが、最小の反例として報告される。
  // 注文のときに覚えた会員ランクが、決済のときの data として示される
  const first = attempts[2].feedback;
  assert.ok(first?.kind === "pbt" && first.result.status === "fail");
  assert.deepEqual(
    first.result.steps.map((s) => [s.from, s.command, s.case, s.input.customerRank, s.data.rank]),
    [
      ["DRAFT", "PlaceOrder", "otherwise", "Silver", undefined],
      ["PENDING", "Checkout", "The payment succeeded", undefined, "Silver"],
    ],
  );
  // 割引率だけが食い違う（価格は縮小の止まった値で、ここでは問わない）
  const percentOf = (o: unknown) => (o as { effects: { payload: { discountPercent: number } }[] }).effects[0].payload.discountPercent;
  assert.equal(percentOf(first.result.expected), 5);
  assert.equal(percentOf(first.result.actual), 50);

  // 差し戻しは次の依頼文に載り、前回の成果も作業場所に引き継がれる
  const retry = of(seen, "implementation")[1];
  assert.match(retry.files["clp/REQUEST.md"], /attempt 2[\s\S]*"discountPercent": 50/);
  assert.match(retry.files["src/order-service.ts"], /percent = 50/);

  // 合格。使った Strategy と件数、生き残りは結果に残る。
  // 生き残るのは price の初期値 0 だけ（必ず上書きされるので、変えても挙動が変わらない）。
  // 0 は決定表の値でもあるが、別の出現箇所が検出されているので不合格にはならない
  const mutation = attempts[3].mutation;
  assert.equal(mutation?.strategy, "builtin");
  assert.ok(mutation.mutants >= 10 && mutation.killed === mutation.mutants - 1);
  assert.deepEqual(mutation.survivors.map((s) => s.original), ["0"]);
});

test("複数ステップ: 3手でしか現れない不具合を、最小のコマンド列まで縮めて報告する", async () => {
  const { attempts } = await run({ implementation: ["norefund"] }, { maxAttempts: 1 });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  // 決済に成功してからキャンセルしたときだけ、返金が必要になる
  assert.deepEqual(
    feedback.result.steps.map((s) => [s.from, s.command, s.case]),
    [
      ["DRAFT", "PlaceOrder", "otherwise"],
      ["PENDING", "Checkout", "The payment succeeded"],
      ["PAID", "Cancel", "otherwise"],
    ],
  );
  assert.deepEqual(feedback.result.expected, { state: "CANCELLED", effects: [{ name: "Refund", payload: {} }] });
  assert.deepEqual(feedback.result.actual, { state: "CANCELLED", effects: [] });
});

test("しきい値: 「以上」と「より大きい」の取り違えを、ちょうどの値で見つける", async () => {
  const { attempts } = await run({ implementation: ["boundary"] }, { maxAttempts: 1 });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  const ship = feedback.result.steps.at(-1);
  assert.equal(ship?.command, "Ship");
  assert.equal(ship.data.price, 10000);
  assert.deepEqual(feedback.result.expected, { state: "SHIPPED", effects: [{ name: "SendShippingNotice", payload: { priority: true } }] });
  assert.deepEqual(feedback.result.actual, { state: "SHIPPED", effects: [{ name: "SendShippingNotice", payload: { priority: false } }] });
});

test("計算: 丸め方の違い (切り捨てと四捨五入) を見つける", async () => {
  const { attempts } = await run({ implementation: ["rounding"] }, { maxAttempts: 1 });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  const amountOf = (o: unknown) => (o as { effects: { payload: { amount: number } }[] }).effects[0].payload.amount;
  assert.equal(amountOf(feedback.result.actual), amountOf(feedback.result.expected) + 1);
});
