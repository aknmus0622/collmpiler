import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, sep } from "node:path";
import { checkWorkspace } from "./check.ts";
import type { Violation } from "./check.ts";
import { stableStringify } from "./extract.ts";
import { FILES, SOURCE_DIR, TEST_DIR, generateAdapterSkeleton, generateContract, generateVerify } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { decisionValues, judge } from "./mutation.ts";
import type { MutationStrategy } from "./mutation.ts";
import { renderRequest } from "./request.ts";
import { RESULT_PREFIX } from "./runtime.ts";
import type { PbtResult } from "./runtime.ts";

// Strategy の前後に置くゲート。エージェントの隔離はここで成立させる。
//   入口ゲート: リポジトリの外に作業場所を作り、許可した入力だけを置く
//   出口ゲート: 許可した出力だけを取り出し、余計なもの検査と PBT にかける
// 仕様のソース・PBT のグルー (verify.ts)・リポジトリのパスは、作業場所に一切渡さない。

export type GateContext = {
  ir: Ir;
  specsDir: string;
  outDir: string;
  seed: number;
  runs: number;
  // 依頼文に載せる設計方針
  guide: string;
  // undefined ならミューテーションのゲートを省く
  mutation: MutationStrategy | undefined;
};

// どの Strategy で何個壊し、何個検出したか（毎回結果に記録する）
export type MutationSummary = {
  strategy: string;
  mutants: number;
  killed: number;
  // 壊しても PBT が落ちなかった箇所。不合格の理由にならないものも含めて報告する
  survivors: { file: string; line: number; original: string }[];
};

export type Feedback =
  | { kind: "check"; violations: Violation[] }
  | { kind: "pbt"; result: PbtResult }
  | { kind: "crash"; output: string }
  | { kind: "mutation"; violations: Violation[] };

export type Sandbox = {
  dir: string;
  env: NodeJS.ProcessEnv;
  // 作業場所に置いたファイル (相対パス → 内容)。隔離の証跡でもある
  inputs: Record<string, string>;
};

const REQUEST = `${TEST_DIR}/${FILES.request}`;
const ADAPTER = `${TEST_DIR}/${FILES.adapter}`;
const posix = (path: string) => path.split(sep).join("/");
const isInside = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

function filesUnder(root: string): { rel: string; entry: Dirent }[] {
  if (!existsSync(root)) return [];
  return (readdirSync(root, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => !entry.isDirectory())
    .map((entry) => ({ rel: posix(relative(root, join(entry.parentPath, entry.name))), entry }))
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

export function entryGate(ctx: GateContext, attempt: number, feedback: Feedback | undefined): Sandbox {
  const hidden = [...new Set([process.cwd(), ctx.specsDir, ctx.outDir])];
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "aac-"));
  if (hidden.some((path) => isInside(path, dir))) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`入口ゲート: 一時ディレクトリ ${dir} がリポジトリの内側にあるため隔離できません`);
  }

  // 許可リスト: IR、アダプターの型、依頼文、アダプター (前回の成果か雛形)、前回の本番コード
  const inputs: Record<string, string> = {
    [`${TEST_DIR}/${FILES.ir}`]: stableStringify(ctx.ir),
    [`${TEST_DIR}/${FILES.contract}`]: generateContract(ctx.ir),
    [REQUEST]: renderRequest(attempt, feedback, ctx.guide),
    [ADAPTER]: existsSync(join(ctx.outDir, ADAPTER))
      ? readFileSync(join(ctx.outDir, ADAPTER), "utf8")
      : generateAdapterSkeleton(),
  };
  for (const { rel, entry } of filesUnder(join(ctx.outDir, SOURCE_DIR))) {
    if (entry.isFile()) inputs[`${SOURCE_DIR}/${rel}`] = readFileSync(join(ctx.outDir, SOURCE_DIR, rel), "utf8");
  }

  for (const [rel, content] of Object.entries(inputs)) {
    const leaked = hidden.find((path) => content.includes(path));
    if (leaked) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`入口ゲート: ${rel} にリポジトリのパス (${leaked}) が含まれています`);
    }
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  mkdirSync(join(dir, SOURCE_DIR), { recursive: true });

  return { dir, inputs, env: scrubEnv(process.env, hidden) };
}

// 環境変数からリポジトリのパスを取り除く (PWD / INIT_CWD / npm_* や PATH 内の node_modules/.bin など)
export function scrubEnv(env: NodeJS.ProcessEnv, hidden: string[]): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined) continue;
    const kept = value.split(delimiter).filter((part) => !hidden.some((path) => part.includes(path)));
    if (kept.length > 0) clean[name] = kept.join(delimiter);
  }
  return clean;
}

function runVerify(ctx: GateContext): { result?: PbtResult; crash?: string } {
  const run = spawnSync(
    process.execPath,
    [join(TEST_DIR, FILES.verify), "--seed", String(ctx.seed), "--runs", String(ctx.runs)],
    { cwd: ctx.outDir, encoding: "utf8", timeout: 120_000 },
  );
  const line = run.stdout?.split("\n").find((text) => text.startsWith(RESULT_PREFIX));
  if (line) return { result: JSON.parse(line.slice(RESULT_PREFIX.length)) as PbtResult };
  const output = `${run.stderr ?? ""}${run.error?.message ?? ""}`.trim().slice(-2000);
  // スタックトレースに含まれるリポジトリのパスを差し戻しに載せない
  return { crash: [ctx.outDir, ctx.specsDir, process.cwd()].reduce((text, path) => text.split(path).join("."), output) };
}

export async function exitGate(
  ctx: GateContext,
  sandbox: Sandbox,
): Promise<{ feedback?: Feedback; mutation?: MutationSummary }> {
  const testDir = join(ctx.outDir, TEST_DIR);
  const violations: Violation[] = [];
  const outputs: string[] = [];

  // 1. 作業場所の監査: 取り出すのは src/ とアダプターだけ。それ以外の変化は違反
  const fixed = [`${TEST_DIR}/${FILES.ir}`, `${TEST_DIR}/${FILES.contract}`];
  const found = new Set<string>();
  for (const { rel, entry } of filesUnder(sandbox.dir)) {
    found.add(rel);
    if (rel.startsWith(".") || rel === REQUEST) continue;
    const isOutput = rel === ADAPTER || rel.startsWith(`${SOURCE_DIR}/`);
    if (!entry.isFile()) {
      violations.push({ file: rel, rule: "unexpected-file", message: "Only regular files are allowed (no symlinks)." });
    } else if (isOutput) {
      outputs.push(rel);
    } else if (!fixed.includes(rel)) {
      violations.push({ file: rel, rule: "unexpected-file", message: `Only ${SOURCE_DIR}/ and ${ADAPTER} may be written.` });
    } else if (readFileSync(join(sandbox.dir, rel), "utf8") !== sandbox.inputs[rel]) {
      violations.push({ file: rel, rule: "generated-file-modified", message: "This file is generated and must not be edited." });
    }
  }
  for (const rel of fixed) {
    if (!found.has(rel)) {
      violations.push({ file: rel, rule: "generated-file-modified", message: "This file is generated and must not be removed." });
    }
  }

  // 2. 取り出し: 出力先の src/ とアダプターを、作業場所のもので置き換える
  rmSync(join(ctx.outDir, SOURCE_DIR), { recursive: true, force: true });
  rmSync(join(ctx.outDir, ADAPTER), { force: true });
  for (const rel of outputs) {
    mkdirSync(dirname(join(ctx.outDir, rel)), { recursive: true });
    cpSync(join(sandbox.dir, rel), join(ctx.outDir, rel));
  }

  // 3. 採点基準 (生成ファイル) は出力先にだけ置く。verify.ts は仕様の場所を知っているので作業場所には渡さない
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, FILES.ir), stableStringify(ctx.ir));
  writeFileSync(join(testDir, FILES.contract), generateContract(ctx.ir));
  writeFileSync(join(testDir, FILES.verify), generateVerify(ctx.ir, testDir, ctx.specsDir));

  // 4. 余計なもの検査
  violations.push(...checkWorkspace(ctx.outDir, ctx.ir, ctx.specsDir));
  if (violations.length > 0) return { feedback: { kind: "check", violations } };

  // 5. PBT (別プロセス。LLM が書いたコードはここで初めて実行される)
  const { result, crash } = runVerify(ctx);
  if (!result) return { feedback: { kind: "crash", output: crash ?? "" } };
  // 仕様やハーネス側の問題は実装の誤りではないので、エージェントに差し戻さずに止める
  if (result.status === "error") throw new Error(`PBT を実行できませんでした: ${result.message}`);
  if (result.status !== "pass") return { feedback: { kind: "pbt", result } };

  // 6. ミューテーション: 本番コードを壊して PBT が落ちることを確かめる。合否の基準はゲート (judge) が持つ
  if (!ctx.mutation) return {};
  const values = decisionValues(ctx.ir);
  const report = await ctx.mutation.run({
    sourceDir: join(ctx.outDir, SOURCE_DIR),
    values,
    test: () => runVerify(ctx).result?.status === "pass",
  });
  const mutation = {
    strategy: report.strategy,
    mutants: report.mutants.length,
    killed: report.mutants.filter((mutant) => mutant.killed).length,
    survivors: report.mutants
      .filter((mutant) => !mutant.killed)
      .map(({ file, line, original }) => ({ file, line, original })),
  };
  const survived = judge(report, values, readFileSync(join(ctx.outDir, ADAPTER), "utf8"));
  return survived.length > 0 ? { feedback: { kind: "mutation", violations: survived }, mutation } : { mutation };
}
