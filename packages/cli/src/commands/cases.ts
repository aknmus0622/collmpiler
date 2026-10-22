import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { disagreementsOn } from "../v1/agreement.ts";
import type { CaseInput } from "../v1/agreement.ts";
import type { Adapter8 } from "../v1/pbt.ts";

// 内部用: clp __cases --component <name> --adapter <adapter.ts> --cases <cases.json>
// 採点の部品の、事例の集まり (R3): 入力だけを持つ事例（問いの種類と入力。v1/agreement.ts の問いと同じもの）を、
// Stage 0 と、渡したアダプター (いま作ったばかりのコード) の両方で判断し、食い違いを JSON で出力する ({ problem? })。
// いま作ったコードを読み込むので、別のプロセスで動かす
export async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({ args, options: { component: { type: "string" }, adapter: { type: "string" }, cases: { type: "string" } } });
  const file = JSON.parse(readFileSync(resolve(process.cwd(), values.cases!), "utf8")) as { cases: CaseInput[] };
  const adapter = ((await import(pathToFileURL(resolve(process.cwd(), values.adapter!)).href)) as { adapter: Adapter8 }).adapter;
  const found = await disagreementsOn(values.component ?? "", adapter, file.cases);
  const problem = found
    .slice(0, 5)
    .map((d) => `${JSON.stringify(d.question)}: Stage 0 は ${JSON.stringify(d.stage0)}、生成したコードは ${JSON.stringify(d.spec)}`)
    .join(" / ");
  process.stdout.write(JSON.stringify(found.length === 0 ? {} : { problem: `${found.length} 件の食い違い: ${problem}` }));
}
