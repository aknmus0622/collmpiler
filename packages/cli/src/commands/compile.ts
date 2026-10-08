import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extract, stableStringify } from "../extract.ts";
import { listComponents, loadSpecs } from "../loader.ts";
import { selfCheck } from "../runtime.ts";
import { references } from "../stage1.ts";
import { typecheckSpecs } from "../typecheck.ts";

export const summary = "仕様を検査して、IR を標準出力に出す";
export const usage = `clp compile [<specs-dir>] [--component <name>] [--drafts]

  仕様を型チェックし、仕様だけで検査して、IR (JSON) を標準出力に出します。診断は標準エラーに出ます。
  コンポーネントが1つならその IR を、複数なら { 名前: IR } を出力します。

  <specs-dir>          仕様のディレクトリ（既定: specs）
  --component <name>   1つのコンポーネントだけを対象にする（ほかのコンポーネントの解釈にある型エラーは報告しない）
  --drafts             解釈の下書き (*.draft.ts) を、確定版の代わりに読む`;

export async function main(args: string[]): Promise<void> {
const { values, positionals } = parseArgs({
  args,
  options: { drafts: { type: "boolean", default: false }, component: { type: "string" } },
  allowPositionals: true,
});
const dir = resolve(process.cwd(), positionals[0] ?? "specs");
const all = await listComponents(dir, { drafts: values.drafts });
const names = values.component === undefined ? all : [values.component];

const irs: Record<string, unknown> = {};
const ignored = new Set<string>();
const checks: (() => Promise<void>)[] = [];
for (const name of names) {
  const spec = await loadSpecs(dir, { drafts: values.drafts, component: name });
  if (values.component !== undefined) for (const file of spec.sources?.otherBindings ?? []) ignored.add(file);
  // 名前の検査は、フレームワーク自身の仕様から生成したコード (Stage 1) で行う。使えなければ手書き (Stage 0)
  const { ir, diagnostics } = extract(spec, await references(spec));
  const tag = names.length > 1 ? `${name}: ` : "";
  for (const d of diagnostics) console.error(`${d.severity}[${d.code}] ${tag}${d.behavior}.${d.case}: ${d.message}`);
  if (diagnostics.some((d) => d.severity === "error")) process.exitCode = 1;
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
}

// 型チェック: 意味の漏れや、条件・フィールド名の typo はここで見つかる
const typeErrors = typecheckSpecs(dir, { drafts: values.drafts }).filter((e) => !ignored.has(e.file));
for (const e of typeErrors) console.error(`error[type-error] ${e.file}: ${e.message}`);
if (typeErrors.length > 0) process.exitCode = 1;

// コンポーネントが無いときは、空の IR（従来どおり）
process.stdout.write(stableStringify(names.length === 1 ? irs[names[0]] : all.length === 0 ? extract({ behaviors: {}, decisions: {} }).ir : irs));
if (process.exitCode !== 1) for (const check of checks) await check();
}
