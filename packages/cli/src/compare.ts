import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { loadSpecs } from "./loader.ts";
import { compareSpecs } from "./runtime.ts";

// 内部用: node compare.ts <specs-dir> <other-specs-dir> --component <name>
// 同じコンポーネントの2つの解釈（どちらも下書きを読む）を、同じコマンド列で実行して比べ、食い違いを JSON で出力する
const { values, positionals } = parseArgs({ options: { component: { type: "string" } }, allowPositionals: true });
const [first, second] = await Promise.all(
  positionals.slice(0, 2).map((dir) => loadSpecs(resolve(process.cwd(), dir), { drafts: true, component: values.component })),
);
process.stdout.write(JSON.stringify(await compareSpecs(first, second, { seed: 1 }), null, 2));
