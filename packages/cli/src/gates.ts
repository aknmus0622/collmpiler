import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import type { Dirent } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, relative, sep } from "node:path";
import { isSource, label, sourceFiles } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import { assetsFor } from "./assets.ts";
import type { Asset } from "./assets.ts";
import type { Violation } from "./check.ts";
import { stableStringify } from "./extract.ts";
import { FILES, TEST_DIR } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { decisionValues, judge } from "./mutation.ts";
import type { MutationStrategy } from "./mutation.ts";
import { ASSETS_DIR, renderRequest } from "./request.ts";
import type { Phase } from "./request.ts";
import type { PbtResult } from "./runtime.ts";
import type { StaticCheckStrategy } from "./static-check.ts";
import type { Target } from "./target.ts";

// Strategy の前後に置くゲート。エージェントの隔離はここで成立させる。
//   入口ゲート: リポジトリの外に作業場所を作り、その段階に許可した入力だけを置く
//   出口ゲート: その段階に許可した出力だけを取り出し、その段階の検査にかける
//
// 作業場所は、出力先の配置 (layout.ts) をそのまま写す。依頼文と添付資料だけは、常に aac/ に置く。
//
// 段階ごとに、見せるものと書かせるものが違う (TDD の流れ):
//   design         … 見せる: IR                    書かせる: 本番コード (骨組み)  検査: 読み込めること
//   wiring         … 見せる: 契約、骨組み            書かせる: アダプター       検査: PBT が未実装で失敗すること (赤)
//   implementation … 見せる: IR、骨組み              書かせる: 本番コード (中身)    検査: PBT 合格 (緑)、ミューテーション
// 配線の段階は IR を見ないので、アダプターに業務上の判断を書きようがない。
// 設計と実装の段階はテストの口を見ないので、本番コードがその形に引きずられない。
// 仕様のソース・PBT のグルー (verify.ts)・リポジトリのパスは、どの段階にも渡さない。

export type GateContext = {
  // 対象言語。テスト側の生成・検査・テストの実行など、言語に依存する処理はすべてここを通す
  target: Target;
  ir: Ir;
  specsDir: string;
  // 出力先の配置: 本番コードとテスト側のファイルの場所
  ws: Workspace;
  seed: number;
  runs: number;
  // 依頼文に載せる既定の設計方針
  guide: string;
  // プロジェクトが依頼に添付する資料
  assets: Asset[];
  // true なら、人がまだ確認していない結び付けの下書きを正解として使う
  drafts: boolean;
  // undefined ならミューテーションのゲートを省く
  mutation: MutationStrategy | undefined;
  // 実装の静的検査。undefined なら省く（動的型の言語など）
  staticCheck: StaticCheckStrategy | undefined;
  // true なら、すでにある本番コードを仕様の変更に合わせて直す（追加要件）。false なら、何も無いところから作る。
  // 段階の進み方は同じで、依頼の文面と、赤の確認の基準が変わる
  incremental: boolean;
  // 設計の段階を始める前の本番コードの文面。そこにすでにあった仕様の文は、設計の段階が持ち込んだものではない
  baseline: string;
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
  | { kind: "mutation"; violations: Violation[] }
  // 配線の段階: 「未実装で失敗する」はずの PBT が、そうならなかった
  | { kind: "red"; message: string };

export type Sandbox = {
  dir: string;
  phase: Phase;
  env: NodeJS.ProcessEnv;
  // 作業場所に置いたファイル (相対パス → 内容)。隔離の証跡でもある
  inputs: Record<string, string>;
};

const REQUEST = `${TEST_DIR}/${FILES.request}`;
const posix = (path: string) => path.split(sep).join("/");
const isInside = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

// その段階でエージェントが書いてよい場所
const writable = (ws: Workspace, phase: Phase, rel: string) => (phase === "wiring" ? rel === ws.paths.adapter : isSource(ws, rel));

function filesUnder(root: string): { rel: string; entry: Dirent }[] {
  if (!existsSync(root)) return [];
  return (readdirSync(root, { recursive: true, withFileTypes: true }) as Dirent[])
    .filter((entry) => !entry.isDirectory())
    .map((entry) => ({ rel: posix(relative(root, join(entry.parentPath, entry.name))), entry }))
    .sort((a, b) => (a.rel < b.rel ? -1 : 1));
}

export function entryGate(ctx: GateContext, phase: Phase, attempt: number, feedback: Feedback | undefined): Sandbox {
  const { ws } = ctx;
  const hidden = [...new Set([process.cwd(), ctx.specsDir, ws.root])];
  const dir = mkdtempSync(join(realpathSync(tmpdir()), "aac-"));
  if (hidden.some((path) => isInside(path, dir))) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`入口ゲート: 一時ディレクトリ ${dir} がリポジトリの内側にあるため隔離できません`);
  }

  // 許可リスト。段階ごとに違う
  const assets = assetsFor(ctx.assets, phase);
  const inputs: Record<string, string> = {
    [REQUEST]: renderRequest(ctx.target, ws, phase, attempt, feedback, ctx.guide, assets, { incremental: ctx.incremental }),
  };
  for (const asset of assets) if (asset.kind === "file") inputs[`${ASSETS_DIR}/${asset.name}`] = asset.content;
  if (phase === "wiring") {
    inputs[ws.paths.contract] = ctx.target.generate.contract(ctx.ir);
    inputs[ws.paths.adapter] = existsSync(join(ws.root, ws.paths.adapter))
      ? readFileSync(join(ws.root, ws.paths.adapter), "utf8")
      : ctx.target.generate.adapterSkeleton(ws);
  } else {
    inputs[ws.paths.ir] = stableStringify(ctx.ir);
  }
  // 本番コード: 設計の段階ではやり直しのときの前回の成果、以降の段階では骨組み
  for (const rel of sourceFiles(ws)) inputs[rel] = readFileSync(join(ws.root, rel), "utf8");

  for (const [rel, content] of Object.entries(inputs)) {
    const leaked = hidden.find((path) => content.includes(path));
    if (leaked) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`入口ゲート: ${rel} にリポジトリのパス (${leaked}) が含まれています`);
    }
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), content);
  }
  mkdirSync(join(dir, ws.src), { recursive: true });

  return { dir, phase, inputs, env: scrubEnv(process.env, hidden) };
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

const scrub = (ctx: GateContext, text: string) =>
  [ctx.ws.root, ctx.specsDir, process.cwd()].reduce((result, path) => result.split(path).join("."), text);

// PBT を実行する。どう実行するかは対象言語が決める
function runVerify(ctx: GateContext): { result?: PbtResult; crash?: string } {
  const { result, crash } = ctx.target.runTests({ ws: ctx.ws, seed: ctx.seed, runs: ctx.runs, drafts: ctx.drafts });
  // 出力に含まれるリポジトリのパスを、差し戻しに載せない
  return result ? { result } : { crash: scrub(ctx, crash ?? "") };
}

// 仕様に自然言語で書かれた文（条件・コマンドの説明・計算の式・不変条件）が、骨組みにそのまま書き写されていないか。
// 言い換えまでは検出できない
// 設計の段階を始める前からあった文は対象外（この段階が持ち込んだものだけを見る）
function specSentencesIn(ctx: GateContext, files: string[]): Violation[] {
  const existing = ctx.baseline;
  const { ir } = ctx;
  const sentences = new Set<string>([
    ...Object.values(ir.decisions).flatMap((decision) => Object.keys(decision.rows)),
    ...ir.behaviors.flatMap((behavior) => [
      ...behavior.onlyIf,
      ...Object.keys(behavior.when),
      ...Object.values(behavior.when).flatMap((outcome) => (outcome.does ? [outcome.does] : [])),
    ]),
    ...Object.values(ir.model?.calculations ?? {}).map((calculation) => calculation.is),
    ...(ir.model?.invariants ?? []),
  ]);
  sentences.delete("otherwise");
  const violations: Violation[] = [];
  for (const rel of files) {
    const text = readFileSync(join(ctx.ws.root, rel), "utf8");
    for (const sentence of sentences) {
      if (text.includes(sentence) && !existing.includes(sentence)) {
        violations.push({
          file: rel,
          rule: "spec-text-in-skeleton",
          message: `The skeleton quotes the specification: "${sentence}". Comments must explain how to use each member, not restate business rules; the next step must be doable without knowing them.`,
        });
      }
    }
  }
  return violations;
}

export type GateResult = {
  feedback?: Feedback;
  mutation?: MutationSummary;
  // 実行した静的検査の Strategy の名前（結果に記録する）
  staticCheck?: string;
};

export async function exitGate(ctx: GateContext, sandbox: Sandbox): Promise<GateResult> {
  const { phase } = sandbox;
  const { ws } = ctx;
  const ADAPTER = ws.paths.adapter;
  const violations: Violation[] = [];
  const outputs: string[] = [];

  // 1. 作業場所の監査: 取り出すのは、その段階で書いてよい場所だけ。それ以外の変化は違反
  const found = new Set<string>();
  for (const { rel, entry } of filesUnder(sandbox.dir)) {
    found.add(rel);
    if (rel.startsWith(".") || rel === REQUEST) continue;
    if (!entry.isFile()) {
      violations.push({ file: rel, rule: "unexpected-file", message: "Only regular files are allowed (no symlinks)." });
    } else if (writable(ws, phase, rel)) {
      outputs.push(rel);
    } else if (!(rel in sandbox.inputs)) {
      violations.push({ file: rel, rule: "unexpected-file", message: "This step may not create files here." });
    } else if (readFileSync(join(sandbox.dir, rel), "utf8") !== sandbox.inputs[rel]) {
      violations.push({ file: rel, rule: "read-only-file-modified", message: "This step may not edit this file." });
    }
  }
  for (const rel of Object.keys(sandbox.inputs)) {
    if (rel !== REQUEST && !writable(ws, phase, rel) && !found.has(rel)) {
      violations.push({ file: rel, rule: "read-only-file-modified", message: "This step may not remove this file." });
    }
  }

  // 2. 取り出し: その段階の出力で、出力先を置き換える
  // (本番コードは1ファイルずつ消す。同じ場所にテスト側のファイルが並んでいることがあるため)
  for (const rel of phase === "wiring" ? [ADAPTER] : sourceFiles(ws)) rmSync(join(ws.root, rel), { force: true });
  for (const rel of outputs) {
    mkdirSync(dirname(join(ws.root, rel)), { recursive: true });
    cpSync(join(sandbox.dir, rel), join(ws.root, rel));
  }

  return judgeOutput(ctx, phase, violations, outputs);
}

// 仕様が変わったあと、エージェントを呼ぶ前に、いまの本番コードとアダプターをそのまま採点する。
// 合格なら何もすることが無い。不合格なら、その内容が実装の段階の最初の依頼に載る（実装の前に落ちることの確認 = 赤）
export async function verifyGate(ctx: GateContext): Promise<GateResult> {
  return judgeOutput(ctx, "implementation", [], sourceFiles(ctx.ws));
}

// 出力先にあるものを、その段階の基準で採点する
async function judgeOutput(
  ctx: GateContext,
  phase: Phase,
  violations: Violation[],
  outputs: string[],
): Promise<GateResult> {
  const { target, ws } = ctx;
  const ADAPTER = ws.paths.adapter;

  // 3. 採点基準 (生成ファイル) は出力先にだけ置く。verify.ts は仕様の場所を知っているので作業場所には渡さない
  mkdirSync(dirname(join(ws.root, ws.paths.ir)), { recursive: true });
  writeFileSync(join(ws.root, ws.paths.ir), stableStringify(ctx.ir));
  writeFileSync(join(ws.root, ws.paths.contract), target.generate.contract(ctx.ir));
  writeFileSync(join(ws.root, ws.paths.verify), target.generate.verify(ctx.ir, ws, ctx.specsDir));

  // 4. 余計なもの検査 (設計の段階ではアダプターがまだ無いので、本番コードだけを見る)
  violations.push(...target.check(ws, ctx.ir, ctx.specsDir, phase === "design" ? "source" : "all"));
  if (violations.length > 0) return { feedback: { kind: "check", violations } };

  // 5. 静的検査 (Strategy)。設計の段階は本番コードだけ、以降はアダプターと契約も含める。
  //    何を対象にし、誤りをどう伝えるかはここで決める。Strategy は誤りの一覧を返すだけ
  // これ以降の結果には、実行した静的検査の名前を載せる
  const ran = ctx.staticCheck ? { staticCheck: ctx.staticCheck.name } : {};
  if (ctx.staticCheck) {
    const sources = sourceFiles(ws);
    const files = phase === "design" ? sources : [...sources, ADAPTER, ws.paths.contract];
    const found = (await ctx.staticCheck.check({ dir: ws.root, files })).map((violation) =>
      // 実装の段階はアダプターを見られない。アダプター側の誤りは、
      // 「公開している名前かシグネチャを変えた」ことの現れなので、そう伝える
      phase === "implementation" && violation.file === ADAPTER
        ? {
            ...violation,
            file: ws.src || ".",
            message: `The test harness no longer fits your code, which means an exported name or signature was changed. Restore it. (${violation.message})`,
          }
        : violation,
    );
    if (found.length > 0) return { ...ran, feedback: { kind: "check", violations: found } };
  }

  // 6. 段階ごとの検査
  if (phase === "design") {
    // 骨組みは配線の段階に渡る。仕様の文がそのまま書かれていると、IR を見せない意味が薄れる
    const leaked = specSentencesIn(ctx, outputs);
    if (leaked.length > 0) return { ...ran, feedback: { kind: "check", violations: leaked } };
    const failure = target.load(ws);
    return failure === undefined ? { ...ran } : { ...ran, feedback: { kind: "crash", output: scrub(ctx, failure) } };
  }

  // PBT (別プロセス)
  const { result, crash } = runVerify(ctx);
  if (!result) return { ...ran, feedback: { kind: "crash", output: crash ?? "" } };
  // 仕様やハーネス側の問題は実装の誤りではないので、エージェントに差し戻さずに止める
  if (result.status === "error") throw new Error(`PBT を実行できませんでした: ${result.message}`);

  if (phase === "wiring") {
    // 赤: 本番コードに未実装の部分が残っているなら、PBT は合格してはならない
    // （アダプターが振る舞いを肩代わりしているか、未実装の部分を呼んでいない）。
    // 未実装の部分が無いとき（仕様の変更が、すでにあるコードで満たされている）は、合格してよい
    const unimplemented = sourceFiles(ws).some((rel) => readFileSync(join(ws.root, rel), "utf8").includes(target.notImplemented));
    if (result.status === "pass") {
      if (!unimplemented) return { ...ran };
      return {
        feedback: {
          kind: "red",
          message:
            "The tests pass although the production code is not implemented. The adapter must not implement any behaviour; it only connects the production code to the harness.",
        },
      };
    }
    const error = "error" in result.actual ? result.actual.error : undefined;
    if (error !== undefined && !error.includes(target.notImplemented)) {
      return {
        feedback: {
          kind: "red",
          message: `The tests failed because of an error in the adapter, before reaching unimplemented production code: ${error}`,
        },
      };
    }
    return { ...ran };
  }

  // 緑: 合格しなければならない
  if (result.status !== "pass") return { ...ran, feedback: { kind: "pbt", result } };

  // ミューテーション: 本番コードを壊して PBT が落ちることを確かめる。合否の基準はゲート (judge) が持つ
  if (!ctx.mutation) return { ...ran };
  const values = decisionValues(ctx.ir);
  const report = await ctx.mutation.run({
    root: ws.root,
    files: sourceFiles(ws),
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
  const survived = judge(report, values, readFileSync(join(ws.root, ADAPTER), "utf8"), ADAPTER, label(ws.src));
  return survived.length > 0
    ? { ...ran, feedback: { kind: "mutation", violations: survived }, mutation }
    : { ...ran, mutation };
}
