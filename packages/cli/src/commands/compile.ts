import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extract, stableStringify, whereOf } from "../extract.ts";
import { graphDiagnostics, providedData } from "../graph.ts";
import { listComponents, loadSpecs } from "../loader.ts";
import { seedOf } from "../generate.ts";
import type { Ir } from "../generate.ts";
import { describeUnobservable, observability, selfCheck, unreachedCases } from "../runtime.ts";
import { graphCheck, loadJudges, mutationVerdict, references, runStage1 } from "../stage1.ts";
import { typecheckSpecs } from "../typecheck.ts";

export const summary = "仕様を検査して、IR を標準出力に出す";
export const usage = `clp compile [<specs-dir>] [--component <name>] [--drafts]

  仕様を型チェックし、仕様だけで検査して、IR (JSON) を標準出力に出します。診断は標準エラーに出ます。
  コンポーネントが1つならその IR を、複数なら { 名前: IR } を出力します。

  <specs-dir>          仕様のディレクトリ（既定: specs）
  --component <name>   1つのコンポーネントだけを対象にする（ほかのコンポーネントの解釈にある型エラーは報告しない）
  --drafts             解釈の下書き (*.draft.ts) を、確定版の代わりに読む
  --strict-added       解釈が足した語彙（副作用、データ、問い合わせ）が使われていなければ、注意ではなく誤りにする
                       （clp interpret が、LLM の書いた解釈を確かめるときに使う）`;

export async function main(args: string[]): Promise<void> {
const { values, positionals } = parseArgs({
  args,
  // strict-added: 解釈が足した語彙が使われていなければ誤りにする（clp interpret が、LLM の書いた解釈を確かめるときに使う）
  options: { drafts: { type: "boolean", default: false }, component: { type: "string" }, "strict-added": { type: "boolean", default: false } },
  allowPositionals: true,
});
const dir = resolve(process.cwd(), positionals[0] ?? "specs");
const all = await listComponents(dir, { drafts: values.drafts });
const names = values.component === undefined ? all : [values.component];

// 含む部品が作るときに渡すデータ（ほかのコンポーネントの仕様から分かる）
const provided = providedData(await Promise.all(all.map((name) => loadSpecs(dir, { drafts: values.drafts, component: name }))));
const irs: Record<string, unknown> = {};
const ignored = new Set<string>();
const checks: (() => Promise<void>)[] = [];
for (const name of names) {
  const spec = await loadSpecs(dir, { drafts: values.drafts, component: name, judges: loadJudges });
  if (values.component !== undefined) for (const file of spec.sources?.otherBindings ?? []) ignored.add(file);
  // 名前の検査は、フレームワーク自身の仕様から生成したコード (Stage 1) で行う。使えなければ手書き (Stage 0)
  const { ir, diagnostics } = extract(spec, await references(spec));
  const tag = names.length > 1 ? `${name}: ` : "";
  // グラフの検査: たどり着けない状態とコマンド、使われない語彙（ほかの誤りが無いときに）
  const strict = values["strict-added"];
  const structural = diagnostics.some((d) => d.severity === "error")
    ? []
    : graphDiagnostics(spec, provided.get(name), strict, await runStage1(graphCheck, { spec, provided: provided.get(name), strict }));
  for (const d of [...diagnostics, ...structural]) console.error(`${d.severity}[${d.code}] ${tag}${whereOf(d)}${d.message}`);
  if ([...diagnostics, ...structural].some((d) => d.severity === "error")) process.exitCode = 1;
  irs[name] = ir;

  // 仕様の事前検査: 仕様だけをランダムなコマンド列で実行し、条件の衝突や不変条件の破れを見つける
  checks.push(async () => {
    if (!spec.model) return;
    const checked = await selfCheck(spec, { seed: 1 });
    if (checked.ok) return;
    console.error(`error[spec-check] ${tag}${checked.message}`);
    console.error(`  再現するコマンド列: ${JSON.stringify(checked.steps)}`);
    process.exitCode = 1;
  });
  // 一度も成り立たない場合（事前検査に通ったあとで）。注意にとどめる
  checks.push(async () => {
    if (!spec.model || process.exitCode === 1) return;
    for (const found of await unreachedCases(spec, { seed: seedOf(ir as Ir) })) {
      console.error(`warning[unreached-case] ${tag}${found.command}.${found.case}: 仕様を実行しても、この場合には一度も当たりませんでした。条件がいつも偽か、入力がそこに届いていません。この場合の結果は検証されません`);
    }
  });
  // 仕様のミューテーション: 決定表の値が、検証に現れるか（事前検査に通ったあとで）
  checks.push(async () => {
    if (!spec.model || process.exitCode === 1) return;
    for (const found of await observability(spec, { seed: seedOf(ir as Ir) }, (trials) => runStage1(mutationVerdict, trials))) {
      console.error(`${found.severity}[unobservable-value] ${tag}${describeUnobservable(found)}`);
      if (found.severity === "error") process.exitCode = 1;
    }
  });
}

// 型チェック: 意味の漏れや、条件・フィールド名の typo はここで見つかる
const typeErrors = typecheckSpecs(dir, { drafts: values.drafts }).filter((e) => !ignored.has(e.file));
for (const e of typeErrors) console.error(`error[type-error] ${e.file}: ${e.message}`);
if (typeErrors.length > 0) process.exitCode = 1;

// コンポーネントが無いときは、空の IR（従来どおり）
process.stdout.write(stableStringify(names.length === 1 ? irs[names[0]] : all.length === 0 ? extract({ behaviors: {}, decisions: {} }).ir : irs));
if (process.exitCode !== 1) for (const check of checks) await check();
}
