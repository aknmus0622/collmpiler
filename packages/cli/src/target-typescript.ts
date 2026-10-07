import { spawnSync } from "node:child_process";
import { checkWorkspace } from "./check.ts";
import { TS_FILES, generateAdapterSkeleton, generateContract, generateVerify } from "./generate.ts";
import { dirFrom, importPath, label, sourceFiles } from "./layout.ts";
import { builtinMutation } from "./mutation.ts";
import { RESULT_PREFIX } from "./runtime.ts";
import type { PbtResult } from "./runtime.ts";
import { tscStaticCheck } from "./static-check.ts";
import type { Target } from "./target.ts";

// TypeScript を対象言語とするときの実装。
// 本番コードは Node がそのまま実行できる TypeScript で、PBT は期待値の計算と同じプロセスで本番システムを動かす
// (生成した verify.ts が、アダプターを import して @clp/cli/runtime に渡す)。

const NOT_IMPLEMENTED = "not implemented";

const outputOf = (run: { stdout?: string | null; stderr?: string | null; error?: Error }) =>
  `${run.stderr ?? ""}${run.error?.message ?? ""}`.trim().slice(-2000);

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
  runTests({ ws, seed, runs, drafts }) {
    const run = spawnSync(
      process.execPath,
      [ws.paths.verify, "--seed", String(seed), "--runs", String(runs), ...(drafts ? ["--drafts"] : [])],
      { cwd: ws.root, encoding: "utf8", timeout: 120_000 },
    );
    const line = run.stdout?.split("\n").find((text) => text.startsWith(RESULT_PREFIX));
    return line ? { result: JSON.parse(line.slice(RESULT_PREFIX.length)) as PbtResult } : { crash: outputOf(run) };
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
