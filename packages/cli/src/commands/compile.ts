import { dirname, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { typecheckSpecs } from "../typecheck.ts";
import { loadProgram } from "../v1/load.ts";
import { checkSpec, prepare } from "../v1/prepare.ts";
import { stableStringify } from "../generate.ts";
import { problemText } from "../v1/read.ts";
import type { Program } from "../v1/read.ts";

/** The files of the named components (Layer 1 and interpretation, drafts included), and what they import relatively. */
function filesOf(program: Program, names: string[]): Set<string> {
  const files = new Set<string>();
  const visit = (file: string) => {
    const module = program.modules.get(file);
    const actual = module?.file ?? file;
    if (files.has(actual)) return;
    files.add(actual);
    for (const i of module?.imports ?? []) if (i.from.startsWith(".")) visit(join(dirname(actual), i.from));
  };
  for (const unit of program.units.filter((unit) => names.includes(unit.id))) {
    visit(unit.file);
    if (unit.interpretation) visit(unit.interpretation.file);
  }
  return files;
}

// 仕様 (DSL.md §17) の読み取り、型チェック、仕様だけの検査
async function compileSpecs(dir: string, values: { drafts?: boolean; component?: string }): Promise<void> {
  const { program, components } = loadProgram(dir, { drafts: values.drafts });
  const names = values.component === undefined ? components : [values.component];
  const irs: Record<string, unknown> = {};
  const checks: (() => Promise<void>)[] = [];
  const shown = new Set<string>();
  // コンポーネントを指定したときは、そのファイルと、そこから相対 import でたどれるファイルだけを検査する
  // (同じディレクトリで別のコンポーネントの下書きを作っている最中でも、その誤りに巻き込まれない)
  const files = values.component === undefined ? undefined : filesOf(program, names);
  // 読み取りの誤り (構文) は、どのコンポーネントのものでもあるので、一度だけ出す
  for (const p of program.problems.filter((p) => p.code === "syntax" && (!files || !p.at || files.has(p.at.file)))) {
    console.error(problemText(p));
    shown.add(problemText(p));
    process.exitCode = 1;
  }
  for (const name of names) {
    const { ir, problems } = await prepare(dir, name, { drafts: values.drafts });
    const tag = names.length > 1 ? `${name}: ` : "";
    for (const p of problems) {
      const text = problemText(p);
      if (shown.has(text)) continue;
      shown.add(text);
      console.error(`${p.severity}[${p.code}] ${tag}${text.slice(text.indexOf("]") + 2)}`);
      if (p.severity === "error") process.exitCode = 1;
    }
    irs[name] = ir;
    checks.push(async () => {
      if (!ir || problems.some((p) => p.severity === "error")) return;
      const checked = await checkSpec(ir);
      for (const p of checked.problems) console.error(`${p.severity}[${p.code}] ${tag}${p.where}: ${p.message}`);
      if (checked.problems.length > 0) process.exitCode = 1;
      for (const w of checked.warnings) console.error(`${tag}${w}`);
    });
  }
  const typeErrors = typecheckSpecs(dir, { drafts: values.drafts, ...(files ? { only: [...files].map((file) => relative(resolve(dir), file).split(sep).join("/")) } : {}) });
  for (const e of typeErrors) console.error(`error[type-error] ${e.file}: ${e.message}`);
  if (typeErrors.length > 0) process.exitCode = 1;
  process.stdout.write(stableStringify(names.length === 1 ? irs[names[0]] ?? null : irs));
  if (process.exitCode !== 1) for (const check of checks) await check();
}

export const summary = "仕様を検査して、IR を標準出力に出す";
export const usage = `clp compile [<specs-dir>] [--component <name>] [--drafts]

  仕様を型チェックし、仕様だけで検査して、IR (JSON) を標準出力に出します。診断は標準エラーに出ます。
  コンポーネントが1つならその IR を、複数なら { 名前: IR } を出力します。

  <specs-dir>          仕様のディレクトリ（既定: specs）
  --component <name>   1つのコンポーネントだけを対象にする（ほかのコンポーネントの解釈にある型エラーは報告しない）
  --drafts             解釈の下書き (*.draft.ts) を、確定版の代わりに読む`;

export async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { drafts: { type: "boolean", default: false }, component: { type: "string" } }, allowPositionals: true });
  await compileSpecs(resolve(process.cwd(), positionals[0] ?? "specs"), values);
}
