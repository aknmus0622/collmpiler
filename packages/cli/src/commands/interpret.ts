import { parseArgs } from "node:util";
import { readAssets } from "../assets.ts";
import { accept, describeDifference, interpret } from "../interpret.ts";
import { commandStrategy } from "../strategy.ts";
import { resolve } from "node:path";
import { accept8, interpret8 } from "../v1/interpret.ts";
import { describeDifference8 } from "../v1/compare.ts";
import { isV1Specs } from "../v1/prepare.ts";

export const summary = "解釈 (Layer 2) を LLM に導かせる。--accept で確定する";
export const usage = `clp interpret --agent "<command>" [--specs <dir>] [--component <name>] [--sessions <n>] [options]
clp interpret --accept [--specs <dir>] [--component <name>]

  人が書くのは Layer 1（決定表とコンポーネント）だけです。Layer 1 が文のままにした所の構造と、文の意味を、
  LLM が解釈として導きます。導いたものは <名前>.interpretation.draft.ts に書き出され、確定するまで使われません。
  解釈が無いか、Layer 1 のあとで古くなっているコンポーネントが対象です（どれも新しければ、何もしません）。

  --agent "<command>"  エージェントを起動するコマンド
  --accept             下書きを確定する（下書きが無ければ、いまの解釈が Layer 1 に合うことを確かめて、確定し直す）。
                       確かめていない疑問点・食い違い (// REVIEW:、// REVIEW(clp):) が残っていれば、確定しない。
                       その読み方でよいと確かめたら、その行の REVIEW を REVIEWED に書き換える
  --specs <dir>        仕様のディレクトリ（既定: specs）
  --component <name>   対象のコンポーネント（既定: 解釈が要る最初のもの。--accept では、すべて）
  --sessions <n>       独立に解釈させるセッションの数（既定: 2）。2 以上なら、1つ目とほかのそれぞれを同じコマンド列で
                       実行して、食い違う所を報告する。1 なら比べない
  --max-attempts <n>   検査に落ちたときに書き直させる回数の上限（既定: 3）
  --asset <file>       依頼に添付する資料（用語集など）。何度でも指定できる
  --transcripts <dir>  エージェントの出力を、試行ごとに保存する
  --agent-timeout <秒> エージェントの1回のセッションの制限時間（既定: 600）`;

export async function main(args: string[]): Promise<void> {
const { values } = parseArgs({
  args,
  options: {
    specs: { type: "string", default: "specs" },
    // 解釈するコンポーネント。省略時は、解釈が要る最初のもの
    component: { type: "string" },
    agent: { type: "string" },
    // 独立に解釈させるセッションの数。2 以上にすると、1つ目とほかのそれぞれとの食い違いを報告する
    // 既定は 2。実際の LLM で試したところ、2つ目が食い違いのあるコマンドをすべて見つけ、3つ目以降は新しいコマンドを足さなかった
    sessions: { type: "string", default: "2" },
    accept: { type: "boolean", default: false },
    "max-attempts": { type: "string", default: "3" },
    transcripts: { type: "string" },
    "agent-timeout": { type: "string" },
    asset: { type: "string", multiple: true },
  },
});

const v1 = isV1Specs(resolve(process.cwd(), values.specs));
if (values.accept) {
  const { accepted, problems } = await (v1 ? accept8 : accept)({ specs: values.specs, component: values.component });
  for (const file of accepted) console.error(`確定しました: ${file}`);
  for (const problem of problems) console.error(`error[not-accepted] ${problem}`);
  if (accepted.length === 0 && problems.length === 0) console.error("確定するものはありません（どの解釈も、いまの Layer 1 のものです）");
  if (problems.length > 0) process.exitCode = 1;
} else {
  if (!values.agent) {
    console.error(`エージェントを指定してください (--agent)。確定するなら --accept です\n\n${usage}`);
    process.exit(2);
  }
  const result = await (v1 ? interpret8 : interpret)({
    specs: values.specs,
    component: values.component,
    strategy: commandStrategy(values.agent, { transcriptDir: values.transcripts, ...(values["agent-timeout"] === undefined ? {} : { timeoutMs: Number(values["agent-timeout"]) * 1000 }) }),
    sessions: Number(values.sessions),
    assets: readAssets(values.asset ?? []),
    maxAttempts: Number(values["max-attempts"]),
    log: (line) => console.error(line),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "up-to-date") console.error("\nどの解釈も、いまの Layer 1 のものです。導き直すものはありません。");
  if (result.status === "interpreted") {
    console.error(`\n解釈を書き出しました: ${result.draft}`);
    if (result.updates) console.error(`いまの解釈 (${result.updates}) を、Layer 1 の変更に合わせて直したものです。`);
    if ("changed" in result && result.changed) console.error(`構造が変わったもの: ${result.changed.join(", ") || "なし"}（変わらなかったもの: ${"unchanged" in result ? result.unchanged : 0}。意味の関数の変更は含みません）`);
    for (const comparison of result.comparisons ?? []) {
      if (comparison.status === "failed") console.error(`\n${comparison.session} つ目の解釈は導けなかったので、比べていません。`);
      else if (comparison.differences.length === 0) console.error(`\n${comparison.session} つ目の解釈は、試したコマンド列のすべてで、1つ目と一致しました。`);
      for (const difference of comparison.differences) console.error(`\n${v1 ? describeDifference8(difference as never, comparison.session) : describeDifference(difference as never, comparison.session)}`);
    }
    for (const question of result.questions) console.error(`疑問点 (${question.line} 行目): ${question.text}`);
    if ("reading" in result && result.reading) console.error(`\n読み下し（Layer 1 の文と、解釈がそれをどう読んだか）:\n${result.reading}`);
    console.error(
      (result.comparisons ?? []).reduce((count, comparison) => count + (comparison.status === "failed" ? 1 : comparison.differences.length), 0) + result.questions.length > 0
        ? "\n食い違いと疑問点は、Layer 1 の記述があいまいな所です。下書きに // REVIEW: / // REVIEW(clp): として書いてあり、" +
            "人が確かめるまで確定できません。Layer 1 を詳しくして、もう一度 clp interpret を実行するか、" +
            "その読み方でよければ、その行の REVIEW を REVIEWED に書き換えてから clp interpret --accept で確定してください。"
        : "\n解釈を読んで確かめ、clp interpret --accept で確定してください。",
    );
  }
  if (result.status === "failed") process.exitCode = 1;
}
}
