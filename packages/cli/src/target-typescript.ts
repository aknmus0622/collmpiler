import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkspace } from "./check.ts";
import { TS_FILES, generateAdapterSkeleton, generateContract, generateVerify } from "./generate.ts";
import { dirFrom, importPath, isSource, label, sourceFiles } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import { builtinMutation } from "./mutation.ts";
import { RESULT_PREFIX } from "./runtime.ts";
import type { PbtResult } from "./runtime.ts";
import { tscStaticCheck } from "./static-check.ts";
import { scan } from "./scan.ts";
import type { Target, Usage } from "./target.ts";

// TypeScript を対象言語とするときの実装。
// 本番コードは Node がそのまま実行できる TypeScript で、PBT は期待値の計算と同じプロセスで本番システムを動かす
// (生成した verify.ts が、アダプターを import して @clp/cli/runtime に渡す)。

const NOT_IMPLEMENTED = "not implemented";

const outputOf = (run: { stdout?: string | null; stderr?: string | null; error?: Error }) =>
  `${run.stderr ?? ""}${run.error?.message ?? ""}`.trim().slice(-2000);

// V8 が記録した実行範囲 (NODE_V8_COVERAGE) から、本番コードのどこを実行したかを読む。
// Node は型を空白に置き換えて実行するので、位置は元のソースと一致する
type V8Range = { startOffset: number; endOffset: number; count: number };
type V8Function = { functionName: string; ranges: V8Range[] };
function usageFrom(dir: string, ws: Workspace): Usage {
  const root = realpathSync(ws.root);
  const scripts = new Map<string, V8Function[]>();
  for (const name of readdirSync(dir)) {
    const report = JSON.parse(readFileSync(join(dir, name), "utf8")) as { result?: { url: string; functions: V8Function[] }[] };
    for (const script of report.result ?? []) {
      if (!script.url.startsWith("file://")) continue;
      const rel = relative(root, fileURLToPath(script.url)).split(sep).join("/");
      if (rel.startsWith("..") || !isSource(ws, rel)) continue;
      scripts.set(rel, [...(scripts.get(rel) ?? []), ...script.functions]);
    }
  }
  const size = (range: V8Range) => range.endOffset - range.startOffset;
  const uses = (file: string) => {
    const functions = scripts.get(file);
    if (!functions || functions.length === 0) return false;
    // いちばん外側（モジュールそのもの）は、読み込んだだけで実行される。使っていると言えるのは、
    // その中の関数を呼んだとき。関数を持たないファイル（値や再エクスポートだけ）は、読み込みで使ったとみなす
    const module = functions.reduce((widest, fn) => (size(fn.ranges[0]) > size(widest.ranges[0]) ? fn : widest));
    const inner = functions.filter((fn) => fn !== module);
    return inner.length === 0 ? module.ranges[0].count > 0 : inner.some((fn) => fn.ranges[0].count > 0);
  };
  return {
    uses,
    executed(file, offset) {
      if (!uses(file)) return false;
      // その位置を含む、いちばん内側の範囲の実行回数
      let innermost: V8Range | undefined;
      for (const fn of scripts.get(file) ?? []) {
        for (const range of fn.ranges) {
          if (range.startOffset <= offset && offset < range.endOffset && (!innermost || size(range) < size(innermost))) innermost = range;
        }
      }
      return (innermost?.count ?? 0) > 0;
    },
  };
}

export const typescriptTarget: Target = {
  name: "typescript",

  files: TS_FILES,
  generate: { contract: generateContract, adapterSkeleton: generateAdapterSkeleton, verify: generateVerify },

  check: checkWorkspace,
  staticCheck: tscStaticCheck,
  mutation: builtinMutation,

  // 本番コードの全ファイルを1回 import する
  load(ws) {
    const files = sourceFiles(ws)
      .filter((rel) => rel.endsWith(".ts"))
      .map((rel) => `./${rel}`);
    const run = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", "for (const file of JSON.parse(process.argv[1])) await import(file);", JSON.stringify(files)],
      { cwd: ws.root, encoding: "utf8", timeout: 60_000 },
    );
    return run.status === 0 ? undefined : outputOf(run);
  },

  // 生成した verify.ts を別プロセスで実行し、最後に出力される結果の行を読む
  runTests({ ws, seed, runs, drafts, usage }) {
    const coverage = usage ? mkdtempSync(join(realpathSync(tmpdir()), "clp-coverage-")) : undefined;
    try {
      const run = spawnSync(
        process.execPath,
        [ws.paths.verify, "--seed", String(seed), "--runs", String(runs), ...(drafts ? ["--drafts"] : [])],
        { cwd: ws.root, encoding: "utf8", timeout: 120_000, env: coverage ? { ...process.env, NODE_V8_COVERAGE: coverage } : process.env },
      );
      const line = run.stdout?.split("\n").find((text) => text.startsWith(RESULT_PREFIX));
      if (!line) return { crash: outputOf(run) };
      return { result: JSON.parse(line.slice(RESULT_PREFIX.length)) as PbtResult, ...(coverage ? { usage: usageFrom(coverage, ws) } : {}) };
    } finally {
      if (coverage) rmSync(coverage, { recursive: true, force: true });
    }
  },

  // 型を取り除くと何も残らないファイル（型だけ、コメントだけ）
  inert(ws, rel) {
    if (!rel.endsWith(".ts")) return false;
    try {
      return scan(stripTypeScriptTypes(readFileSync(join(ws.root, rel), "utf8"), { mode: "strip" })).length === 0;
    } catch {
      return false;
    }
  },

  notImplemented: NOT_IMPLEMENTED,
  request: (ws) => ({
    sourceRules: `- Production code is plain TypeScript that Node can run directly (erasable syntax only: no \`enum\`, no
  \`namespace\`, no parameter properties; relative imports need the \`.ts\` extension).
- Production code may import only other production files under \`${label(ws.src)}\`, by relative path. No
  packages, no \`node:\` built-ins, no \`import()\` / \`require()\`.`,
    skeletonBody: `throw new Error("${NOT_IMPLEMENTED}");`,
    adapterGuide: `- \`setupIsolation(ports)\`: build a fresh production system in its initial state, giving it dependencies that
  forward to \`ports\`. Where the production code expects a value in a different form than \`ports\` provides (a
  date instead of a flag, a differently named result), translate here.
- \`executeCommand(command)\`: call the production code for that command with its input.
- \`getCurrentState()\`: return the current state as one of the \`StateName\` values, translating if the
  production code names its states differently.
- \`teardownIsolation()\`: discard the system.`,
    adapterImports: `The adapter may import only \`${importPath(ws.paths.adapter, ws.paths.contract)}\` and production files under \`${dirFrom(ws.paths.adapter, ws.src)}\`.`,
    signatureErrorExample: `"x is not a function"`,
  }),
};

export function selectTarget(name: string): Target {
  if (name === "typescript") return typescriptTarget;
  throw new Error(`未知の対象言語: ${name} (いまは typescript だけです)`);
}
