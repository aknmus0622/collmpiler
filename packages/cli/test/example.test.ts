import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { contract8, specView, stableStringify8 } from "../src/v1/generate.ts";
import { compile } from "../src/v1/load.ts";
import { checkSpec, prepare } from "../src/v1/prepare.ts";
import { problemText } from "../src/v1/read.ts";
import { selfCheck8 } from "../src/v1/pbt.ts";
import { repoRoot, restamp, specsDir } from "./support.ts";

// 例の仕様 (1.0 の注文): 読み取り、IR、仕様だけの実行、仕様のミューテーション、添付資料
process.env.CLP_ALLOY = "off";

const tmpRoot = join(import.meta.dirname, ".tmp-example");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

/** The example's specs, copied, with Layer 1 changed (and the interpretation's stamps renewed). */
function variant(from: string, to: string): string {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const name of readdirSync(specsDir)) {
    const text = readFileSync(join(specsDir, name), "utf8");
    if (name === "order.component.ts") assert.ok(text.includes(from), from);
    writeFileSync(join(dir, name), name === "order.component.ts" ? text.replace(from, to) : text);
  }
  restamp(dir);
  return dir;
}

test("例: 誤りなく読めて、IR は実行ごとにバイト一致する", () => {
  const { ir, problems } = compile(specsDir, "order");
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  assert.equal(ir!.irVersion, 8);
  assert.equal(stableStringify8(ir!), stableStringify8(compile(specsDir, "order").ir!));
  const cli = spawnSync(process.execPath, [join(repoRoot, "packages/cli/bin/clp.ts"), "compile", specsDir], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, stableStringify8(ir!));
});

test("例: 決定表は IR に行として残り、最初に成り立つ行が選ばれる。null は「その行は値を持たない」", () => {
  const { ir } = compile(specsDir, "order");
  const campaign = ir!.components.order.decisions!.campaign;
  assert.equal(campaign.rows.length, 3);
  assert.deepEqual(campaign.rows[1].then.coupon, null);
  // 解釈の中身 (条件の式) も IR にある。正解は、この式を評価して作る
  assert.ok(JSON.stringify(ir!.components.order).includes('"Silver"'));
});

test("例: 仕様だけの実行と、仕様のミューテーションに合格する", async () => {
  const { ir } = compile(specsDir, "order");
  assert.ok((await selfCheck8(ir!, { seed: 1 })).ok);
  const checked = await checkSpec(ir!);
  assert.deepEqual(checked.problems.map((p) => `${p.code} ${p.where}`), []);
});

test("例: 契約と、設計・実装の段階に渡す仕様の読み物", () => {
  const { ir } = compile(specsDir, "order");
  const contract = contract8(ir!);
  assert.match(contract, /\| \{ name: "PlaceOrder"; input: \{ customerRank: "Gold" \| "Silver" \| "Bronze"; listPrice: number \} \}/);
  assert.match(contract, /Cancel: "cancelled" \| "not-cancellable";/);
  assert.match(contract, /refunds: \{\s*Refund\(input: \{ amount: number \}\): void;/);
  const view = specView(ir!);
  assert.match(view, /### Command `PlaceOrder\(customerRank: /);
  // 仕様の読み物に、解釈の文 (REVIEW の記録) は載らない
  assert.doesNotMatch(view, /REVIEWED/);
});

test("古さ: Layer 1 の文を変えると、解釈は使われない。決定表の値だけの変更は、古くしない", () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  for (const name of readdirSync(specsDir)) {
    const text = readFileSync(join(specsDir, name), "utf8");
    writeFileSync(join(dir, name), name === "order.component.ts" ? text.replace("An order confirmation is sent.", "A confirmation is sent.") : text);
  }
  assert.match(compile(dir, "order").problems.map(problemText).join("\n"), /stale-interpretation/);

  const cells = mkdtempSync(join(tmpRoot, "s-"));
  for (const name of readdirSync(specsDir)) {
    const text = readFileSync(join(specsDir, name), "utf8");
    writeFileSync(join(cells, name), name === "order.component.ts" ? text.replace("{ discountPercent: 5,", "{ discountPercent: 7,") : text);
  }
  assert.deepEqual(compile(cells, "order").problems.filter((p) => p.severity === "error").map(problemText), []);
});

test("仕様の誤り: 範囲外の条件、届かない行の値、不変条件の破れは、エージェントを呼ぶ前に見つかる", async () => {
  // 決定表の最後の行に届かない（シルバー会員の条件を常に真にした）: その値は確かめられない
  const unreachable = variant('[is.silver("The customer is a Silver member"), {', '[is.silver("The customer is a Silver member", true), {');
  const { ir } = compile(unreachable, "order");
  const checked = await checkSpec(ir!);
  assert.ok(checked.problems.some((p) => p.code === "unobservable-value" && /campaign\[2\]/.test(`${p.where} ${p.message}`)), checked.problems.map((p) => `${p.code} ${p.where} ${p.message}`).join("\n"));

  // 不変条件: 下書きの状態を過ぎた注文には会員ランクがある。注文で覚えないと破れる
  const forgetful = variant("does.place(", "does.forget(");
  const broken = compile(forgetful, "order");
  assert.ok(broken.problems.some((p) => p.severity === "error"), "the interpretation no longer fits: place is gone");
});

test("添付資料: file / dir / text で宣言でき、パスはコンポーネントのファイルからの相対で読む", async () => {
  const dir = mkdtempSync(join(tmpRoot, "a-"));
  mkdirSync(join(dir, "docs"));
  writeFileSync(join(dir, "docs/style.md"), "- Keep it small.");
  writeFileSync(
    join(dir, "a.component.ts"),
    `import { file, service, text } from "@clp/core";
export const A = service("A", {
  commands: { Go(): "ok" { return "ok"; } },
  assets: [file("docs/style.md"), text("Money is whole yen.", { phases: ["wiring"] })],
});
`,
  );
  const { assets } = await prepare(dir, "a");
  assert.deepEqual(assets.map((a) => (a.kind === "file" ? `file:${a.name}:${a.content}` : `text:${a.text}:${(a.phases ?? []).join(",")}`)), ["file:docs/style.md:- Keep it small.", "text:Money is whole yen.:wiring"]);
});
