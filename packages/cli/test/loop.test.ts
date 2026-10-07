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

// 出力先は packages/cli 配下に置く（verify.ts が @aac/cli/runtime を解決できる場所）
const repoRoot = join(import.meta.dirname, "../../..");
const tmpRoot = join(import.meta.dirname, ".tmp");
const specsDir = join(repoRoot, "specs");

mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));
const workdir = () => mkdtempSync(join(tmpRoot, "w-"));

type Script = Partial<Record<Phase, Step[]>>;
type Seen = { phase: Phase; dir: string; files: Record<string, string> };

// LLM の代役の Strategy。段階ごとに、呼ばれた回数に応じた成果物を書き出し、作業場所で見えたものを記録する。
// 指定の無い段階は常に正しいものを書く
function scripted(script: Script, extra?: (assignment: Assignment) => void, place?: Place) {
  const seen: Seen[] = [];
  const calls: Record<Phase, number> = { design: 0, wiring: 0, implementation: 0 };
  const strategy: ImplementationStrategy = {
    name: "scripted",
    run(assignment) {
      const files: Record<string, string> = {};
      for (const name of readdirSync(assignment.dir, { recursive: true }) as string[]) {
        if (name.includes(".")) files[name.split("\\").join("/")] = readFileSync(join(assignment.dir, name), "utf8");
      }
      const phase = assignment.phase as Phase;
      seen.push({ phase, dir: assignment.dir, files });
      const steps = script[phase] ?? ["correct"];
      write(phase, steps[Math.min(calls[phase]++, steps.length - 1)], assignment.dir, place);
      extra?.(assignment);
    },
  };
  return { strategy, seen };
}

async function run(script: Script, options: Partial<ImplementOptions> = {}, extra?: (assignment: Assignment) => void) {
  const out = workdir();
  const { strategy, seen } = scripted(script, extra);
  const result = await implement({ specs: specsDir, out, strategy, maxAttempts: 2, maxRounds: 1, ...options });
  const trail = result.attempts.map((a) => `${a.phase}:${a.feedback?.kind ?? "ok"}`);
  return { out, seen, trail, ...result };
}

const of = (seen: Seen[], phase: Phase) => seen.filter((s) => s.phase === phase);
// 既定の配置 (<out>/src と <out>/aac)
const defaultWorkspace = (out: string) => workspaceOf(resolveLayout({ out }), typescriptTarget.files);

// --- TDD の3段階 ---

test("3段階: 設計 → 配線 (赤) → 実装 (緑) の順に、別々の依頼として進む", async () => {
  const { out, seen, status, trail, attempts } = await run({});
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:ok", "wiring:ok", "implementation:ok"]);
  assert.match(of(seen, "design")[0].files["aac/REQUEST.md"], /^# Step 1 of 3/);
  assert.match(of(seen, "wiring")[0].files["aac/REQUEST.md"], /^# Step 2 of 3/);
  assert.match(of(seen, "implementation")[0].files["aac/REQUEST.md"], /^# Step 3 of 3/);

  // 合格した実装と採点基準は出力先に揃う。ミューテーションは実装の段階でだけ走る
  assert.deepEqual(readdirSync(join(out, "aac")).sort(), ["adapter.contract.ts", "adapter.ts", "ir.json", "verify.ts"]);
  assert.deepEqual(readdirSync(join(out, "src")), ["order-service.ts"]);
  assert.deepEqual(attempts.map((a) => a.mutation?.strategy), [undefined, undefined, "builtin"]);
});

test("3段階: 段階ごとに見せるものが違う (配線は IR を見ない。設計と実装はテストの口を見ない)", async () => {
  const { seen } = await run({}, { mutation: null });
  const keys = (phase: Phase) => Object.keys(of(seen, phase)[0].files).sort();
  assert.deepEqual(keys("design"), ["aac/REQUEST.md", "aac/ir.json"]);
  assert.deepEqual(keys("wiring"), ["aac/REQUEST.md", "aac/adapter.contract.ts", "aac/adapter.ts", "src/order-service.ts"]);
  assert.deepEqual(keys("implementation"), ["aac/REQUEST.md", "aac/ir.json", "src/order-service.ts"]);

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
  assert.match(of(seen, "design")[1].files["aac/REQUEST.md"], /crashed before producing a test result[\s\S]*boom at load/);
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

test("配線: 骨組みに無いメンバーを呼ぶアダプターは、型エラーとして差し戻す", async () => {
  const { trail, attempts } = await run({ wiring: ["mistyped", "correct"] }, { mutation: null });
  assert.deepEqual(trail, ["design:ok", "wiring:check", "wiring:ok", "implementation:ok"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["aac/adapter.ts:type-error"]);
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
    check: ({ files }) => (files.includes("aac/adapter.ts") ? [{ file: "aac/adapter.ts", rule: "type-error", message: "line 1: boom" }] : []),
  };
  const { trail, attempts } = await run({}, { maxAttempts: 1, mutation: null, staticCheck: stub });
  // 設計の段階はアダプターを対象にしないので通り、配線の段階で止まる
  assert.deepEqual(trail, ["design:ok", "wiring:check"]);
  assert.deepEqual(attempts.map((a) => a.staticCheck), ["stub", "stub"]);
  const feedback = attempts[1].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations, [{ file: "aac/adapter.ts", rule: "type-error", message: "line 1: boom" }]);

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
  assert.match(retry.files["aac/REQUEST.md"], /attempt 2[\s\S]*"discountPercent": 50/);
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

// --- 対象言語 ---

test("対象言語: 流れとゲートは Target だけを通して、生成・検査・テストの実行を行う", async () => {
  // TypeScript 用の実装を包み、呼ばれたものを記録する。テストの実行だけ差し替える
  const calls: string[] = [];
  const recording: Target = {
    ...typescriptTarget,
    name: "recording",
    generate: {
      contract: (ir) => (calls.push("generate.contract"), typescriptTarget.generate.contract(ir)),
      adapterSkeleton: (ws) => (calls.push("generate.adapterSkeleton"), typescriptTarget.generate.adapterSkeleton(ws)),
      verify: (ir, ws, specs) => (calls.push("generate.verify"), typescriptTarget.generate.verify(ir, ws, specs)),
    },
    check: (...args) => (calls.push("check"), typescriptTarget.check(...args)),
    load: (ws) => (calls.push("load"), typescriptTarget.load(ws)),
    // 常に合格と答える
    runTests: () => (calls.push("runTests"), { result: { status: "pass", seed: 0, numRuns: 0 } }),
    staticCheck: undefined,
    mutation: undefined,
  };
  const { trail, attempts } = await run({}, { target: recording, maxAttempts: 1 });

  // テストが「合格」と答えるので、配線の段階の赤の検査で止まる（骨組みのまま通るのはおかしい）
  assert.deepEqual(trail, ["design:ok", "wiring:red"]);
  assert.deepEqual([...new Set(calls)].sort(), ["check", "generate.adapterSkeleton", "generate.contract", "generate.verify", "load", "runTests"]);
  // 静的検査とミューテーションは、対象言語が持たなければ行わない
  assert.deepEqual(attempts.map((a) => a.staticCheck), [undefined, undefined]);
});

test("対象言語: 「未実装」の印は Target が決める", async () => {
  // 印が違えば、骨組みの "not implemented" は「アダプター自身の誤り」に見える
  const { trail } = await run({}, { target: { ...typescriptTarget, notImplemented: "TODO" }, maxAttempts: 1, mutation: null });
  assert.deepEqual(trail, ["design:ok", "wiring:red"]);
});

// --- やり直し ---

test("ループ: 1つの段階が上限回数まで直らなければ、設計からやり直す", async () => {
  // 1周目は実装が直らない。2周目で合格する（代役は呼ばれた回数で成果物を変える）
  const { status, trail, attempts, seen } = await run(
    { implementation: ["buggy", "buggy", "correct"] },
    { maxAttempts: 2, maxRounds: 2, mutation: null },
  );
  assert.equal(status, "pass");
  assert.deepEqual(trail, [
    "design:ok", "wiring:ok", "implementation:pbt", "implementation:pbt",
    "design:ok", "wiring:ok", "implementation:ok",
  ]);
  assert.deepEqual(attempts.map((a) => a.round), [1, 1, 1, 1, 2, 2, 2]);
  // やり直しの周は、前の周の成果を引き継がない
  assert.deepEqual(Object.keys(of(seen, "design")[1].files).sort(), ["aac/REQUEST.md", "aac/ir.json"]);
});

test("ループ: やり直しの上限まで直らなければ失敗で止まる", async () => {
  const { status, attempts } = await run({ implementation: ["buggy"] }, { maxAttempts: 2, maxRounds: 2, mutation: null });
  assert.equal(status, "fail");
  assert.equal(attempts.filter((a) => a.phase === "implementation").length, 4);
});

test("ループ: 検証は決定的 (同じ実装なら同じシード・同じ反例)", async () => {
  const a = await run({ implementation: ["buggy"] }, { maxAttempts: 1 });
  const b = await run({ implementation: ["buggy"] }, { maxAttempts: 1 });
  assert.deepEqual(a.attempts, b.attempts);
});

test("ループ: 成果物がすでにあれば実装の段階から始める。fresh なら設計からやり直す", async () => {
  const first = await run({}, { mutation: null });
  const again = scripted({});
  await implement({ specs: specsDir, out: first.out, strategy: again.strategy, mutation: null });
  assert.deepEqual(again.seen.map((s) => s.phase), ["implementation"]);
  assert.ok("src/order-service.ts" in again.seen[0].files);

  const fresh = scripted({});
  await implement({ specs: specsDir, out: first.out, strategy: fresh.strategy, mutation: null, fresh: true });
  assert.deepEqual(fresh.seen.map((s) => s.phase), ["design", "wiring", "implementation"]);
  assert.ok(!("src/order-service.ts" in fresh.seen[0].files));
  assert.equal(fresh.seen[1].files["aac/adapter.ts"], generateAdapterSkeleton(defaultWorkspace(first.out)));
});

test("コマンド Strategy: 外部コマンドを作業場所で、段階ごとに起動する", async () => {
  process.env.AAC_SCRIPT = "buggy,correct";
  const strategy = commandStrategy(`"${process.execPath}" "${join(import.meta.dirname, "fixtures/scripted-agent.ts")}"`);
  const { status, attempts } = await implement({ specs: specsDir, out: workdir(), strategy, maxAttempts: 2, mutation: null });
  assert.equal(status, "pass");
  assert.deepEqual(attempts.map((a) => `${a.phase}:${a.ok}`), ["design:true", "wiring:true", "implementation:false", "implementation:true"]);
});

// --- ミューテーション ---

test("ミューテーション: アダプターの肩代わりで死んだ本番コードを見つける", async () => {
  const { status, attempts } = await run({ wiring: ["cheat"] }, { maxAttempts: 1 });
  assert.equal(status, "fail");
  const feedback = attempts.at(-1)?.feedback;
  // PBT には合格するが、本番コードの割引率を変えても落ちない
  assert.ok(feedback?.kind === "mutation");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["src/order-service.ts:mutation-survived"]);
  assert.match(feedback.violations[0].message, /Changing 5 /);
});

test("ミューテーション: ゲートを外すと、アダプターの肩代わりは見逃される", async () => {
  const { status } = await run({ wiring: ["cheat"] }, { maxAttempts: 1, mutation: null });
  assert.equal(status, "pass");
});

test("ミューテーション: Strategy は差し替えられ、合否の基準はゲートが持つ", async () => {
  const stub = (killed: boolean): MutationStrategy => ({
    name: "stub",
    run: () => ({
      strategy: "stub",
      mutants: [{ file: "src/order-service.ts", line: 1, original: "5", mutated: "6", value: 5, killed }],
    }),
  });
  const pass = await run({}, { mutation: stub(true) });
  assert.equal(pass.status, "pass");
  assert.deepEqual(pass.attempts.at(-1)?.mutation, { strategy: "stub", mutants: 1, killed: 1, survivors: [] });

  const fail = await run({}, { maxAttempts: 1, mutation: stub(false) });
  assert.equal(fail.status, "fail");
  assert.equal(fail.attempts.at(-1)?.feedback?.kind, "mutation");
});

test("ミューテーション: 判定の基準", () => {
  const generic = (killed: boolean) => ({ file: "src/a.ts", line: 1, original: "20", mutated: "(20+1)", killed });
  // 決定表の値が本番コードに見つからないときは、何か1つでも検出されればよい
  assert.deepEqual(judge({ strategy: "x", mutants: [generic(true), generic(false)] }, [0.2], ""), []);
  assert.deepEqual(judge({ strategy: "x", mutants: [generic(false)] }, [0.2], "").map((v) => v.rule), ["mutation-ineffective"]);
  // 決定表の数値が本番コードに無く、アダプターにあれば不合格
  assert.deepEqual(
    judge({ strategy: "x", mutants: [generic(true)] }, [5], "const rate = 5;").map((v) => v.rule),
    ["decision-in-adapter"],
  );
});

// --- 添付資料と設計方針 ---

test("設計方針: 既定の方針は設計と実装の依頼文に載り、配線の依頼文には載らない", async () => {
  const { seen } = await run({}, { mutation: null });
  assert.ok(of(seen, "design")[0].files["aac/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
  assert.ok(of(seen, "implementation")[0].files["aac/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
  assert.ok(!of(seen, "wiring")[0].files["aac/REQUEST.md"].includes("Design guidance"));
});

test("添付資料: ファイルは作業場所に置かれ、文言は依頼文に載る。既定では設計と実装の段階にだけ渡る", async () => {
  const assets = [
    { kind: "file", name: "docs/architecture.md", content: "- Use the repository pattern." },
    { kind: "text", text: "Money is always handled as whole yen." },
    { kind: "text", text: "Adapters are named *Gateway.", phases: ["wiring"] },
  ] as const;
  const { seen, status } = await run({}, { mutation: null, assets: [...assets] });
  assert.equal(status, "pass");
  const files = (phase: Phase) => Object.keys(of(seen, phase)[0].files).filter((name) => name.startsWith("aac/assets/"));
  assert.deepEqual(files("design"), ["aac/assets/docs/architecture.md"]);
  assert.deepEqual(files("implementation"), ["aac/assets/docs/architecture.md"]);
  assert.deepEqual(files("wiring"), []);

  // ファイルは置き場所が案内され、文言はそのまま載る
  const design = of(seen, "design")[0].files;
  assert.match(design["aac/REQUEST.md"], /## Project conventions[\s\S]*- Money is always handled as whole yen\.[\s\S]*`aac\/assets\/docs\/architecture\.md`/);
  assert.equal(design["aac/assets/docs/architecture.md"], "- Use the repository pattern.");
  assert.ok(!design["aac/REQUEST.md"].includes("Gateway"));
  // 配線の段階には、明示したものだけが渡る
  const wiring = of(seen, "wiring")[0].files["aac/REQUEST.md"];
  assert.match(wiring, /## Project conventions[\s\S]*- Adapters are named \*Gateway\./);
  assert.ok(!wiring.includes("whole yen"));
});

test("添付資料: エージェントが書き換えたら差し戻す", async () => {
  const assets = [{ kind: "file" as const, name: "architecture.md", content: "- Use the repository pattern." }];
  const { attempts } = await run({}, { maxAttempts: 1, mutation: null, assets }, ({ dir, phase }) => {
    if (phase === "design") writeFileSync(join(dir, "aac/assets/architecture.md"), "- Anything goes.");
  });
  const feedback = attempts[0].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["aac/assets/architecture.md:read-only-file-modified"]);
});

// --- 隔離 ---

test("隔離: 作業場所はリポジトリの外にあり、リポジトリへの手がかりを含まない", async () => {
  const { seen } = await run({}, { mutation: null });
  for (const { dir, files } of seen) {
    assert.ok(!dir.startsWith(repoRoot));
    assert.ok(!existsSync(dir)); // 終了後は消える
    const everything = Object.values(files).join("\n");
    assert.ok(!everything.includes(repoRoot));
    assert.ok(!everything.includes("specs/"));
    assert.ok(!everything.includes("verify.ts"));
    assert.ok(!everything.includes('=== "Gold"')); // Layer 2 の評価関数
  }
});

test("隔離: 環境変数からリポジトリのパスを取り除く", () => {
  const env = scrubEnv(
    { PWD: "/repo/sub", INIT_CWD: "/repo", PATH: "/repo/node_modules/.bin:/usr/bin:/bin", HOME: "/home/u", LANG: "C" },
    ["/repo"],
  );
  assert.deepEqual(env, { PATH: "/usr/bin:/bin", HOME: "/home/u", LANG: "C" });
});

test("出口ゲート: その段階で許可した出力以外は取り出さず、違反として差し戻す", async () => {
  const { out, attempts } = await run({}, { maxAttempts: 1, mutation: null }, ({ dir, phase }) => {
    if (phase !== "implementation") return;
    writeFileSync(join(dir, "notes.md"), "memo");
    writeFileSync(join(dir, "aac/helper.ts"), "export {};");
    writeFileSync(join(dir, "aac/ir.json"), "{}");
    symlinkSync(join(specsDir, "order.binding.ts"), join(dir, "src/oracle.ts"));
  });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`).sort(), [
    "aac/helper.ts:unexpected-file",
    "aac/ir.json:read-only-file-modified",
    "notes.md:unexpected-file",
    "src/oracle.ts:unexpected-file",
  ]);
  assert.ok(!existsSync(join(out, "notes.md")));
  assert.ok(!existsSync(join(out, "aac/helper.ts")));
  assert.ok(!existsSync(join(out, "src/oracle.ts")));
  // 採点基準は作業場所での改ざんの影響を受けない
  assert.notEqual(readFileSync(join(out, "aac/ir.json"), "utf8"), "{}");
});

// --- 配置 ---

test("配置: 本番コードとテスト側を、別々の場所に置ける (src/ と test/ を分ける流儀)", async () => {
  const base = workdir();
  const place = { source: "app/src/order-service.ts", adapter: "test/aac/adapter.ts" };
  const { strategy, seen } = scripted({}, undefined, place);
  const result = await implement({ specs: specsDir, src: join(base, "app/src"), tests: join(base, "test/aac"), strategy, maxAttempts: 1, maxRounds: 1 });
  assert.equal(result.status, "pass");

  // 作業場所は、出力先の相対位置をそのまま写す（依頼文だけは常に aac/）
  const keys = (phase: Phase) => Object.keys(of(seen, phase)[0].files).sort();
  assert.deepEqual(keys("design"), ["aac/REQUEST.md", "test/aac/ir.json"]);
  assert.deepEqual(keys("wiring"), ["aac/REQUEST.md", "app/src/order-service.ts", "test/aac/adapter.contract.ts", "test/aac/adapter.ts"]);
  // 依頼文と雛形は、その配置でのパスを案内する
  assert.match(of(seen, "design")[0].files["aac/REQUEST.md"], /specified in `test\/aac\/ir\.json`[\s\S]*skeleton\*\* under `app\/src\/`/);
  assert.match(of(seen, "wiring")[0].files["test/aac/adapter.ts"], /Import the production code from \.\.\/\.\.\/app\/src\/ /);
  assert.match(of(seen, "wiring")[0].files["aac/REQUEST.md"], /may import only `\.\/adapter\.contract\.ts` and production files under `\.\.\/\.\.\/app\/src\/`/);

  for (const file of ["app/src/order-service.ts", "test/aac/adapter.ts", "test/aac/ir.json", "test/aac/adapter.contract.ts", "test/aac/verify.ts"]) {
    assert.ok(existsSync(join(base, file)), file);
  }
  assert.ok(!existsSync(join(base, "aac")));
  assert.deepEqual(result.attempts.at(-1)?.mutation?.survivors.map((s) => s.file), ["app/src/order-service.ts"]);
});

test("配置: 本番コードと同じ場所に並べられる (テスト側は接頭辞で見分ける)", async () => {
  const base = workdir();
  const dir = join(base, "order");
  const place = { source: "order-service.ts", adapter: "order.aac.adapter.ts" };
  const options = { specs: specsDir, src: dir, tests: join(dir, "order.aac."), maxAttempts: 1, maxRounds: 1 };
  const first = scripted({}, undefined, place);
  assert.equal((await implement({ ...options, strategy: first.strategy })).status, "pass");
  assert.deepEqual(readdirSync(dir).sort(), [
    "order-service.ts",
    "order.aac.adapter.contract.ts",
    "order.aac.adapter.ts",
    "order.aac.ir.json",
    "order.aac.verify.ts",
  ]);
  assert.match(of(first.seen, "design")[0].files["aac/REQUEST.md"], /File names starting with `order\.aac\.` are reserved for the test harness/);

  // 本番コードが、テスト側のための名前を使ったら差し戻す
  const squatter = scripted({}, ({ dir: sandbox, phase }) => {
    if (phase === "implementation") writeFileSync(join(sandbox, "order.aac.helper.ts"), "export {};");
  }, place);
  const rejected = await implement({ ...options, strategy: squatter.strategy });
  const feedback = rejected.attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["order.aac.helper.ts:unexpected-file"]);

  // fresh でやり直しても、消えるのは本番コードとアダプターだけ
  const again = scripted({}, undefined, place);
  assert.equal((await implement({ ...options, strategy: again.strategy, fresh: true })).status, "pass");
  assert.deepEqual(again.seen.map((s) => s.phase), ["design", "wiring", "implementation"]);
  assert.deepEqual(Object.keys(again.seen[0].files).sort(), ["aac/REQUEST.md", "order.aac.ir.json"]);
});

test("配置: 危ない指定は、始める前に断る", () => {
  const base = workdir();
  // 同じ場所に置くのに、見分ける接頭辞が無い
  assert.throws(() => resolveLayout({ src: join(base, "order"), tests: join(base, "order") }), /--tests にファイル名の接頭辞まで書いてください/);
  // 本番コードのディレクトリは、エージェントが中身を書き直す。プロジェクトのルートを指させない
  writeFileSync(join(base, "package.json"), "{}");
  assert.throws(() => resolveLayout({ src: base, tests: join(base, "aac") }), /package\.json があります/);
  assert.throws(() => resolveLayout({ src: join(base, "src") }), /--out か、--src と --tests の両方を指定してください/);
  // --tests が "." で終われば、最後の部分が接頭辞。それ以外はディレクトリ
  assert.deepEqual(resolveLayout({ src: join(base, "order"), tests: join(base, "order/order.aac.") }), { root: join(base, "order"), src: "", tests: "", prefix: "order.aac." });
  assert.deepEqual(resolveLayout({ src: join(base, "app/src"), tests: join(base, "test/aac") }), { root: base, src: "app/src", tests: "test/aac", prefix: "" });
  assert.deepEqual(resolveLayout({ src: join(base, "app/src"), tests: join(base, "test/order.") }).prefix, "order.");
  // --out だけなら、従来どおり
  assert.deepEqual(resolveLayout({ out: join(base, "x") }), { root: join(base, "x"), src: "src", tests: "aac", prefix: "" });
});

// --- 余計なもの検査 ---

async function workspace() {
  const out = workdir();
  const ir = JSON.parse(stableStringify(extract(await loadSpecs(specsDir)).ir)) as Ir;
  mkdirSync(join(out, "aac"), { recursive: true });
  writeFileSync(join(out, "aac/ir.json"), stableStringify(ir));
  writeFileSync(join(out, "aac/adapter.contract.ts"), generateContract(ir));
  const ws = defaultWorkspace(out);
  writeFileSync(join(out, "aac/verify.ts"), generateVerify(ir, ws, specsDir));
  write("wiring", "correct", out);
  write("implementation", "correct", out);
  const rules = () => checkWorkspace(ws, ir, specsDir).map((v) => `${v.file}:${v.rule}`);
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
  writeFileSync(join(out, "aac/adapter.ts"), generateAdapterSkeleton(defaultWorkspace(out)));
  assert.deepEqual(rules(), ["src:missing-file"]);
});

test("検査: 本番コードはフレームワーク・仕様・テスト側・組み込みモジュールに依存できない", async () => {
  const { rules, edit } = await workspace();
  edit("src/order-service.ts", (text) =>
    [
      `import { applyDecision } from "@aac/core";`,
      `import ir from "../aac/ir.json" with { type: "json" };`,
      `import { readFileSync } from "node:fs";`,
      `export * from "../../../../../specs/order.component.ts";`,
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
  // 出力先のほかの場所は見ない（プロジェクトの他のファイルがあり得る。エージェントが作業場所に余計なものを
  // 作った場合は、出口ゲートの監査が弾く）
  writeFileSync(join(out, "notes.md"), "");
  writeFileSync(join(out, "src/data.json"), "{}");
  assert.deepEqual(rules().sort(), [
    "aac/helper.ts:unexpected-file",
    "aac/ir.json:generated-file-modified",
    "aac/verify.ts:generated-file-modified",
    "src/data.json:unexpected-file",
  ]);
});

test("検査: アダプターの中身は字面では制限しない (判断の肩代わりはミューテーションで見つける)", async () => {
  const { out, rules } = await workspace();
  write("wiring", "cheat", out);
  assert.deepEqual(rules(), []);
});

test("検査: アダプターは仕様や IR を import できない", async () => {
  const { rules, edit } = await workspace();
  edit("aac/adapter.ts", (text) => `import { CampaignRules } from "../../../../../specs/order.component.ts";\n${text}`);
  assert.deepEqual(rules(), ["aac/adapter.ts:forbidden-import"]);
});
