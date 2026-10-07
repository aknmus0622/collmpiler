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

const { tmpRoot, workdir, scripted, run } = harness("gates");

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
  assert.deepEqual(Object.keys(of(seen, "design")[1].files).sort(), ["clp/REQUEST.md", "clp/order.ir.json"]);
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

test("コマンド Strategy: 外部コマンドを作業場所で、段階ごとに起動する", async () => {
  process.env.CLP_SCRIPT = "buggy,correct";
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
  // ただし、本番コードをほかのコンポーネントと共有しているときは求めない（壊した箇所の多くは、ほかのコンポーネントのコード）
  assert.deepEqual(judge({ strategy: "x", mutants: [generic(false)] }, [], "", "adapter", "src/", true), []);
  // 決定表の数値が本番コードに無く、アダプターにあれば不合格
  assert.deepEqual(
    judge({ strategy: "x", mutants: [generic(true)] }, [5], "const rate = 5;").map((v) => v.rule),
    ["decision-in-adapter"],
  );
});

// --- 添付資料と設計方針 ---

test("設計方針: 既定の方針は設計と実装の依頼文に載り、配線の依頼文には載らない", async () => {
  const { seen } = await run({}, { mutation: null });
  assert.ok(of(seen, "design")[0].files["clp/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
  assert.ok(of(seen, "implementation")[0].files["clp/REQUEST.md"].includes(DEFAULT_GUIDE.trim()));
  assert.ok(!of(seen, "wiring")[0].files["clp/REQUEST.md"].includes("Design guidance"));
});

test("添付資料: ファイルは作業場所に置かれ、文言は依頼文に載る。既定では設計と実装の段階にだけ渡る", async () => {
  const assets = [
    { kind: "file", name: "docs/architecture.md", content: "- Use the repository pattern." },
    { kind: "text", text: "Money is always handled as whole yen." },
    { kind: "text", text: "Adapters are named *Gateway.", phases: ["wiring"] },
  ] as const;
  const { seen, status } = await run({}, { mutation: null, assets: [...assets] });
  assert.equal(status, "pass");
  const files = (phase: Phase) => Object.keys(of(seen, phase)[0].files).filter((name) => name.startsWith("clp/assets/"));
  assert.deepEqual(files("design"), ["clp/assets/docs/architecture.md"]);
  assert.deepEqual(files("implementation"), ["clp/assets/docs/architecture.md"]);
  assert.deepEqual(files("wiring"), []);

  // ファイルは置き場所が案内され、文言はそのまま載る
  const design = of(seen, "design")[0].files;
  assert.match(design["clp/REQUEST.md"], /## Project conventions[\s\S]*- Money is always handled as whole yen\.[\s\S]*`clp\/assets\/docs\/architecture\.md`/);
  assert.equal(design["clp/assets/docs/architecture.md"], "- Use the repository pattern.");
  assert.ok(!design["clp/REQUEST.md"].includes("Gateway"));
  // 配線の段階には、明示したものだけが渡る
  const wiring = of(seen, "wiring")[0].files["clp/REQUEST.md"];
  assert.match(wiring, /## Project conventions[\s\S]*- Adapters are named \*Gateway\./);
  assert.ok(!wiring.includes("whole yen"));
});

test("添付資料: エージェントが書き換えたら差し戻す", async () => {
  const assets = [{ kind: "file" as const, name: "architecture.md", content: "- Use the repository pattern." }];
  const { attempts } = await run({}, { maxAttempts: 1, mutation: null, assets }, ({ dir, phase }) => {
    if (phase === "design") writeFileSync(join(dir, "clp/assets/architecture.md"), "- Anything goes.");
  });
  const feedback = attempts[0].feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["clp/assets/architecture.md:read-only-file-modified"]);
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
    writeFileSync(join(dir, "clp/helper.ts"), "export {};");
    writeFileSync(join(dir, "clp/order.ir.json"), "{}");
    symlinkSync(join(specsDir, "order.binding.ts"), join(dir, "src/oracle.ts"));
  });
  const feedback = attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`).sort(), [
    "clp/helper.ts:unexpected-file",
    "clp/order.ir.json:read-only-file-modified",
    "notes.md:unexpected-file",
    "src/oracle.ts:unexpected-file",
  ]);
  assert.ok(!existsSync(join(out, "notes.md")));
  assert.ok(!existsSync(join(out, "clp/helper.ts")));
  assert.ok(!existsSync(join(out, "src/oracle.ts")));
  // 採点基準は作業場所での改ざんの影響を受けない
  assert.notEqual(readFileSync(join(out, "clp/order.ir.json"), "utf8"), "{}");
});
