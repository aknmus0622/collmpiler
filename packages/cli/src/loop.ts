import { rmSync } from "node:fs";
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
import { selfCheck } from "./runtime.ts";
import type { ImplementationStrategy } from "./strategy.ts";

// 仕様 → IR → [入口ゲート → Strategy (エージェントが実装) → 出口ゲート] のループ。
// 出口ゲートで落ちたら、その内容を次の入口ゲートが依頼文に載せて差し戻す。

export type ImplementOptions = {
  specs: string;
  out: string;
  strategy: ImplementationStrategy;
  maxAttempts?: number;
  runs?: number;
  // 依頼文に載せる設計方針。省略時は既定の方針
  guide?: string;
  // ミューテーションのゲートの Strategy。省略時は自前、null で無効
  mutation?: MutationStrategy | null;
  // true なら出力先の既存の本番コードとアダプターを捨てて、雛形から始める
  fresh?: boolean;
  // true なら作業場所を消さずに残す (調査用)
  keepSandbox?: boolean;
  log?: (line: string) => void;
};

export type Attempt = {
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

  if (options.fresh) {
    rmSync(join(outDir, SOURCE_DIR), { recursive: true, force: true });
    rmSync(join(outDir, TEST_DIR, FILES.adapter), { force: true });
  }

  const attempts: Attempt[] = [];
  let feedback: Feedback | undefined;

  for (let attempt = 1; attempt <= (options.maxAttempts ?? 3); attempt++) {
    const sandbox = entryGate(ctx, attempt, feedback);
    let mutation: MutationSummary | undefined;
    try {
      log(`[${attempt}] strategy: ${options.strategy.name} (in ${sandbox.dir})`);
      await options.strategy.run({ dir: sandbox.dir, attempt, env: sandbox.env });
      ({ feedback, mutation } = await exitGate(ctx, sandbox));
    } finally {
      if (!options.keepSandbox) rmSync(sandbox.dir, { recursive: true, force: true });
    }

    log(`[${attempt}] exit gate: ${describe(feedback)}${mutation ? ` (mutation: ${mutation.strategy}, ${mutation.killed}/${mutation.mutants} killed)` : ""}`);
    attempts.push({
      attempt,
      ok: feedback === undefined,
      inputs: Object.keys(sandbox.inputs).sort(),
      ...(options.keepSandbox ? { sandbox: sandbox.dir } : {}),
      ...(mutation ? { mutation } : {}),
      ...(feedback ? { feedback } : {}),
    });
    if (!feedback) return { status: "pass" as const, attempts, seed };
  }
  return { status: "fail" as const, attempts, seed };
}

function describe(feedback: Feedback | undefined): string {
  if (!feedback) return "pass";
  if (feedback.kind === "check" || feedback.kind === "mutation") {
    return `rejected (${[...new Set(feedback.violations.map((v) => v.rule))].join(", ")})`;
  }
  return feedback.kind === "pbt" ? `pbt ${feedback.result.status}` : "crashed";
}
