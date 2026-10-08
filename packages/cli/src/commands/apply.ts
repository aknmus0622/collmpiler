import { readAssets } from "../assets.ts";
import { parseArgs } from "node:util";
import { implement } from "../loop.ts";
import { selectMutation } from "../mutation.ts";
import { selectStaticCheck } from "../static-check.ts";
import { PHASES } from "../request.ts";
import type { Phase } from "../request.ts";
import { commandStrategy } from "../strategy.ts";
import type { ImplementationStrategy } from "../strategy.ts";
import { selectTarget } from "../target-typescript.ts";

export const summary = "仕様・本番コード・アダプターを一致させる（エージェントに書かせ、検証する）";
export const usage = `clp apply (--out <dir> | --src <dir> --tests <dir | path-prefix.>) [--agent "<command>"] [options]

  宣言した仕様に、実物（本番コードとアダプター）を合わせます。何度でも実行できます。
  動かす段階は、出力先の状態から決まります（何も無ければ 設計 → 配線 → 実装、仕様の値だけが変わったなら実装だけ、
  何も変わっていなければ検証だけ）。

  --out <dir>          出力先。本番コードは <out>/src、テスト側は <out>/clp に置く
  --src / --tests      本番コードとテスト側の置き場所を、直接指定する（両方を指定すれば --out は要らない）。
                       --tests が "." で終わるときは、最後の部分がテスト側のファイル名の接頭辞になる:
                         --tests test/clp         → test/clp/order.adapter.ts
                         --tests src/order/clp.   → src/order/clp.order.adapter.ts （本番コードと同じ場所に並べる）
  --agent "<command>"  エージェントを起動するコマンド。作業場所で実行され、clp/REQUEST.md を読んで書く。
                       省略すると、エージェントが要る場面で止まる（検証と、テスト側の生成だけを行う）
  --specs <dir>        仕様のディレクトリ（既定: specs）
  --component <name>   1つのコンポーネントだけを一致させる（既定: 仕様にあるすべてを、名前順に）
  --max-attempts <n>   1つの段階の中で差し戻す回数の上限（既定: 3）
  --runs <n>           検証の試行の回数（既定: 5000）
  --max-rounds <n>     設計からやり直す回数の上限。最初の1周を含む（既定: 2）
  --from <phase>       始める段階を明示する (design / wiring / implementation)
  --fresh              すでにある本番コードとアダプターを捨てて、設計から始める
  --asset [<phases>=]<file>  依頼に添付する資料。何度でも指定できる。既定では設計と実装の段階に渡す
                       （"wiring,design=docs/x.md" のように段階を指定できる）
  --drafts             人が確定していない解釈の下書き (*.draft.ts) を、正解として使う
  --mutation auto|builtin|off      ミューテーションのゲート（既定: auto = 対象言語のもの）
  --static-check auto|tsc|off      実装の静的検査（既定: auto。仕様の型チェックはこれとは別で、常に行う）
  --target typescript  対象言語（いまは typescript だけ）
  --transcripts <dir>  エージェントの出力を、試行ごとに保存する
  --agent-timeout <秒> エージェントの1回のセッションの制限時間（既定: 600）
  --keep-sandbox       作業場所を消さずに残す（調査用）`;

// エージェントの指定が無いとき: エージェントが要る場面で、何が要るかを伝えて止まる
const noAgent: ImplementationStrategy = {
  name: "(no agent)",
  run({ phase, attempt }) {
    throw new Error(`${phase} の段階 (${attempt} 回目) を進めるには、エージェントが要ります。--agent "<command>" を指定してください`);
  },
};

export async function main(args: string[]): Promise<void> {
const { values } = parseArgs({
  args,
  options: {
    specs: { type: "string", default: "specs" },
    out: { type: "string" },
    src: { type: "string" },
    tests: { type: "string" },
    component: { type: "string" },
    agent: { type: "string" },
    "max-attempts": { type: "string", default: "3" },
    runs: { type: "string" },
    "max-rounds": { type: "string", default: "2" },
    from: { type: "string" },
    fresh: { type: "boolean", default: false },
    "keep-sandbox": { type: "boolean", default: false },
    transcripts: { type: "string" },
    "agent-timeout": { type: "string" },
    asset: { type: "string", multiple: true },
    drafts: { type: "boolean", default: false },
    mutation: { type: "string", default: "auto" },
    // 実装の静的検査 (仕様の型チェックとは別。そちらは常に行う)
    "static-check": { type: "string", default: "auto" },
    // 対象言語（本番システムを書く言語）。いまは typescript だけ
    target: { type: "string", default: "typescript" },
  },
});
if (values.from !== undefined && !PHASES.includes(values.from as Phase)) {
  console.error(`--from は ${PHASES.join(" / ")} のいずれかです`);
  process.exit(2);
}
if (!values.out && !(values.src && values.tests)) {
  console.error(`出力先を指定してください (--out、または --src と --tests)\n\n${usage}`);
  process.exit(2);
}

const result = await implement({
  specs: values.specs,
  out: values.out,
  src: values.src,
  tests: values.tests,
  component: values.component,
  strategy: values.agent ? commandStrategy(values.agent, { transcriptDir: values.transcripts, ...(values["agent-timeout"] === undefined ? {} : { timeoutMs: Number(values["agent-timeout"]) * 1000 }) }) : noAgent,
  maxAttempts: Number(values["max-attempts"]),
  ...(values.runs === undefined ? {} : { runs: Number(values.runs) }),
  maxRounds: Number(values["max-rounds"]),
  from: values.from as Phase | undefined,
  fresh: values.fresh,
  keepSandbox: values["keep-sandbox"],
  assets: readAssets(values.asset ?? []),
  drafts: values.drafts,
  target: selectTarget(values.target),
  // auto は対象言語のものを使う
  mutation: values.mutation === "auto" ? undefined : (selectMutation(values.mutation) ?? null),
  staticCheck: values["static-check"] === "auto" ? undefined : (selectStaticCheck(values["static-check"]) ?? null),
  log: (line) => console.error(line),
});
console.log(JSON.stringify(result, null, 2));
if (result.status !== "pass") process.exitCode = 1;
}
