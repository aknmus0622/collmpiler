import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { extract, stableStringify } from "./extract.ts";
import { entryGate, exitGate } from "./gates.ts";
import type { Feedback, GateContext, MutationSummary } from "./gates.ts";
import { FILES, SOURCE_DIR, TEST_DIR, requireModel, specHash } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { DEFAULT_GUIDE } from "./guide.ts";
import { loadSpecs } from "./loader.ts";
import { builtinMutation } from "./mutation.ts";
import type { MutationStrategy } from "./mutation.ts";
import { PHASES } from "./request.ts";
import type { Phase } from "./request.ts";
import { selfCheck } from "./runtime.ts";
import type { ImplementationStrategy } from "./strategy.ts";

// 仕様 → IR → TDD の3段階 (設計 → 配線 → 実装)。
// 各段階は [入口ゲート → Strategy (エージェント) → 出口ゲート] で、段階ごとに別のセッションとして起動する。
// 出口ゲートで落ちたら、その内容を同じ段階の次の依頼文に載せて差し戻す。
// ある段階が上限回数まで直らなければ、最初の段階からやり直す（原因がどの段階にあるかは機械的に分からないため）。

export type ImplementOptions = {
  specs: string;
  out: string;
  strategy: ImplementationStrategy;
  // 1つの段階の中で差し戻す回数の上限
  maxAttempts?: number;
  // 最初の段階からやり直す回数の上限（最初の1周を含む）
  maxRounds?: number;
  runs?: number;
  // 依頼文に載せる設計方針。省略時は既定の方針
  guide?: string;
  // ミューテーションのゲートの Strategy。省略時は自前、null で無効
  mutation?: MutationStrategy | null;
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
  mutation?: MutationSummary;
  feedback?: Feedback;
};

export async function implement(options: ImplementOptions) {
  const specsDir = resolve(process.cwd(), options.specs);
  const outDir = resolve(process.cwd(), options.out);
  const log = options.log ?? (() => {});

  const spec = await loadSpecs(specsDir);
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
    throw new Error(`仕様に誤りがあります: ${checked.message}\n  再現するアクション列: ${JSON.stringify(checked.steps)}`);
  }

  // 検証を決定的にするため、シードは仕様のハッシュから決める
  const seed = Number.parseInt(specHash(ir).slice("sha256:".length, "sha256:".length + 7), 16);
  const ctx: GateContext = {
    ir,
    specsDir,
    outDir,
    seed,
    runs: options.runs ?? 200,
    guide: options.guide ?? DEFAULT_GUIDE,
    mutation: options.mutation === null ? undefined : (options.mutation ?? builtinMutation),
  };

  const clear = () => {
    rmSync(join(outDir, SOURCE_DIR), { recursive: true, force: true });
    rmSync(join(outDir, TEST_DIR, FILES.adapter), { force: true });
  };
  if (options.fresh) clear();
  const built = existsSync(join(outDir, SOURCE_DIR)) && existsSync(join(outDir, TEST_DIR, FILES.adapter));
  const first: Phase = options.fresh ? "design" : (options.from ?? (built ? "implementation" : "design"));

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
        try {
          log(`[${round}] ${phase} #${attempt}: ${options.strategy.name} (in ${sandbox.dir})`);
          await options.strategy.run({ dir: sandbox.dir, phase, attempt, env: sandbox.env });
          ({ feedback, mutation } = await exitGate(ctx, sandbox));
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
          ...(mutation ? { mutation } : {}),
          ...(feedback ? { feedback } : {}),
        });
      }
      if (!passed) {
        log(`[${round}] ${phase}: 上限回数まで直りませんでした`);
        continue rounds;
      }
    }
    return { status: "pass" as const, attempts, seed };
  }
  return { status: "fail" as const, attempts, seed };
}

function describe(phase: Phase, feedback: Feedback | undefined): string {
  if (!feedback) return phase === "wiring" ? "ok (tests fail as expected: not implemented)" : phase === "design" ? "ok" : "pass";
  if (feedback.kind === "check" || feedback.kind === "mutation") {
    return `rejected (${[...new Set(feedback.violations.map((v) => v.rule))].join(", ")})`;
  }
  if (feedback.kind === "red") return "rejected (tests did not fail for the expected reason)";
  return feedback.kind === "pbt" ? `pbt ${feedback.result.status}` : "crashed";
}
