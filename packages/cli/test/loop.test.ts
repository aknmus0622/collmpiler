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
import { loadSpecs } from "../src/loader.ts";
import { implement } from "../src/loop.ts";
import type { ImplementOptions } from "../src/loop.ts";
import { judge } from "../src/mutation.ts";
import type { MutationStrategy } from "../src/mutation.ts";
import { commandStrategy } from "../src/strategy.ts";
import type { Assignment, ImplementationStrategy } from "../src/strategy.ts";
import { write } from "./fixtures/scripted-agent.ts";
import type { Phase, Step } from "./fixtures/scripted-agent.ts";

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
function scripted(script: Script, extra?: (assignment: Assignment) => void) {
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
      write(phase, steps[Math.min(calls[phase]++, steps.length - 1)], assignment.dir);
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
  assert.ok(!wiring.includes("CampaignRules"));
  // 設計と実装の段階には、テストの口 (代役の形) が渡らない
  for (const phase of ["design", "implementation"] as const) {
    const text = Object.values(of(seen, phase)[0].files).join("\n");
    assert.ok(!text.includes("TargetSystemAdapter"));
    assert.ok(!text.includes("ports."));
  }
});

test("設計: 読み込めない骨組みは差し戻す", async () => {
  const { status, trail, seen } = await run({ design: ["broken", "correct"] }, { mutation: null });
  assert.equal(status, "pass");
  assert.deepEqual(trail, ["design:crash", "design:ok", "wiring:ok", "implementation:ok"]);
  assert.match(of(seen, "design")[1].files["aac/REQUEST.md"], /crashed before producing a test result[\s\S]*SyntaxError/);
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
    first.result.steps.map((s) => [s.from, s.action, s.case, s.input, s.data]),
    [
      ["DRAFT", "PlaceOrder", "default", { customerRank: "Silver", listPrice: 0 }, {}],
      ["PENDING", "Checkout", "The payment succeeded", {}, { rank: "Silver", price: 0 }],
    ],
  );
  assert.deepEqual(first.result.expected, {
    state: "PAID",
    commands: [{ action: "SendReceipt", payload: { discountPercent: 5, amount: 0 } }],
  });
  assert.deepEqual(first.result.actual, {
    state: "PAID",
    commands: [{ action: "SendReceipt", payload: { discountPercent: 50, amount: 0 } }],
  });

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

test("複数ステップ: 3手でしか現れない不具合を、最小のアクション列まで縮めて報告する", async () => {
  const { attempts } = await run({ implementation: ["norefund"] }, { maxAttempts: 1 });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  // 決済に成功してからキャンセルしたときだけ、返金が必要になる
  assert.deepEqual(
    feedback.result.steps.map((s) => [s.from, s.action, s.case]),
    [
      ["DRAFT", "PlaceOrder", "default"],
      ["PENDING", "Checkout", "The payment succeeded"],
      ["PAID", "Cancel", "default"],
    ],
  );
  assert.deepEqual(feedback.result.expected, { state: "CANCELLED", commands: [{ action: "Refund", payload: {} }] });
  assert.deepEqual(feedback.result.actual, { state: "CANCELLED", commands: [] });
});

test("しきい値: 「以上」と「より大きい」の取り違えを、ちょうどの値で見つける", async () => {
  const { attempts } = await run({ implementation: ["boundary"] }, { maxAttempts: 1 });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  const ship = feedback.result.steps.at(-1);
  assert.equal(ship?.action, "Ship");
  assert.equal(ship.data.price, 10000);
  assert.deepEqual(feedback.result.expected, { state: "SHIPPED", commands: [{ action: "SendShippingNotice", payload: { priority: true } }] });
  assert.deepEqual(feedback.result.actual, { state: "SHIPPED", commands: [{ action: "SendShippingNotice", payload: { priority: false } }] });
});

test("計算: 丸め方の違い (切り捨てと四捨五入) を見つける", async () => {
  const { attempts } = await run({ implementation: ["rounding"] }, { maxAttempts: 1 });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "pbt" && feedback.result.status === "fail");
  const amountOf = (o: unknown) => (o as { commands: { payload: { amount: number } }[] }).commands[0].payload.amount;
  assert.equal(amountOf(feedback.result.actual), amountOf(feedback.result.expected) + 1);
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
  assert.equal(fresh.seen[1].files["aac/adapter.ts"], generateAdapterSkeleton());
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

// --- 設計方針 ---

test("設計方針: 設計と実装の依頼文に載り、プロジェクトの方針で差し替えられる。配線の依頼文には載らない", async () => {
  const standard = await run({}, { mutation: null });
  assert.ok(of(standard.seen, "design")[0].files["aac/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
  assert.ok(of(standard.seen, "implementation")[0].files["aac/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
  assert.ok(!of(standard.seen, "wiring")[0].files["aac/REQUEST.md"].includes("Design guidance"));

  const custom = await run({}, { mutation: null, guide: "- Use the repository pattern." });
  assert.match(of(custom.seen, "design")[0].files["aac/REQUEST.md"], /## Design guidance[\s\S]*- Use the repository pattern\./);
  assert.ok(!of(custom.seen, "design")[0].files["aac/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
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

// --- 余計なもの検査 ---

async function workspace() {
  const out = workdir();
  const ir = JSON.parse(stableStringify((await extract(await loadSpecs(specsDir))).ir)) as Ir;
  mkdirSync(join(out, "aac"), { recursive: true });
  writeFileSync(join(out, "aac/ir.json"), stableStringify(ir));
  writeFileSync(join(out, "aac/adapter.contract.ts"), generateContract(ir));
  writeFileSync(join(out, "aac/verify.ts"), generateVerify(ir, join(out, "aac"), specsDir));
  write("wiring", "correct", out);
  write("implementation", "correct", out);
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
