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

const { tmpRoot, workdir, scripted, run } = harness("layout");

// --- 配置 ---

test("配置: 本番コードとテスト側を、別々の場所に置ける (src/ と test/ を分ける流儀)", async () => {
  const base = workdir();
  const place = { source: "app/src/order-service.ts", adapter: "test/clp/order.adapter.ts" };
  const { strategy, seen } = scripted({}, undefined, place);
  const result = await implement({ specs: specsDir, src: join(base, "app/src"), tests: join(base, "test/clp"), strategy, maxAttempts: 1, maxRounds: 1 });
  assert.equal(result.status, "pass");

  // 作業場所は、出力先の相対位置をそのまま写す（依頼文だけは常に clp/）
  const keys = (phase: Phase) => Object.keys(of(seen, phase)[0].files).sort();
  assert.deepEqual(keys("design"), ["clp/REQUEST.md", "test/clp/order.ir.json"]);
  assert.deepEqual(keys("wiring"), ["app/src/order-service.ts", "clp/REQUEST.md", "test/clp/order.adapter.contract.ts", "test/clp/order.adapter.ts"]);
  // 依頼文と雛形は、その配置でのパスを案内する
  assert.match(of(seen, "design")[0].files["clp/REQUEST.md"], /specified in `test\/clp\/order\.ir\.json`[\s\S]*skeleton\*\* under `app\/src\/`/);
  assert.match(of(seen, "wiring")[0].files["test/clp/order.adapter.ts"], /Import the production code from \.\.\/\.\.\/app\/src\/ /);
  assert.match(of(seen, "wiring")[0].files["clp/REQUEST.md"], /may import only `\.\/order\.adapter\.contract\.ts` and production files under `\.\.\/\.\.\/app\/src\/`/);

  for (const file of ["app/src/order-service.ts", "test/clp/order.adapter.ts", "test/clp/order.ir.json", "test/clp/order.adapter.contract.ts", "test/clp/order.verify.ts"]) {
    assert.ok(existsSync(join(base, file)), file);
  }
  assert.ok(!existsSync(join(base, "clp")));
  assert.deepEqual(result.attempts.at(-1)?.mutation?.survivors.map((s) => s.file), ["app/src/order-service.ts"]);
});

test("配置: 本番コードと同じ場所に並べられる (テスト側は接頭辞で見分ける)", async () => {
  const base = workdir();
  const dir = join(base, "order");
  const place = { source: "order-service.ts", adapter: "clp.order.adapter.ts" };
  const options = { specs: specsDir, src: dir, tests: join(dir, "clp."), maxAttempts: 1, maxRounds: 1 };
  const first = scripted({}, undefined, place);
  assert.equal((await implement({ ...options, strategy: first.strategy })).status, "pass");
  assert.deepEqual(readdirSync(dir).sort(), [
    "clp.order.adapter.contract.ts",
    "clp.order.adapter.ts",
    "clp.order.ir.json",
    "clp.order.verify.ts",
    "order-service.ts",
  ]);
  assert.match(of(first.seen, "design")[0].files["clp/REQUEST.md"], /File names starting with `clp\.` are reserved for the test harness/);

  // 本番コードが、テスト側のための名前を使ったら差し戻す
  const squatter = scripted({}, ({ dir: sandbox, phase }) => {
    if (phase === "implementation") writeFileSync(join(sandbox, "clp.helper.ts"), "export {};");
  }, place);
  const rejected = await implement({ ...options, strategy: squatter.strategy, fresh: true });
  const feedback = rejected.attempts.at(-1)?.feedback;
  assert.ok(feedback?.kind === "check");
  assert.deepEqual(feedback.violations.map((v) => `${v.file}:${v.rule}`), ["clp.helper.ts:unexpected-file"]);

  // fresh でやり直しても、消えるのは本番コードとアダプターだけ
  const again = scripted({}, undefined, place);
  assert.equal((await implement({ ...options, strategy: again.strategy, fresh: true })).status, "pass");
  assert.deepEqual(again.seen.map((s) => s.phase), ["design", "wiring", "implementation"]);
  assert.deepEqual(Object.keys(again.seen[0].files).sort(), ["clp.order.ir.json", "clp/REQUEST.md"]);
});

test("配置: 危ない指定は、始める前に断る", () => {
  const base = workdir();
  // 同じ場所に置くのに、見分ける接頭辞が無い
  assert.throws(() => resolveLayout({ src: join(base, "order"), tests: join(base, "order") }), /--tests にファイル名の接頭辞まで書いてください/);
  // 本番コードのディレクトリは、エージェントが中身を書き直す。プロジェクトのルートを指させない
  writeFileSync(join(base, "package.json"), "{}");
  assert.throws(() => resolveLayout({ src: base, tests: join(base, "clp") }), /package\.json があります/);
  assert.throws(() => resolveLayout({ src: join(base, "src") }), /--out か、--src と --tests の両方を指定してください/);
  // --tests が "." で終われば、最後の部分が接頭辞。それ以外はディレクトリ
  assert.deepEqual(resolveLayout({ src: join(base, "order"), tests: join(base, "order/order.clp.") }), { root: join(base, "order"), src: "", tests: "", prefix: "order.clp." });
  assert.deepEqual(resolveLayout({ src: join(base, "app/src"), tests: join(base, "test/clp") }), { root: base, src: "app/src", tests: "test/clp", prefix: "" });
  assert.deepEqual(resolveLayout({ src: join(base, "app/src"), tests: join(base, "test/order.") }).prefix, "order.");
  // --out だけなら、従来どおり
  assert.deepEqual(resolveLayout({ out: join(base, "x") }), { root: join(base, "x"), src: "src", tests: "clp", prefix: "" });
});

// --- 余計なもの検査 ---

async function workspace() {
  const out = workdir();
  const ir = JSON.parse(stableStringify(extract(await loadSpecs(specsDir)).ir)) as Ir;
  mkdirSync(join(out, "clp"), { recursive: true });
  writeFileSync(join(out, "clp/order.ir.json"), stableStringify(ir));
  writeFileSync(join(out, "clp/order.adapter.contract.ts"), generateContract(ir));
  const ws = defaultWorkspace(out);
  writeFileSync(join(out, "clp/order.verify.ts"), generateVerify(ir, ws, specsDir));
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
  writeFileSync(join(out, "clp/order.adapter.ts"), generateAdapterSkeleton(defaultWorkspace(out)));
  assert.deepEqual(rules(), ["src:missing-file"]);
});

test("検査: 本番コードはフレームワーク・仕様・テスト側・組み込みモジュールに依存できない", async () => {
  const { rules, edit } = await workspace();
  edit("src/order-service.ts", (text) =>
    [
      `import { applyDecision } from "@clp/core";`,
      `import ir from "../clp/order.ir.json" with { type: "json" };`,
      `import { readFileSync } from "node:fs";`,
      `export * from "../../../../../examples/checkout-ts/specs/order.component.ts";`,
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
  edit("clp/order.verify.ts", (text) => text.replace("await runPbt", "// await runPbt"));
  rmSync(join(out, "clp/order.ir.json"));
  writeFileSync(join(out, "clp/helper.ts"), "");
  // 出力先のほかの場所は見ない（プロジェクトの他のファイルがあり得る。エージェントが作業場所に余計なものを
  // 作った場合は、出口ゲートの監査が弾く）
  writeFileSync(join(out, "notes.md"), "");
  writeFileSync(join(out, "src/data.json"), "{}");
  assert.deepEqual(rules().sort(), [
    "clp/helper.ts:unexpected-file",
    "clp/order.ir.json:generated-file-modified",
    "clp/order.verify.ts:generated-file-modified",
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
  edit("clp/order.adapter.ts", (text) => `import { CampaignRules } from "../../../../../examples/checkout-ts/specs/order.component.ts";\n${text}`);
  assert.deepEqual(rules(), ["clp/order.adapter.ts:forbidden-import"]);
});
