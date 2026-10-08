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

// エージェントが正常に終わらなかった（起動できない、時間切れ、シグナルで止まった、0 以外の終了コード）。
// 「書いた内容が検査に落ちた」とは別のことなので、差し戻さない: 同じ依頼を繰り返しても直らず
// （コマンドが無い、認証切れ、利用の上限）、途中まで書かれたものを採点しても意味が無い。流れ全体を止めて、人に伝える
export class AgentFailure extends Error {}

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
      const timeoutMs = options.timeoutMs ?? 600_000;
      const result = spawnSync(command, {
        shell: true,
        cwd: dir,
        env: { ...env, PWD: dir, CLP_REQUEST: join(TEST_DIR, FILES.request), CLP_PHASE: phase, CLP_ATTEMPT: String(attempt) },
        stdio: ["ignore", "pipe", "inherit"],
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        timeout: timeoutMs,
      });
      if (options.transcriptDir) {
        const transcripts = resolve(process.cwd(), options.transcriptDir);
        mkdirSync(transcripts, { recursive: true });
        writeFileSync(join(transcripts, `${phase}-${attempt}.log`), result.stdout ?? "");
      }
      const where = `${phase} の段階 (${attempt} 回目) のエージェント`;
      const timedOut = (result.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
      if (timedOut) {
        throw new AgentFailure(`${where}が、${Math.round(timeoutMs / 1000)} 秒で終わりませんでした。--agent-timeout <秒> で延ばせます`);
      }
      if (result.error) throw new AgentFailure(`${where}を起動できませんでした: ${result.error.message}`);
      if (result.signal) throw new AgentFailure(`${where}が、シグナル ${result.signal} で止まりました`);
      if (result.status === 127 || result.status === 126) {
        throw new AgentFailure(`${where}を起動できませんでした（終了コード ${result.status}: コマンドが見つからないか、実行できません）: ${command}`);
      }
      if (result.status !== 0) {
        throw new AgentFailure(
          `${where}が、終了コード ${result.status} で終わりました。書いた内容の検査はしていません（認証や利用の上限など、エージェントの側の問題は、差し戻しても直らないため）`,
        );
      }
    },
  };
}
