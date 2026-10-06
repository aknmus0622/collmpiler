import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkWorkspace } from "./check.ts";
import type { Violation } from "./check.ts";
import { extract, stableStringify } from "./extract.ts";
import {
  FILES,
  SOURCE_DIR,
  TEST_DIR,
  generateAdapterSkeleton,
  generateContract,
  generateVerify,
  requireModel,
  specHash,
} from "./generate.ts";
import type { Ir } from "./generate.ts";
import { loadSpecs } from "./loader.ts";
import { RESULT_PREFIX } from "./runtime.ts";
import type { PbtResult } from "./runtime.ts";

// 仕様 → IR → (LLM エージェントが実装) → 余計なもの検査 → PBT のループ。
// どちらで落ちても結果をエージェントに差し戻し、上限回数まで繰り返す。

export type ImplementOptions = {
  specs: string;
  out: string;
  // 外部コマンド。cwd = out、環境変数 AAC_REQUEST (依頼ファイル) と AAC_ATTEMPT (試行回数) を渡す
  agent: string;
  maxAttempts?: number;
  runs?: number;
  agentTimeoutMs?: number;
  log?: (line: string) => void;
};

export type Feedback =
  | { kind: "check"; violations: Violation[] }
  | { kind: "pbt"; result: PbtResult }
  | { kind: "crash"; output: string };

export type Attempt = { attempt: number; ok: boolean; feedback?: Feedback };

export async function implement(options: ImplementOptions) {
  const specsDir = resolve(process.cwd(), options.specs);
  const outDir = resolve(process.cwd(), options.out);
  const testDir = join(outDir, TEST_DIR);
  const log = options.log ?? (() => {});

  const { ir: extracted, diagnostics } = await extract(await loadSpecs(specsDir));
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    throw new Error(`仕様にエラーがあります:\n${errors.map((d) => `  ${d.behavior}.${d.case}: ${d.message}`).join("\n")}`);
  }
  const ir = JSON.parse(stableStringify(extracted)) as Ir;
  requireModel(ir);

  // 検証を決定的にするため、シードは仕様のハッシュから決める
  const seed = Number.parseInt(specHash(ir).slice("sha256:".length, "sha256:".length + 7), 16);
  const verifyArgs = [join(TEST_DIR, FILES.verify), "--seed", String(seed), "--runs", String(options.runs ?? 200)];

  mkdirSync(testDir, { recursive: true });
  mkdirSync(join(outDir, SOURCE_DIR), { recursive: true });

  const attempts: Attempt[] = [];
  let feedback: Feedback | undefined;

  for (let attempt = 1; attempt <= (options.maxAttempts ?? 3); attempt++) {
    // 生成ファイルは毎回書き直す（エージェントが壊していても採点基準は元に戻る）
    writeFileSync(join(testDir, FILES.ir), stableStringify(ir));
    writeFileSync(join(testDir, FILES.contract), generateContract(ir));
    writeFileSync(join(testDir, FILES.verify), generateVerify(ir, testDir, specsDir));
    if (!existsSync(join(testDir, FILES.adapter))) {
      writeFileSync(join(testDir, FILES.adapter), generateAdapterSkeleton());
    }
    writeFileSync(join(testDir, FILES.request), renderRequest(attempt, feedback));

    log(`[${attempt}] agent: ${options.agent}`);
    const agent = spawnSync(options.agent, {
      shell: true,
      cwd: outDir,
      env: { ...process.env, AAC_REQUEST: join(TEST_DIR, FILES.request), AAC_ATTEMPT: String(attempt) },
      stdio: ["ignore", "ignore", "inherit"],
      timeout: options.agentTimeoutMs ?? 600_000,
    });
    if (agent.status !== 0) log(`[${attempt}] agent exited with ${agent.status ?? agent.signal}`);

    const violations = checkWorkspace(outDir, ir, specsDir);
    if (violations.length > 0) {
      feedback = { kind: "check", violations };
      log(`[${attempt}] check: ${violations.length} violation(s): ${violations.map((v) => v.rule).join(", ")}`);
      attempts.push({ attempt, ok: false, feedback });
      continue;
    }

    const run = spawnSync(process.execPath, verifyArgs, { cwd: outDir, encoding: "utf8", timeout: 120_000 });
    const line = run.stdout?.split("\n").find((text) => text.startsWith(RESULT_PREFIX));
    if (!line) {
      feedback = { kind: "crash", output: `${run.stderr ?? ""}${run.error?.message ?? ""}`.trim().slice(-2000) };
      log(`[${attempt}] pbt: crashed`);
      attempts.push({ attempt, ok: false, feedback });
      continue;
    }
    const result = JSON.parse(line.slice(RESULT_PREFIX.length)) as PbtResult;
    if (result.status === "pass") {
      log(`[${attempt}] pbt: pass (${result.numRuns} runs, seed ${result.seed})`);
      attempts.push({ attempt, ok: true });
      return { status: "pass" as const, attempts, seed };
    }
    feedback = { kind: "pbt", result };
    log(`[${attempt}] pbt: ${result.status}`);
    attempts.push({ attempt, ok: false, feedback });
  }

  // 最後の失敗内容を依頼ファイルに残しておく
  writeFileSync(join(testDir, FILES.request), renderRequest(attempts.length + 1, feedback));
  return { status: "fail" as const, attempts, seed };
}

function renderFeedback(feedback: Feedback): string {
  if (feedback.kind === "check") {
    const lines = feedback.violations.map((v) => `- \`${v.file}\` [${v.rule}] ${v.message}`);
    return `The previous attempt was rejected before testing because it broke the rules:\n\n${lines.join("\n")}`;
  }
  if (feedback.kind === "crash") {
    return `The previous attempt crashed before producing a test result:\n\n\`\`\`\n${feedback.output}\n\`\`\``;
  }
  const result = feedback.result;
  const replay =
    result.status === "fail"
      ? `\n\nReproduce with: \`node ${TEST_DIR}/${FILES.verify} --seed ${result.seed} --path ${result.path}\``
      : "";
  return `The previous attempt failed the property-based test. Minimal counterexample:\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`${replay}`;
}

function renderRequest(attempt: number, feedback: Feedback | undefined): string {
  return `# Implementation request (attempt ${attempt})

Implement a system that satisfies the specification in \`${TEST_DIR}/${FILES.ir}\`, then connect it to the test
harness. Your work is accepted when the rule check and the property-based test both pass.

## What to write

1. **Production code under \`${SOURCE_DIR}/\`.** Its design is entirely yours: file layout, names, classes or
   functions. It must be plain TypeScript that Node can run directly (erasable syntax only: no \`enum\`, no
   \`namespace\`, no parameter properties; relative imports need the \`.ts\` extension).
2. **\`${TEST_DIR}/${FILES.adapter}\`.** Fill in every method so the test harness can drive your production code.
   The interface is defined in \`${TEST_DIR}/${FILES.contract}\`.

## Rules (checked mechanically)

- Production code may import only other files under \`${SOURCE_DIR}/\`, by relative path. No packages, no
  \`node:\` built-ins, no \`import()\` / \`require()\`. It must not depend on the test harness or the spec.
- Work only from the files in this directory. Do not read anything outside it (in particular, not the spec
  sources); the IR is the complete specification.
- Do not edit \`${TEST_DIR}/${FILES.ir}\`, \`${TEST_DIR}/${FILES.contract}\`, or \`${TEST_DIR}/${FILES.verify}\`, and do not
  add files outside \`${SOURCE_DIR}/\`.
- The adapter must stay thin. It may import only \`./${FILES.contract}\` and files under \`../${SOURCE_DIR}/\`. It
  must not contain numeric literals, must not reference state data fields or their values, and must not mention
  decision rule names. Pass the \`data\` argument of \`givenState\` to production code unchanged; all business
  logic belongs in \`${SOURCE_DIR}/\`.

## How to read the IR

- \`model.states\` / \`model.initial\`: the state names and the starting state.
- \`model.data\`: the fields of the state data. An array lists the allowed values; a string is a primitive type.
- \`model.commands\`: the side effects the system may emit, with their payload fields.
- \`decisions\`: decision tables. Each key of \`rows\` is a condition written in natural language; decide what it
  means in terms of \`model.data\`. At most one non-default row matches a given state (hit policy: unique);
  \`default\` applies when no other row matches.
- \`behaviors\`: actions. \`preconditions\` are natural-language conditions on the state; behaviour when they do
  not hold is not tested. Each key of \`transitions\` is an outcome passed to \`executeAction(action, outcome)\`.
  The transition gives the resulting \`nextState\` and the \`emittedCommands\`, in order.
- Inside a transition, \`{"$ref": "decision:<Table>.<column>"}\` means the value of that column in the row that
  matches the current state, and \`{"$spread": "decision:<Table>.<column>"}\` means all elements of that column's
  array, inserted at that position. \`payloadSchema\` is informational and is not part of the command.

## Checking your work

Run \`node ${TEST_DIR}/${FILES.verify}\` from this directory. The last line of output starts with
\`${RESULT_PREFIX.trim()}\` and reports \`pass\` or a minimal counterexample.
${feedback ? `\n## Feedback from the previous attempt\n\n${renderFeedback(feedback)}\n` : ""}`;
}
