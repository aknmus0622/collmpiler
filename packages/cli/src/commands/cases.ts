import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { R1_CASES } from "../stage1.ts";
import type { Adapter } from "../runtime.ts";

// 内部用: clp __cases --component <name> --adapter <adapter.ts> --cases <cases.json>
// 採点の部品の、事例の集まり (R3): 入力だけを持つ事例を、Stage 0 と、渡したアダプター (いま作ったばかりのコード) の
// 両方で判断し、食い違いを JSON で出力する ({ problem? })。いま作ったコードを読み込むので、別のプロセスで動かす
export async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { component: { type: "string" }, adapter: { type: "string" }, cases: { type: "string" } } });
  const entry = R1_CASES[values.component ?? ""];
  if (!entry) throw new Error(`採点の部品ではありません: ${values.component}`);
  const cases = (JSON.parse(readFileSync(resolve(process.cwd(), values.cases!), "utf8")) as { cases: unknown[] }).cases;
  const adapter = ((await import(pathToFileURL(resolve(process.cwd(), values.adapter!)).href)) as { adapter: Adapter }).adapter;
  const problems: string[] = [];
  for (const [index, given] of cases.entries()) {
    const found = await entry.compare(adapter, given);
    if (found !== undefined) problems.push(`事例 ${index}: ${found}`);
  }
  process.stdout.write(JSON.stringify(problems.length === 0 ? {} : { problem: problems.join(" / ") }));
}
