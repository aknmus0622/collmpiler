import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { agreement } from "../v1/agreement.ts";
import { compile } from "../v1/load.ts";

// 内部用: clp __agreement --specs <dir> --component <name> [--drafts]
// フレームワーク自身の部品の仕様が、対になる Stage 0 と同じ判断をするかを、たくさんの問いで確かめる（解釈を確定する前、コードを作る前に）
export const summary = "self の部品の仕様を、Stage 0 と突き合わせる";
export const usage = "clp __agreement --specs <dir> --component <name> [--drafts] [--runs n]";
export async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { specs: { type: "string" }, component: { type: "string" }, drafts: { type: "boolean", default: false }, runs: { type: "string" } } });
  const { ir, problems } = compile(resolve(process.cwd(), values.specs!), values.component, { drafts: values.drafts });
  const errors = problems.filter((p) => p.severity === "error");
  if (!ir || errors.length) {
    console.error(errors.map((p) => `${p.where} ${p.message}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  const found = await agreement(values.component!, ir, values.runs ? Number(values.runs) : 500);
  for (const d of found) console.log(`食い違い: ${JSON.stringify(d.question)}\n  Stage 0: ${JSON.stringify(d.stage0)}\n  仕様:    ${JSON.stringify(d.spec)}`);
  if (found.length === 0) console.log("一致しました");
  else process.exitCode = 1;
}
