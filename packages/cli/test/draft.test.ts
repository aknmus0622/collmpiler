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
// 仕様のコピーは packages/cli 配下に置く（@clp/core を解決できる場所）

const repoRoot = join(import.meta.dirname, "../../..");
const tmpRoot = join(import.meta.dirname, ".tmp-drafts");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

const reviewed = readFileSync(join(repoRoot, "specs/order.binding.ts"), "utf8");

// 例の決定表とコンポーネントだけを写した仕様ディレクトリ（結び付けは無い）
function specDir() {
  const dir = mkdtempSync(join(tmpRoot, "d-"));
  for (const name of ["order.decisions.ts", "order.component.ts"]) copyFileSync(join(repoRoot, "specs", name), join(dir, name));
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
        request: readFileSync(join(assignment.dir, "clp/REQUEST.md"), "utf8"),
        start: readFileSync(file, "utf8"),
        files: ["order.decisions.ts", "order.component.ts", "order.binding.ts"].filter((name) => existsSync(join(assignment.dir, "spec", name))),
      });
      writeFileSync(file, drafts[Math.min(assignment.attempt, drafts.length) - 1]);
      extra?.(assignment);
    },
  };
  return { strategy, seen };
}

const compileWithDrafts = (dir: string) =>
  spawnSync(process.execPath, [join(repoRoot, "packages/cli/src/compile.ts"), dir, "--drafts"], { encoding: "utf8" });

test("下書き: コマンドと名前をすべて並べた雛形から始め、検査に通ったら .draft.ts として書き出す", async () => {
  const dir = specDir();
  const { strategy, seen } = scripted([reviewed]);
  const result = await draftBinding({ specs: dir, strategy });

  assert.ok(result.status === "drafted" && result.attempts === 1);
  // エージェントには仕様のファイルが渡る
  assert.deepEqual(seen[0].files, ["order.decisions.ts", "order.component.ts"]);
  // 雛形: 構造は、コマンドの文をコメントに添えた空の宣言。意味は、名前を並べた未実装の関数
  assert.match(seen[0].start, /\/\/ If the order had been paid, a refund is issued\.\n    Cancel: \{\},/);
  assert.match(seen[0].start, /Checkout: \{\n      \/\/ A receipt is sent[^\n]*\n      "The payment succeeded": \{\},\n      \/\/ The customer is notified[^\n]*\n      "otherwise": \{\},/);
  assert.match(seen[0].start, /"The customer is a Silver member": \(state\) => \{\n      throw new Error\("TODO"\);/);
  assert.match(seen[0].start, /\/\/ price × \(100 − discount percent\) ÷ 100, rounded down to a whole yen\n    amountCharged: \(state\) =>/);
  // 依頼文は、使える参照を仕様の語彙で案内する
  assert.match(seen[0].request, /`ref\.decision\("table", "column"\)`[\s\S]*tables: `campaign`, `shipping`/);
  assert.match(seen[0].request, /`ref\.input\("field"\)`: the command's input \(`customerRank`, `listPrice`\)/);

  // 書き出された下書きには、未確認であることが明記される
  const draft = readFileSync(join(dir, "order.binding.draft.ts"), "utf8");
  assert.match(draft, /^\/\/ DRAFT — written by an LLM, not yet reviewed\./);
  assert.ok(draft.endsWith(reviewed));
});

test("下書き: 人が名前を変えるまで、検証には使われない", async () => {
  const dir = specDir();
  await draftBinding({ specs: dir, strategy: scripted([reviewed]).strategy });

  // 既定の読み込みは下書きを無視するので、結び付けは無いまま
  const { diagnostics } = extract(await loadSpecs(dir));
  assert.deepEqual(diagnostics.map((d) => d.code), ["unbound-specification"]);
  // 下書きを読むよう明示したときだけ、仕様として通る
  assert.equal(compileWithDrafts(dir).status, 0);
});

test("下書き: 型エラーのある下書きは、書き直させる (意味の関数の typo、構造の参照の型違い)", async () => {
  const typo = reviewed.replace("state.paymentModuleActive", "state.paymentModuleActiv");
  // 真偽値の列を、整数のフィールドに渡している
  const wrongColumn = reviewed.replace('discountPercent: ref.decision("campaign", "discountPercent")', 'discountPercent: ref.decision("campaign", "grantsCoupon")');
  assert.ok(typo !== reviewed && wrongColumn !== reviewed);
  const { strategy, seen } = scripted([typo, wrongColumn, reviewed]);
  const result = await draftBinding({ specs: specDir(), strategy });
  assert.ok(result.status === "drafted" && result.attempts === 3);
  assert.match(seen[1].request, /Problems found in the previous attempt[\s\S]*type-error[\s\S]*paymentModuleActiv/);
  assert.match(seen[2].request, /Problems found in the previous attempt[\s\S]*type-error/);
});

test("下書き: 添付資料を渡せる", async () => {
  const { strategy, seen } = scripted([reviewed]);
  await draftBinding({
    specs: specDir(),
    strategy,
    assets: [
      { kind: "file", name: "glossary.md", content: "- month-end: the last day." },
      { kind: "text", text: "Prices never include tax." },
    ],
  });
  assert.match(seen[0].request, /## Project conventions[\s\S]*- Prices never include tax\.[\s\S]*`clp\/assets\/glossary\.md`/);
});

test("下書き: 型では分からない誤り (条件の衝突) も、書き直させる", async () => {
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

test("下書き: 仕様が変わって結び付けが合わなくなったら、いまの結び付けを出発点にして、合わない所だけを直させる", async () => {
  const dir = specDir();
  writeFileSync(join(dir, "order.binding.ts"), reviewed);
  // 追加要件: 出荷には「倉庫が開いている」という事前条件が要る
  const component = join(dir, "order.component.ts");
  writeFileSync(
    component,
    readFileSync(component, "utf8")
      .replace('    isMonthEnd: "boolean",', '    isMonthEnd: "boolean",\n    warehouseOpen: "boolean",')
      .replace('    Ship: {\n      from: ["PAID"],', '    Ship: {\n      from: ["PAID"],\n      onlyIf: ["The warehouse is open"],'),
  );
  assert.notEqual(spawnSync(process.execPath, [join(repoRoot, "packages/cli/src/compile.ts"), dir], { encoding: "utf8" }).status, 0);

  const updated = reviewed.replace('  conditions: {\n', '  conditions: {\n    "The warehouse is open": (state) => state.warehouseOpen,\n');
  assert.notEqual(updated, reviewed);
  const { strategy, seen } = scripted([updated]);
  const result = await draftBinding({ specs: dir, strategy });

  assert.ok(result.status === "drafted" && result.attempts === 1);
  assert.equal(result.updates, join(dir, "order.binding.ts"));
  // 出発点は雛形ではなく、いまの結び付け。作業場所には、下書きが置き換える確定版は置かない
  assert.equal(seen[0].start, reviewed);
  assert.deepEqual(seen[0].files, ["order.decisions.ts", "order.component.ts"]);
  assert.match(seen[0].request, /^# Update the binding[\s\S]*\*\*Change only what the specification now\s+requires\*\*/);
  assert.match(seen[0].request, /## Problems with the current binding[\s\S]*The warehouse is open/);

  // 確定版はそのまま。下書きを読むよう明示したときだけ、新しい結び付けが使われる
  assert.equal(readFileSync(join(dir, "order.binding.ts"), "utf8"), reviewed);
  assert.ok(readFileSync(join(dir, "order.binding.draft.ts"), "utf8").endsWith(updated));
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

test("下書き: --drafts を明示すれば、人の確認を待たずに実装まで流せる。結果には下書きを使ったことが残る", async () => {
  const dir = specDir();
  await draftBinding({ specs: dir, strategy: scripted([reviewed]).strategy });

  // 結び付けはプロセス全体で共有されるので、実装は別プロセス (コマンド) で実行する
  const out = mkdtempSync(join(tmpRoot, "o-"));
  const agent = `"${process.execPath}" "${join(import.meta.dirname, "fixtures/scripted-agent.ts")}"`;
  const implementWith = (...flags: string[]) =>
    spawnSync(
      process.execPath,
      [join(repoRoot, "packages/cli/src/implement.ts"), "--specs", dir, "--out", out, "--agent", agent, "--mutation", "off", ...flags],
      { encoding: "utf8" },
    );

  // 下書きを指定しなければ、結び付けが無いので始められない
  const refused = implementWith();
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /仕様( \(order\) )?に(型)?エラーがあります/);

  const accepted = implementWith("--drafts");
  assert.equal(accepted.status, 0);
  const result = JSON.parse(accepted.stdout);
  assert.equal(result.status, "pass");
  assert.equal(result.oracle, "draft");
  assert.match(accepted.stderr, /人が確認していない結び付けの下書きを、正解として使っています/);
});

test("添付資料: 仕様に宣言した資料が、実装の各段階に渡る (配線には、明示したものだけ)", async () => {
  // 例のコンポーネントに assets を足した仕様
  const dir = specDir();
  writeFileSync(join(dir, "order.binding.ts"), reviewed);
  const component = join(dir, "order.component.ts");
  writeFileSync(
    component,
    readFileSync(component, "utf8")
      .replace('import { component } from "@clp/core";', 'import { component, dir, file, text } from "@clp/core";')
      .replace(
        "export const Order = component({",
        `export const Order = component({
  assets: [
    file("docs/architecture.md"),
    dir("docs/conventions"),
    text("Adapters are named *Gateway.", { phases: ["wiring"] }),
  ],`,
      ),
  );
  mkdirSync(join(dir, "docs/conventions"), { recursive: true });
  writeFileSync(join(dir, "docs/architecture.md"), "- Use the repository pattern.");
  writeFileSync(join(dir, "docs/conventions/errors.md"), "- Never swallow errors.");

  const out = mkdtempSync(join(tmpRoot, "o-"));
  const agent = `"${process.execPath}" "${join(import.meta.dirname, "fixtures/scripted-agent.ts")}"`;
  const run = spawnSync(
    process.execPath,
    [join(repoRoot, "packages/cli/src/implement.ts"), "--specs", dir, "--out", out, "--agent", agent, "--mutation", "off", "--keep-sandbox"],
    { encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const attempts = JSON.parse(run.stdout).attempts as { phase: string; inputs: string[]; sandbox: string }[];
  try {
    const of = (phase: string) => attempts.find((a) => a.phase === phase)!;
    const assetsOf = (phase: string) => of(phase).inputs.filter((name) => name.startsWith("clp/assets/"));
    const documents = ["clp/assets/docs/architecture.md", "clp/assets/docs/conventions/errors.md"];
    assert.deepEqual(assetsOf("design"), documents);
    assert.deepEqual(assetsOf("implementation"), documents);
    assert.deepEqual(assetsOf("wiring"), []);

    assert.equal(readFileSync(join(of("design").sandbox, "clp/assets/docs/architecture.md"), "utf8"), "- Use the repository pattern.");
    assert.ok(!readFileSync(join(of("design").sandbox, "clp/REQUEST.md"), "utf8").includes("Gateway"));
    assert.match(readFileSync(join(of("wiring").sandbox, "clp/REQUEST.md"), "utf8"), /- Adapters are named \*Gateway\./);
  } finally {
    for (const { sandbox } of attempts) rmSync(sandbox, { recursive: true, force: true });
  }
});
