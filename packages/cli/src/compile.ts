import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { extract, stableStringify } from "./extract.ts";
import { loadSpecs } from "./loader.ts";
import { selfCheck } from "./runtime.ts";
import { typecheckSpecs } from "./typecheck.ts";

// 暫定エントリ: node packages/cli/src/compile.ts [specs-dir] [--drafts]  → IR を stdout へ
// --drafts: 結び付けの下書き (*.draft.ts) を、確定版の代わりに読む（下書きの検査用）
const { values, positionals } = parseArgs({ options: { drafts: { type: "boolean", default: false } }, allowPositionals: true });
const dir = resolve(process.cwd(), positionals[0] ?? "specs");

// 型チェック: 結び付けの漏れや、条件・フィールド名の typo はここで見つかる
const typeErrors = typecheckSpecs(dir, { drafts: values.drafts });
for (const e of typeErrors) console.error(`error[type-error] ${e.file}: ${e.message}`);
if (typeErrors.length > 0) process.exitCode = 1;

const spec = await loadSpecs(dir, { drafts: values.drafts });
const { ir, diagnostics } = await extract(spec);
for (const d of diagnostics) {
  console.error(`${d.severity}[${d.code}] ${d.behavior}.${d.case}: ${d.message}`);
}
process.stdout.write(stableStringify(ir));
if (diagnostics.some((d) => d.severity === "error")) process.exitCode = 1;

// 仕様の事前検査: 仕様だけをランダムなアクション列で実行し、条件の衝突や不変条件の破れを見つける
if (spec.model && process.exitCode !== 1) {
  const checked = await selfCheck(spec, { seed: 1 });
  if (!checked.ok) {
    console.error(`error[spec-check] ${checked.message}`);
    console.error(`  再現するアクション列: ${JSON.stringify(checked.steps)}`);
    process.exitCode = 1;
  }
}
