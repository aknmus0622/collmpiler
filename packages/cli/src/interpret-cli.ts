import { parseArgs } from "node:util";
import { readAssets } from "./assets.ts";
import { accept, interpret } from "./interpret.ts";
import { commandStrategy } from "./strategy.ts";

// 暫定エントリ:
//   node packages/cli/src/interpret-cli.ts --agent "<command>" [--specs specs] [--component <name>] [--sessions <n>]
//     [--max-attempts 3] [--transcripts <dir>] [--asset <file>]...
//   node packages/cli/src/interpret-cli.ts --accept [--specs specs] [--component <name>]
// 解釈 (Layer 2) を LLM に導かせ、<名前>.interpretation.draft.ts に書き出す。
// 下書きは、人が確定する (--accept) まで使われない。
// 食い違いの観点の表示
const label = (aspect: string) =>
  aspect === "runs" ? "実行できるかどうか" : aspect === "state" ? "遷移先" : aspect === "order" ? "副作用の順序" : `副作用 ${aspect.slice("effect:".length)}`;

const { values } = parseArgs({
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
    asset: { type: "string", multiple: true },
  },
});

if (values.accept) {
  const { accepted, problems } = await accept({ specs: values.specs, component: values.component });
  for (const file of accepted) console.error(`確定しました: ${file}`);
  for (const problem of problems) console.error(`error: ${problem}`);
  if (accepted.length === 0 && problems.length === 0) console.error("確定するものはありません（どの解釈も、いまの Layer 1 のものです）");
  if (problems.length > 0) process.exitCode = 1;
} else {
  if (!values.agent) {
    console.error('usage: interpret --agent "<command>" [--specs specs] [--component <name>] [--sessions <n>] [--max-attempts 3] [--transcripts <dir>] [--asset <file>]...\n       interpret --accept [--specs specs] [--component <name>]');
    process.exit(2);
  }
  const result = await interpret({
    specs: values.specs,
    component: values.component,
    strategy: commandStrategy(values.agent, { transcriptDir: values.transcripts }),
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
    if (result.changed) console.error(`構造が変わったもの: ${result.changed.join(", ") || "なし"}（変わらなかったもの: ${result.unchanged}。意味の関数の変更は含みません）`);
    for (const comparison of result.comparisons ?? []) {
      if (comparison.status === "failed") console.error(`\n${comparison.session} つ目の解釈は導けなかったので、比べていません。`);
      else if (comparison.differences.length === 0) console.error(`\n${comparison.session} つ目の解釈は、試したコマンド列のすべてで、1つ目と一致しました。`);
      for (const difference of comparison.differences) {
        const path = difference.steps.map((step) => `${step.command} ${JSON.stringify({ ...step.input, ...step.queries })}`).join(" → ");
        console.error(`\n食い違い (${difference.command}、${label(difference.aspect)}): ${path}\n  1つ目: ${JSON.stringify(difference.first)}\n  ${comparison.session} つ目: ${JSON.stringify(difference.other)}`);
      }
    }
    for (const question of result.questions) console.error(`疑問点 (${question.line} 行目): ${question.text}`);
    console.error(
      (result.comparisons ?? []).reduce((count, comparison) => count + comparison.differences.length, 0) + result.questions.length > 0
        ? "\n食い違いと疑問点は、Layer 1 の記述があいまいな所です。Layer 1 を詳しくして、もう一度 interpret を実行してください。"
        : "\n解釈を読んで確かめ、interpret --accept で確定してください。",
    );
  }
  if (result.status === "failed") process.exitCode = 1;
}
