import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { migrate } from "../v1/migrate.ts";

// 内部用: clp __migrate <0.3 の仕様のディレクトリ> --out <dir>
// 0.3 の Layer 1 を 1.0 の書き方に移した出発点を書き出す（人が読んで直す。解釈は clp interpret で導き直す）
export const summary = "0.3 の Layer 1 を 1.0 の書き方に移す（出発点）";
export const usage = "clp __migrate <specs-dir> --out <dir>";
export async function main(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, options: { out: { type: "string" } }, allowPositionals: true });
  const out = resolve(process.cwd(), values.out ?? "specs-v1");
  mkdirSync(out, { recursive: true });
  for (const { file, source } of await migrate(positionals[0] ?? "specs")) {
    writeFileSync(join(out, file), source);
    console.error(`書きました: ${join(out, file)}`);
  }
}
