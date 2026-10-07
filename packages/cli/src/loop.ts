import { existsSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveLayout, sourceFiles, workspaceOf } from "./layout.ts";
import { extract, stableStringify } from "./extract.ts";
import { mergeAssets } from "./assets.ts";
import type { Asset } from "./assets.ts";
import { entryGate, exitGate } from "./gates.ts";
import type { Feedback, GateContext, MutationSummary } from "./gates.ts";
import { requireModel, specHash } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { DEFAULT_GUIDE } from "./guide.ts";
import { DRAFT_SUFFIX, loadSpecs } from "./loader.ts";
import type { MutationStrategy } from "./mutation.ts";
import { PHASES } from "./request.ts";
import type { Phase } from "./request.ts";
import { selfCheck } from "./runtime.ts";
import type { StaticCheckStrategy } from "./static-check.ts";
import type { ImplementationStrategy } from "./strategy.ts";
import { typescriptTarget } from "./target-typescript.ts";
import type { Target } from "./target.ts";
import { formatTypeErrors, typecheckSpecs } from "./typecheck.ts";

// 仕様 → IR → TDD の3段階 (設計 → 配線 → 実装)。対象言語を知らない、型どおりの流れ。
// 言語に依存する処理は、すべて Target (target.ts) を通す。
// 各段階は [入口ゲート → Strategy (エージェント) → 出口ゲート] で、段階ごとに別のセッションとして起動する。
// 出口ゲートで落ちたら、その内容を同じ段階の次の依頼文に載せて差し戻す。
// ある段階が上限回数まで直らなければ、最初の段階からやり直す（原因がどの段階にあるかは機械的に分からないため）。

// 既定の試行回数。しきい値にちょうど当たる値で特定の状態まで進む、といった狭い場合を、
// シードによらず踏めるだけの回数にしている（200回では、例の仕様のしきい値を踏まないシードが2割ほどあった）
const DEFAULT_RUNS = 1000;

export type ImplementOptions = {
  specs: string;
  // 出力先の配置。out だけなら <out>/src と <out>/aac。src / tests で、それぞれの場所を直接指定できる。
  // tests が "." で終わるときは、最後の部分がテスト側のファイル名の接頭辞（"src/order/order.aac." など。
  // 本番コードと同じ場所に並べるときに要る）
  out?: string;
  src?: string;
  tests?: string;
  strategy: ImplementationStrategy;
  // 1つの段階の中で差し戻す回数の上限
  maxAttempts?: number;
  // 最初の段階からやり直す回数の上限（最初の1周を含む）
  maxRounds?: number;
  runs?: number;
  // 依頼に添付する資料（設計方針、用語集など）。コンポーネントの assets に宣言したものに追加される。
  // 既定では設計と実装の段階に渡す
  assets?: Asset[];
  // true なら、人がまだ確認していない結び付けの下書き (*.draft.ts) を正解として使う。
  // 下書きから実装までを人手を挟まずに流すためのもの。結果には oracle: "draft" と記録される
  drafts?: boolean;
  // 対象言語。省略時は TypeScript
  target?: Target;
  // ミューテーションのゲートの Strategy。省略時は対象言語のもの、null で無効
  mutation?: MutationStrategy | null;
  // 実装の静的検査の Strategy。省略時は対象言語のもの、null で無効。
  // 仕様の型チェックはこれとは別で、常に行う
  staticCheck?: StaticCheckStrategy | null;
  // どの段階から始めるか。省略時は、出力先に本番コードとアダプターが無ければ設計から、あれば実装から。
  // 仕様を少し変えただけなら、骨組みと配線はそのままで実装だけやり直せる
  from?: Phase;
  // true なら出力先の既存の本番コードとアダプターを捨てて、設計から始める
  fresh?: boolean;
  // true なら作業場所を消さずに残す (調査用)
  keepSandbox?: boolean;
  log?: (line: string) => void;
};

export type Attempt = {
  round: number;
  phase: Phase;
  attempt: number;
  ok: boolean;
  // エージェントに渡したファイルの一覧 (隔離の証跡)
  inputs: string[];
  sandbox?: string;
  // 実行した静的検査の Strategy の名前
  staticCheck?: string;
  mutation?: MutationSummary;
  feedback?: Feedback;
};

export async function implement(options: ImplementOptions) {
  const specsDir = resolve(process.cwd(), options.specs);
  const log = options.log ?? (() => {});

  const drafts = options.drafts ?? false;
  const typeErrors = typecheckSpecs(specsDir, { drafts });
  if (typeErrors.length > 0) throw new Error(`仕様に型エラーがあります:\n${formatTypeErrors(typeErrors)}`);

  const spec = await loadSpecs(specsDir, { drafts });
  const { ir: extracted, diagnostics } = await extract(spec);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`仕様にエラーがあります:\n${errors.map((d) => `  ${d.behavior}.${d.case}: ${d.message}`).join("\n")}`);
  }
  const ir = JSON.parse(stableStringify(extracted)) as Ir;
  requireModel(ir);

  // 仕様の事前検査。仕様自身の誤りは、エージェントを呼ぶ前に人に報告する
  const checked = await selfCheck(spec, { seed: 1 });
  if (!checked.ok) {
    throw new Error(`仕様に誤りがあります: ${checked.message}\n  再現するコマンド列: ${JSON.stringify(checked.steps)}`);
  }

  // 検証を決定的にするため、シードは仕様のハッシュから決める
  const seed = Number.parseInt(specHash(ir).slice("sha256:".length, "sha256:".length + 7), 16);
  const target = options.target ?? typescriptTarget;
  const ws = workspaceOf(resolveLayout(options), target.files);
  const ctx: GateContext = {
    target,
    ir,
    specsDir,
    ws,
    seed,
    runs: options.runs ?? DEFAULT_RUNS,
    guide: DEFAULT_GUIDE,
    assets: mergeAssets(spec.assets ?? [], options.assets ?? []),
    drafts,
    mutation: options.mutation === null ? undefined : (options.mutation ?? target.mutation),
    staticCheck: options.staticCheck === null ? undefined : (options.staticCheck ?? target.staticCheck),
  };

  const clear = () => {
    for (const rel of [...sourceFiles(ws), ws.paths.adapter]) rmSync(join(ws.root, rel), { force: true });
  };
  if (options.fresh) clear();
  const built = sourceFiles(ws).length > 0 && existsSync(join(ws.root, ws.paths.adapter));
  const first: Phase = options.fresh ? "design" : (options.from ?? (built ? "implementation" : "design"));

  // 正解 (結び付け) が人の確認を経たものか、下書きのままか
  const usesDraft = drafts && (readdirSync(specsDir, { recursive: true }) as string[]).some((file) => file.endsWith(DRAFT_SUFFIX));
  const oracle = usesDraft ? ("draft" as const) : ("reviewed" as const);
  if (usesDraft) log("注意: 人が確認していない結び付けの下書きを、正解として使っています");

  const attempts: Attempt[] = [];
  const maxAttempts = options.maxAttempts ?? 3;

  rounds: for (let round = 1; round <= (options.maxRounds ?? 2); round++) {
    // やり直しの周は、前の周の成果を捨てて設計から始める
    if (round > 1) clear();
    const phases = PHASES.slice(round === 1 ? PHASES.indexOf(first) : 0);

    for (const phase of phases) {
      let feedback: Feedback | undefined;
      let passed = false;
      for (let attempt = 1; attempt <= maxAttempts && !passed; attempt++) {
        const sandbox = entryGate(ctx, phase, attempt, feedback);
        let mutation: MutationSummary | undefined;
        let staticCheck: string | undefined;
        try {
          log(`[${round}] ${phase} #${attempt}: ${options.strategy.name} (in ${sandbox.dir})`);
          await options.strategy.run({ dir: sandbox.dir, phase, attempt, env: sandbox.env });
          ({ feedback, mutation, staticCheck } = await exitGate(ctx, sandbox));
        } finally {
          if (!options.keepSandbox) rmSync(sandbox.dir, { recursive: true, force: true });
        }
        passed = feedback === undefined;
        log(`[${round}] ${phase} #${attempt}: ${describe(phase, feedback)}${mutation ? ` (mutation: ${mutation.strategy}, ${mutation.killed}/${mutation.mutants} killed)` : ""}`);
        attempts.push({
          round,
          phase,
          attempt,
          ok: passed,
          inputs: Object.keys(sandbox.inputs).sort(),
          ...(options.keepSandbox ? { sandbox: sandbox.dir } : {}),
          ...(staticCheck ? { staticCheck } : {}),
          ...(mutation ? { mutation } : {}),
          ...(feedback ? { feedback } : {}),
        });
      }
      if (!passed) {
        log(`[${round}] ${phase}: 上限回数まで直りませんでした`);
        continue rounds;
      }
    }
    return { status: "pass" as const, oracle, attempts, seed };
  }
  return { status: "fail" as const, oracle, attempts, seed };
}

function describe(phase: Phase, feedback: Feedback | undefined): string {
  if (!feedback) return phase === "wiring" ? "ok (tests fail as expected: not implemented)" : phase === "design" ? "ok" : "pass";
  if (feedback.kind === "check" || feedback.kind === "mutation") {
    return `rejected (${[...new Set(feedback.violations.map((v) => v.rule))].join(", ")})`;
  }
  if (feedback.kind === "red") return "rejected (tests did not fail for the expected reason)";
  return feedback.kind === "pbt" ? `pbt ${feedback.result.status}` : "crashed";
}
