import { parseArgs } from "node:util";
import { draftBinding } from "./draft.ts";
import { commandStrategy } from "./strategy.ts";

// 暫定エントリ:
//   node packages/cli/src/draft-binding.ts --agent "<command>" [--specs specs] [--max-attempts 3] [--transcripts <dir>]
// 結び付け (Layer 2) の下書きを LLM に書かせ、<名前>.binding.draft.ts に書き出す。
// 下書きは人が確認して名前を変えるまで使われない。
const { values } = parseArgs({
  options: {
    specs: { type: "string", default: "specs" },
    agent: { type: "string" },
    "max-attempts": { type: "string", default: "3" },
    transcripts: { type: "string" },
  },
});
if (!values.agent) {
  console.error('usage: draft-binding --agent "<command>" [--specs specs] [--max-attempts 3] [--transcripts <dir>]');
  process.exit(2);
}

const result = await draftBinding({
  specs: values.specs,
  strategy: commandStrategy(values.agent, { transcriptDir: values.transcripts }),
  maxAttempts: Number(values["max-attempts"]),
  log: (line) => console.error(line),
});
console.log(JSON.stringify(result, null, 2));
if (result.status === "drafted") {
  console.error(`\n下書きを書き出しました: ${result.draft}`);
  console.error("すべての関数を読んで意味を確認し、ファイル名から .draft を外すと有効になります。");
}
if (result.status === "failed") process.exitCode = 1;
