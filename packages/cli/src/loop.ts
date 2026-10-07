import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveLayout, sourceFiles, workspaceOf } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import { extract, stableStringify } from "./extract.ts";
import { mergeAssets } from "./assets.ts";
import type { Asset } from "./assets.ts";
import { entryGate, exitGate, verifyGate } from "./gates.ts";
import type { Feedback, GateContext, MutationSummary } from "./gates.ts";
import { requireModel, specHash } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { DEFAULT_GUIDE } from "./guide.ts";
import { DRAFT_SUFFIX, listComponents, loadSpecs } from "./loader.ts";
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
// どの段階から動かすかは、出力先の状態で決まる (planOf)。何も無ければ3段階すべて、仕様の値だけが変わったのなら実装だけ。
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
  // 一致させるコンポーネントの名前。省略時は、仕様にあるすべて（名前順）
  component?: string;
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
  // どの段階から始めるか。省略時は、出力先の状態から決める (planOf)
  from?: Phase;
  // true なら出力先の既存の本番コードとアダプターを捨てて、設計から始める
  fresh?: boolean;
  // true なら作業場所を消さずに残す (調査用)
  keepSandbox?: boolean;
  log?: (line: string) => void;
};

export type Attempt = {
  // どのコンポーネントのための試行か
  component: string;
  round: number;
  phase: Phase;
  attempt: number;
  ok: boolean;
  // エージェントに渡したファイルの一覧 (隔離の証跡)。attempt が 0 のものは、エージェントを呼ぶ前の採点
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

  // 仕様にあるコンポーネントをすべて読み、検査する。仕様自身の誤りは、エージェントを呼ぶ前に人に報告する
  const target = options.target ?? typescriptTarget;
  const layout = resolveLayout(options);
  const names = await listComponents(specsDir, { drafts });
  if (names.length === 0) throw new Error("仕様にコンポーネントがありません（component(...) を export してください）");
  if (options.component !== undefined && !names.includes(options.component)) {
    throw new Error(`コンポーネント "${options.component}" がありません (あるのは: ${names.join(", ")})`);
  }
  const units: Unit[] = [];
  for (const name of names) {
    const spec = await loadSpecs(specsDir, { drafts, component: name });
    const { ir: extracted, diagnostics } = extract(spec);
    const errors = diagnostics.filter((d) => d.severity === "error");
    if (errors.length > 0) {
      throw new Error(`仕様 (${name}) にエラーがあります:\n${errors.map((d) => `  ${d.behavior}.${d.case}: ${d.message}`).join("\n")}`);
    }
    const ir = JSON.parse(stableStringify(extracted)) as Ir;
    requireModel(ir);
    const checked = await selfCheck(spec, { seed: 1 });
    if (!checked.ok) {
      throw new Error(`仕様 (${name}) に誤りがあります: ${checked.message}\n  再現するコマンド列: ${JSON.stringify(checked.steps)}`);
    }
    units.push({
      name,
      ir,
      ws: workspaceOf(layout, target.files, name, names),
      // 検証を決定的にするため、シードは仕様のハッシュから決める
      seed: Number.parseInt(specHash(ir).slice("sha256:".length, "sha256:".length + 7), 16),
      assets: spec.assets ?? [],
    });
  }

  // --fresh: 本番コードと、すべてのコンポーネントのアダプター・前回の IR を捨てる（何も無い状態からやり直す）
  if (options.fresh) {
    for (const rel of [...sourceFiles(units[0].ws), ...units.flatMap((unit) => [unit.ws.paths.adapter, unit.ws.paths.ir])]) {
      rmSync(join(layout.root, rel), { force: true });
    }
  }

  // 正解 (結び付け) が人の確認を経たものか、下書きのままか
  const usesDraft = drafts && (readdirSync(specsDir, { recursive: true }) as string[]).some((file) => file.endsWith(DRAFT_SUFFIX));
  const oracle = usesDraft ? ("draft" as const) : ("reviewed" as const);
  if (usesDraft) log("注意: 人が確認していない結び付けの下書きを、正解として使っています");

  // コンポーネントを1つずつ、名前順に一致させる。本番コードは共有なので、2つ目以降は「すでにある本番コードを直す」になる
  const attempts: Attempt[] = [];
  let status: "pass" | "fail" = "pass";
  for (const unit of units.filter((candidate) => options.component === undefined || candidate.name === options.component)) {
    const ctx: GateContext = {
      target,
      ir: unit.ir,
      specsDir,
      ws: unit.ws,
      seed: unit.seed,
      runs: options.runs ?? DEFAULT_RUNS,
      guide: DEFAULT_GUIDE,
      assets: mergeAssets(unit.assets, options.assets ?? []),
      drafts,
      mutation: options.mutation === null ? undefined : (options.mutation ?? target.mutation),
      staticCheck: options.staticCheck === null ? undefined : (options.staticCheck ?? target.staticCheck),
      incremental: false,
      baseline: "",
      others: units.filter((other) => other !== unit).map(({ name, ir, ws, seed }) => ({ name, ir, ws, seed })),
    };
    const tag = units.length > 1 ? `${unit.name} ` : "";
    const passed = await reconcile(ctx, options, attempts, (line) => log(`${tag}${line}`));
    if (!passed) {
      status = "fail";
      break;
    }
  }
  // seed は、最初のコンポーネントのもの（コンポーネントが1つのときの、従来の形）
  return { status, oracle, attempts, seed: units[0].seed, seeds: Object.fromEntries(units.map((unit) => [unit.name, unit.seed])) };
}

type Unit = { name: string; ir: Ir; ws: Workspace; seed: number; assets: Asset[] };

// 1つのコンポーネントについて、仕様・本番コード・アダプターを一致させる
async function reconcile(ctx: GateContext, options: ImplementOptions, attempts: Attempt[], log: (line: string) => void): Promise<boolean> {
  const { ws } = ctx;
  const component = ws.component;
  const clear = () => {
    for (const rel of [...sourceFiles(ws), ws.paths.adapter]) rmSync(join(ws.root, rel), { force: true });
  };

  // 何が変わったかを見て、動かす段階を決める。新規は「本番コードが無い」場合にすぎない
  const plan = planOf(ctx, options.from);
  ctx.incremental = plan.incremental;
  log(`plan: ${plan.phases.join(" → ")} (${plan.reason})`);

  const maxAttempts = options.maxAttempts ?? 3;

  rounds: for (let round = 1; round <= (options.maxRounds ?? 2); round++) {
    // やり直しの周は設計から始める。何も無いところから作ったものは、前の周の成果を捨てる。
    // すでにあった本番コードを直しているときは捨てない（仕様の変更のたびに、全部を書き直すことになるため）
    if (round > 1 && !ctx.incremental) clear();
    const phases = round === 1 ? plan.phases : PHASES;

    for (const phase of phases) {
      let feedback: Feedback | undefined;
      let passed = false;
      if (phase === "design") {
        ctx.baseline = ctx.incremental ? sourceFiles(ws).map((rel) => readFileSync(join(ws.root, rel), "utf8")).join("\n") : "";
      }

      // すでにある本番コードを直すときは、エージェントを呼ぶ前に、いまのコードをそのまま採点する。
      // 合格なら実装の段階は要らない。不合格なら、その内容を最初の依頼に載せる
      if (phase === "implementation" && ctx.incremental) {
        const before = await verifyGate(ctx);
        feedback = before.feedback;
        passed = feedback === undefined;
        log(`[${round}] verify: ${passed ? "pass (nothing to implement)" : describe(phase, feedback)}`);
        attempts.push({
          component,
          round,
          phase,
          attempt: 0,
          ok: passed,
          inputs: [],
          ...(before.staticCheck ? { staticCheck: before.staticCheck } : {}),
          ...(before.mutation ? { mutation: before.mutation } : {}),
          ...(feedback ? { feedback } : {}),
        });
      }

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
          component,
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
    return true;
  }
  return false;
}

// 動かす段階を、出力先の状態から決める。
//   本番コードが無い                     … 何も無いところから: 設計 → 配線 → 実装
//   契約 (コマンド・入力・問い合わせ・副作用・状態) が変わった … 公開している形から直す: 設計 → 配線 → 実装
//   アダプターだけが無い                 … 配線 → 実装
//   それ以外                             … 実装だけ（その前にいまのコードを採点し、合格なら何もしない）
// 前回の境界は、出力先に生成してある IR から読む
const boundaryOf = (ir: Ir) => {
  const { init, states, commands, queries, effects } = ir.model ?? ({} as Partial<NonNullable<Ir["model"]>>);
  return stableStringify({ init, states, commands, queries, effects });
};

function planOf(ctx: GateContext, from: Phase | undefined): { phases: readonly Phase[]; incremental: boolean; reason: string } {
  const { ws } = ctx;
  const read = (rel: string) => (existsSync(join(ws.root, rel)) ? readFileSync(join(ws.root, rel), "utf8") : undefined);
  const incremental = sourceFiles(ws).length > 0;
  if (from !== undefined) return { phases: PHASES.slice(PHASES.indexOf(from)), incremental, reason: `--from ${from}` };
  if (!incremental) return { phases: PHASES, incremental, reason: "no production code yet" };
  // 契約は境界 (状態・コマンドと入力・問い合わせ・副作用) から決まる。前回の IR の境界と比べる
  // （生成した契約のファイルは、ヘッダーに仕様全体のハッシュを含むので、そのままは比べられない）
  const previous = read(ws.paths.ir);
  if (previous === undefined || boundaryOf(JSON.parse(previous) as Ir) !== boundaryOf(ctx.ir)) {
    return { phases: PHASES, incremental, reason: "the contract changed" };
  }
  if (read(ws.paths.adapter) === undefined) return { phases: ["wiring", "implementation"], incremental, reason: "no adapter yet" };
  return { phases: ["implementation"], incremental, reason: "the contract is unchanged" };
}

function describe(phase: Phase, feedback: Feedback | undefined): string {
  if (!feedback) return phase === "wiring" ? "ok (tests fail as expected: not implemented)" : phase === "design" ? "ok" : "pass";
  if (feedback.kind === "check" || feedback.kind === "mutation") {
    return `rejected (${[...new Set(feedback.violations.map((v) => v.rule))].join(", ")})`;
  }
  if (feedback.kind === "red") return "rejected (tests did not fail for the expected reason)";
  if (feedback.kind === "regression") return `rejected (broke ${feedback.component})`;
  return feedback.kind === "pbt" ? `pbt ${feedback.result.status}` : "crashed";
}
