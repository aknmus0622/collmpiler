import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { FILES, TEST_DIR } from "./generate.ts";
import type { Phase } from "./request.ts";

// 実装の Strategy: 「与えられた作業場所で依頼を実行し、コードを書く」だけを担う。
// 何を渡し何を受け取るか（隔離と採点）は前後のゲート (gates.ts) の責任で、Strategy は関知しない。

export type Assignment = {
  // 入口ゲートが用意した作業場所。依頼は <dir>/clp/REQUEST.md
  dir: string;
  // 実装のどの段階か（設計 / 配線 / 実装）。依頼文はすでにその段階のものになっている。
  // "interpretation" は実装の流れとは別の、仕様の解釈 (interpret.ts)。"interpretation-2" 以降は、比べるための解釈
  phase: Phase | "interpretation" | `interpretation-${number}`;
  attempt: number;
  // 入口ゲートがリポジトリのパスを取り除いた環境変数
  env: NodeJS.ProcessEnv;
};

export interface ImplementationStrategy {
  name: string;
  run(assignment: Assignment): void | Promise<void>;
}

// 外部コマンド (claude / codex / 自作スクリプト等) をエージェントとして起動する。
// cwd = 作業場所。環境変数 CLP_REQUEST (依頼ファイル)、CLP_PHASE (段階)、CLP_ATTEMPT (試行回数) を渡す。
// 段階ごとに別のプロセスとして起動するので、段階をまたいで記憶は引き継がれない。
export function commandStrategy(
  command: string,
  options: { timeoutMs?: number; transcriptDir?: string } = {},
): ImplementationStrategy {
  return {
    name: command,
    run({ dir, phase, attempt, env }) {
      const result = spawnSync(command, {
        shell: true,
        cwd: dir,
        env: { ...env, PWD: dir, CLP_REQUEST: join(TEST_DIR, FILES.request), CLP_PHASE: phase, CLP_ATTEMPT: String(attempt) },
        stdio: ["ignore", "pipe", "inherit"],
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        timeout: options.timeoutMs ?? 600_000,
      });
      if (options.transcriptDir) {
        const transcripts = resolve(process.cwd(), options.transcriptDir);
        mkdirSync(transcripts, { recursive: true });
        writeFileSync(join(transcripts, `${phase}-${attempt}.log`), result.stdout ?? "");
      }
    },
  };
}
