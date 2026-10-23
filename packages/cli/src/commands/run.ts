import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { readAssets } from "../assets.ts";
import { run } from "../run.ts";
import type { Answer, ConfirmEvent, QuestionEvent, RunEvent, RunResult, Talk } from "../run.ts";
import { commandStrategy } from "../strategy.ts";

export const summary = "検査から検証までを1回で進める（疑問点には、その場で答える）";
export const usage = `clp run (--out <dir> | --src <dir> --tests <dir>) --agent "<command>" [--json] [--yes] [options]

  検査 → 解釈 → 疑問点への応答 → 確定 → 実装 → 検証 を、1回の実行で進めます。どこから始めるかは、仕様と出力先の
  状態から決まります（解釈が無いか古い → 導く、確かめていない疑問点がある → 問う、確定できる → 確定して clp apply）。
  途中で止めても、もう一度実行すれば続きから進みます。

  疑問点と食い違いには、次のどれかで答えます:
    この読み方でよい   その行の REVIEW を REVIEWED にする（Layer 1 は変わらない）
    補足を書く         あなたの文を、そのまま Layer 1 の該当する文の末尾に書き足し、解釈を導き直す
                       （書き込む前に差分を見せて確かめる）
    止める             Layer 1 を自分で直す。直したあとで、もう一度 clp run を実行する

  --agent "<command>"  エージェントを起動するコマンド（解釈と実装の両方に使う）
  --json               問いと答えを JSON lines にする（出来事を stdout に1行ずつ出し、答えを stdin から1行ずつ読む）
  --yes                Layer 1 への書き足しを、確かめずに書き込む
  --specs <dir>        仕様のディレクトリ（既定: specs）
  --out / --src / --tests  出力先（clp apply と同じ）
  --sessions <n>       独立に解釈させるセッションの数（既定: 2）
  --max-attempts <n>   1つの段階の中で差し戻す回数の上限（既定: 3）
  --runs <n>           検証の試行の回数
  --asset <file>       依頼に添付する資料。何度でも指定できる
  --transcripts <dir>  エージェントの出力を、試行ごとに保存する
  --agent-timeout <秒> エージェントの1回のセッションの制限時間（既定: 600）

  終了コード: 0 = 検証に通った、1 = 失敗した、3 = 人の手が要るので止まった`;

const EXIT: Record<RunResult, number> = { passed: 0, failed: 1, stopped: 3 };

/** Lines of stdin, one at a time (undefined once it is closed). */
function lines(): () => Promise<string | undefined> {
  const iterator = createInterface({ input: process.stdin, crlfDelay: Infinity })[Symbol.asyncIterator]();
  return async () => {
    const next = await iterator.next();
    return next.done ? undefined : (next.value as string);
  };
}

/** JSON lines: events on stdout, answers on stdin; progress stays on stderr. */
function jsonTalk(): Talk {
  const read = lines();
  const emit = (event: RunEvent) => process.stdout.write(`${JSON.stringify(event)}\n`);
  return {
    emit,
    async ask(event) {
      emit(event);
      for (;;) {
        const line = await read();
        if (line === undefined) return undefined;
        if (line.trim() === "") continue;
        try {
          const answer = JSON.parse(line) as Answer;
          if (answer.id === event.id) return answer;
          emit({ type: "diagnostic", severity: "warning", code: "unexpected-answer", where: "", message: `${event.id} への答えを待っています: ${line}` });
        } catch {
          emit({ type: "diagnostic", severity: "warning", code: "unexpected-answer", where: "", message: `JSON として読めません: ${line}` });
        }
      }
    },
  };
}

const STEPS: Record<string, string> = { check: "検査", interpret: "解釈", questions: "疑問点への応答", accept: "確定", apply: "実装と検証" };

/** A person at a terminal: everything on stderr, in Japanese. */
function terminalTalk(): Talk {
  const read = lines();
  const say = (text: string) => process.stderr.write(`${text}\n`);
  const prompt = async (text: string) => {
    process.stderr.write(text);
    return read();
  };
  return {
    emit(event) {
      if (event.type === "step") say(event.status === "start" ? `\n== ${STEPS[event.step]}` : `   ${STEPS[event.step]}: 済み`);
      else if (event.type === "diagnostic") say(`${event.severity}[${event.code}] ${event.where === "" ? "" : `${event.where}: `}${event.message}`);
      else if (event.type === "end") say(`\n${event.result === "passed" ? "検証に通りました。" : event.result === "failed" ? "失敗しました。" : "止まりました。"}${event.reason ?? ""}`);
    },
    async ask(event: QuestionEvent | ConfirmEvent) {
      if (event.type === "confirm") {
        say(`\nLayer 1 に、次のように書き足します:\n${event.diff}`);
        const line = await prompt("書き込みますか [y/N] ");
        return line === undefined ? undefined : { id: event.id, answer: /^y(es)?$/i.test(line.trim()) ? "yes" : "no" };
      }
      say(`\n${event.kind === "difference" ? "食い違い" : "疑問点"} (${event.component}, ${event.where})\n  ${event.text}`);
      for (;;) {
        const line = await prompt("  [a] この読み方でよい  [s] 補足を書く  [q] 止める > ");
        if (line === undefined) return undefined;
        const choice = line.trim().toLowerCase();
        if (choice === "a") return { id: event.id, answer: "accept" };
        if (choice === "q") return { id: event.id, answer: "stop" };
        if (choice === "s") {
          const text = await prompt("  補足（Layer 1 に、このまま書き足します）> ");
          if (text === undefined) return undefined;
          if (text.trim() !== "") return { id: event.id, answer: "supplement", text };
        }
      }
    },
  };
}

export async function main(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      specs: { type: "string", default: "specs" },
      out: { type: "string" },
      src: { type: "string" },
      tests: { type: "string" },
      agent: { type: "string" },
      json: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      sessions: { type: "string", default: "2" },
      "max-attempts": { type: "string", default: "3" },
      runs: { type: "string" },
      asset: { type: "string", multiple: true },
      transcripts: { type: "string" },
      "agent-timeout": { type: "string" },
    },
  });
  if (!values.agent) {
    console.error(`エージェントを指定してください (--agent)\n\n${usage}`);
    process.exit(2);
  }
  if (!values.out && !(values.src && values.tests)) {
    console.error(`出力先を指定してください (--out、または --src と --tests)\n\n${usage}`);
    process.exit(2);
  }
  const result = await run({
    specs: values.specs,
    out: values.out,
    src: values.src,
    tests: values.tests,
    strategy: commandStrategy(values.agent, { transcriptDir: values.transcripts, ...(values["agent-timeout"] === undefined ? {} : { timeoutMs: Number(values["agent-timeout"]) * 1000 }) }),
    sessions: Number(values.sessions),
    maxAttempts: Number(values["max-attempts"]),
    ...(values.runs === undefined ? {} : { runs: Number(values.runs) }),
    assets: readAssets(values.asset ?? []),
    yes: values.yes,
    talk: values.json ? jsonTalk() : terminalTalk(),
    log: (line) => console.error(line),
  });
  process.exitCode = EXIT[result];
  // stdin may still be open (a terminal): do not wait for it
  process.stdin.destroy();
}
