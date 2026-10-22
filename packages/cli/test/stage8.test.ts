import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { implement } from "../src/loop.ts";
import { VARIANTS, disagreementsOn, sampleCases } from "../src/v1/agreement.ts";
import { FrameworkError, agree, recording, decided } from "../src/v1/decide.ts";
import { interpret8, accept8 } from "../src/v1/interpret.ts";
import { R1_COMPONENTS8, adapterOf } from "../src/v1/stage1.ts";
import { harness, repoRoot, specsDir } from "./support8.ts";

// Self-hosting (SELF_HOSTING.md §2) for 1.0: the framework's own components, generated from packages/cli/self1/specs,
// decide what the hand-written Stage 0 decides. The three fixed-point checks:
//   1. Stage 0 and Stage 1 make the same decisions (on the cases and many generated questions; the pipeline and the
//      interpret flow run the same way under both),
//   2. the deterministic artifacts (IR, test-side files) are the same under either stage,
//   3. the framework, running on Stage 1, re-grades its own components and passes.
process.env.CLP_ALLOY = "off";

const SELF = join(repoRoot, "packages/cli/self1");
const { tmpRoot, run } = harness("stage8");
const clp = (args: string[], env: NodeJS.ProcessEnv = {}) =>
  spawnSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), ...args], { encoding: "utf8", cwd: repoRoot, env: { ...process.env, CLP_ALLOY: "off", ...env } });
const withStage = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
  const previous = process.env.CLP_STAGE;
  if (stage === "") delete process.env.CLP_STAGE;
  else process.env.CLP_STAGE = stage;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.CLP_STAGE;
    else process.env.CLP_STAGE = previous;
  }
};

test("Stage 1: 自身の部品は、合格の記録があり、読み込める", async () => {
  const components = readdirSync(join(SELF, "specs")).filter((name) => name.endsWith(".component.ts")).map((name) => name.replace(".component.ts", ""));
  assert.equal(components.length, 19);
  for (const component of components) assert.ok(await adapterOf(component), component);
  // CLP_STAGE=0 では、どれも使わない
  await withStage("0", async () => {
    for (const component of components) assert.equal(await adapterOf(component), undefined);
  });
});

test("Stage 1: 判断を下す部品は、事例と生成した問いのすべてで、Stage 0 と同じ判断を返す", async () => {
  for (const component of [...Object.keys(VARIANTS), "mutation-judge", "mutation-verdict"]) {
    const adapter = await adapterOf(component);
    assert.ok(adapter, component);
    const cases = existsSync(join(SELF, "cases", `${component}.json`)) ? (JSON.parse(readFileSync(join(SELF, "cases", `${component}.json`), "utf8")) as { cases: never[] }).cases : [];
    const found = await disagreementsOn(component, adapter, [...cases, ...sampleCases(component, 30, 7)]);
    assert.deepEqual(found, [], component);
  }
});

test("Stage 1: 食い違えば、フレームワークの誤りとして止まる (R4)", async () => {
  const { asked } = recording(() => decided("observation-compare", { expected: 1, actual: 1 }, true));
  await assert.rejects(agree(asked, { "observation-compare": async () => false }), FrameworkError);
  await agree(asked, { "observation-compare": async () => true });
  // 答えられないとき (undefined) は、Stage 0 だけが決める
  await agree(asked, { "observation-compare": async () => undefined });
});

test("固定点 2: clp compile の出力は、Stage 0 でも Stage 1 でも同じ", () => {
  for (const [dir, component] of [
    [specsDir, "order"],
    ["packages/cli/self1/specs", "pipeline"],
    ["packages/cli/self1/specs", "fit-check"],
  ]) {
    const stage0 = clp(["compile", dir, "--component", component], { CLP_STAGE: "0" });
    const stage1 = clp(["compile", dir, "--component", component]);
    assert.equal(stage0.status, 0, stage0.stderr);
    assert.equal(stage1.stdout, stage0.stdout, `${dir} ${component}`);
    assert.doesNotMatch(stage1.stderr, /Stage 0 \(手書き\) で続けます/, `${dir} ${component}`);
  }
});

test("パイプライン: 生成した状態機械は、手書きの手続き (Stage 0) と同じ順に、同じ段階を動かす", async () => {
  for (const [script, options] of [
    [{}, {}],
    [{ implementation: ["buggy", "correct"] }, {}],
    [{ implementation: ["buggy", "buggy", "correct"] }, { maxAttempts: 2, maxRounds: 2 }],
    [{ implementation: ["buggy"] }, { maxAttempts: 2, maxRounds: 2 }],
    [{ design: ["broken", "correct"], wiring: ["idle", "correct"] }, {}],
  ] as const) {
    const trail = async (stage: string) =>
      withStage(stage, async () => {
        const result = await run(script as never, { mutation: null, ...options });
        return { status: result.status, trail: result.trail, rounds: result.attempts.map((a) => a.round), stages: result.stages };
      });
    const stage0 = await trail("0");
    const stage1 = await trail("");
    assert.deepEqual({ ...stage1, stages: undefined }, { ...stage0, stages: undefined }, JSON.stringify(script));
    assert.deepEqual(stage0.stages, { order: 0 });
    assert.deepEqual(stage1.stages, { order: 1 });
  }
});

test("clp interpret の進め方: 生成した状態機械は、手書きの手続き (Stage 0) と同じ順に進め、同じ結果を返す", async () => {
  const reviewed = readFileSync(join(specsDir, "order.interpretation.ts"), "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("// Code generated") && !line.startsWith("// layer1 "))
    .join("\n");
  const typo = reviewed.replace("Payment.Active()", "Payment.Activ()");
  const always = reviewed.replace('        this.status = "CANCELLED";\n        return "cancelled";\n      }\n      return', '        this.status = "CANCELLED";\n        Refunds.Refund(0);\n        return "cancelled";\n      }\n      return');
  assert.notEqual(always, reviewed);
  const widened = reviewed.replace('      return "not-cancellable";', '      return "too-late";');
  const once = async (stage: string) =>
    withStage(stage, async () => {
      const dir = mkdtempSync(join(mkdtempSync(join(tmpRoot, "d-")), "specs-"));
      writeFileSync(join(dir, "order.component.ts"), readFileSync(join(specsDir, "order.component.ts"), "utf8"));
      const drafts = [typo, reviewed, widened, widened, always];
      const seen: string[] = [];
      const strategy = {
        name: "scripted",
        run(assignment: { dir: string; attempt: number }) {
          seen.push(`${assignment.attempt}:${readFileSync(join(assignment.dir, "clp/REQUEST.md"), "utf8").split("\n")[0]}`);
          writeFileSync(join(assignment.dir, "spec/order.interpretation.draft.ts"), drafts[Math.min(seen.length, drafts.length) - 1]);
        },
      };
      const result = await interpret8({ specs: dir, strategy: strategy as never, sessions: 3, maxAttempts: 2 });
      const draft = readFileSync(join(dir, "order.interpretation.draft.ts"), "utf8");
      const refused = await accept8({ specs: dir });
      writeFileSync(join(dir, "order.interpretation.draft.ts"), draft.replaceAll("// REVIEW(clp):", "// REVIEWED(clp):"));
      const accepted = await accept8({ specs: dir });
      return JSON.parse(JSON.stringify({ result, seen, draft, refused, accepted }).replaceAll(dir, "<dir>").replaceAll(relative(process.cwd(), dir), "<dir>"));
    });
  const stage0 = await once("0");
  const stage1 = await once("");
  assert.equal(stage0.result.status, "interpreted");
  assert.deepEqual(stage0.result.comparisons.map((c: { session: number; status: string }) => [c.session, c.status]), [[2, "failed"], [3, "compared"]]);
  for (const key of Object.keys(stage0)) assert.deepEqual(stage1[key], stage0[key], key);
});

test("固定点 3: 自分の生成物の上で動くフレームワークが、自分のコンポーネントを採点し直して合格し、テスト側を同じに作る", async () => {
  // 写しは packages/cli 配下に置く（@clp/cli を解決できる場所）
  const copy = mkdtempSync(join(tmpRoot, "self-"));
  for (const part of ["specs", "src", "clp", "cases"]) cpSync(join(SELF, part), join(copy, part), { recursive: true });
  const before = Object.fromEntries(readdirSync(join(copy, "clp")).filter((name) => !name.endsWith(".verified.json")).map((name) => [name, readFileSync(join(copy, "clp", name), "utf8")]));
  const regraded = clp(["apply", "--specs", join(copy, "specs"), "--out", copy, "--runs", "200", "--mutation", "off"]);
  assert.equal(regraded.status, 0, regraded.stderr.slice(-3000));
  const result = JSON.parse(regraded.stdout) as { status: string; stages: Record<string, number> };
  assert.equal(result.status, "pass");
  // 採点の部品を作り直す実行ではないので、パイプラインは Stage 1 で動く
  assert.ok(Object.values(result.stages).every((stage) => stage === 1), JSON.stringify(result.stages));
  for (const [name, text] of Object.entries(before)) {
    if (name.endsWith(".verify.ts")) continue; // the specs path differs
    assert.equal(readFileSync(join(copy, "clp", name), "utf8"), text, name);
  }
});

test("合格の記録: Stage 1 が使うのは、検証に合格した、いまの仕様の版だけ。採点の部品は Stage 0 が採点した記録だけ", async () => {
  const record = JSON.parse(readFileSync(join(SELF, "clp/mutation-judge.verified.json"), "utf8")) as { gradedBy: string; stage0?: string };
  assert.equal(record.gradedBy, "stage0");
  assert.ok(record.stage0);
  for (const component of Object.keys(R1_COMPONENTS8)) {
    const r = JSON.parse(readFileSync(join(SELF, `clp/${component}.verified.json`), "utf8")) as { gradedBy: string };
    assert.equal(r.gradedBy, "stage0", component);
  }
});

after(() => rmSync(tmpRoot, { recursive: true, force: true }));
