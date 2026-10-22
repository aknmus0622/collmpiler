import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { compare8 } from "../v1/compare.ts";
import { compile } from "../v1/load.ts";

// 内部用: clp __compare <specs-dir> <other-specs-dir> --component <name>
// 同じコンポーネントの2つの解釈（どちらも下書きを読む）を、同じコマンド列で実行して比べ、食い違いを JSON で出力する
export async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { component: { type: "string" } }, allowPositionals: true });
  const [a, b] = positionals.slice(0, 2).map((dir) => compile(resolve(process.cwd(), dir), values.component, { drafts: true }).ir);
  if (!a || !b) throw new Error("比べる仕様の IR を作れません");
  process.stdout.write(JSON.stringify(await compare8(a, b, { seed: 1 }), null, 2));
}
