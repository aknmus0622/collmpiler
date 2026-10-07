import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { Violation } from "./check.ts";
import { DRAFT_SUFFIX } from "./loader.ts";

// 型チェック。仕様 (人または LLM が書く) と、LLM が書いたコードの両方にかける。
// Node がそのまま実行できる構文だけを許す設定 (erasableSyntaxOnly) なので、
// 「型は通るが実行できない」コードもここで弾ける。

const FLAGS = [
  // ファイルを直接渡すので、近くの tsconfig.json は使わない
  "--ignoreConfig",
  "--noEmit",
  "--strict",
  "--target", "esnext",
  "--module", "nodenext",
  "--allowImportingTsExtensions",
  "--erasableSyntaxOnly",
  "--skipLibCheck",
  "--pretty", "false",
];

function tscPath(): string {
  const manifest = createRequire(import.meta.url).resolve("typescript/package.json");
  return join(dirname(manifest), JSON.parse(readFileSync(manifest, "utf8")).bin.tsc);
}

// cwd からの相対パスで渡したファイルを型チェックし、エラーを返す（無ければ空）
export function typecheck(cwd: string, files: string[]): Violation[] {
  if (files.length === 0) return [];
  const run = spawnSync(process.execPath, [tscPath(), ...FLAGS, ...files], { cwd, encoding: "utf8", timeout: 120_000 });
  if (run.status === 0) return [];

  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  const violations: Violation[] = [];
  for (const line of output.split("\n")) {
    const match = /^(.+?)\((\d+),\d+\): error TS\d+: (.*)$/.exec(line);
    if (!match) continue;
    const file = relative(cwd, resolve(cwd, match[1])).split(sep).join("/");
    // 生成物や依存の中のエラーではなく、渡したファイルのエラーだけを報告する
    if (file.startsWith("..")) continue;
    violations.push({ file, rule: "type-error", message: `line ${match[2]}: ${match[3]}` });
  }
  if (violations.length === 0) {
    violations.push({ file: ".", rule: "type-error", message: `The type checker failed: ${output.trim().slice(-1500)}` });
  }
  // 1つの誤りから大量に派生することがあるので、先頭だけを返す
  return violations.slice(0, 20);
}

// 仕様のディレクトリを型チェックする。ファイルの選び方は loadSpecs と同じ
export function typecheckSpecs(specsDir: string, options: { drafts?: boolean } = {}): Violation[] {
  const all = (readdirSync(specsDir, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .sort();
  const replaced = new Set(all.filter((file) => file.endsWith(DRAFT_SUFFIX)).map((file) => `${file.slice(0, -DRAFT_SUFFIX.length)}.ts`));
  const files = options.drafts
    ? all.filter((file) => !replaced.has(file))
    : all.filter((file) => !file.endsWith(DRAFT_SUFFIX));
  return typecheck(specsDir, files);
}

export const formatTypeErrors = (violations: Violation[]) =>
  violations.map((v) => `${v.file}: ${v.message}`).join("\n");
