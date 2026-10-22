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
  const file = JSON.parse(readFileSync(resolve(process.cwd(), values.cases!), "utf8")) as { irVersion?: number; cases: unknown[] };
  // 1.0 の部品の事例 (問いの種類と入力。v1/agreement.ts の問いと同じもの)
  if (file.irVersion === 8) {
    const { disagreementsOn } = await import("../v1/agreement.ts");
    const adapter = ((await import(pathToFileURL(resolve(process.cwd(), values.adapter!)).href)) as { adapter: import("../v1/pbt.ts").Adapter8 }).adapter;
    const found = await disagreementsOn(values.component ?? "", adapter, file.cases as import("../v1/agreement.ts").CaseInput[]);
    const problem = found
      .slice(0, 5)
      .map((d) => `${JSON.stringify(d.question)}: Stage 0 は ${JSON.stringify(d.stage0)}、生成したコードは ${JSON.stringify(d.spec)}`)
      .join(" / ");
    process.stdout.write(JSON.stringify(found.length === 0 ? {} : { problem: `${found.length} 件の食い違い: ${problem}` }));
    return;
  }
  const entry = R1_CASES[values.component ?? ""];
  if (!entry) throw new Error(`採点の部品ではありません: ${values.component}`);
  const cases = file.cases;
  const adapter = ((await import(pathToFileURL(resolve(process.cwd(), values.adapter!)).href)) as { adapter: Adapter }).adapter;
  const problems: string[] = [];
  for (const [index, given] of cases.entries()) {
    const found = await entry.compare(adapter, given);
    if (found !== undefined) problems.push(`事例 ${index}: ${found}`);
  }
  process.stdout.write(JSON.stringify(problems.length === 0 ? {} : { problem: problems.join(" / ") }));
}
