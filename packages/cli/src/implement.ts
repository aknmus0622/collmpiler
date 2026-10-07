import { readAssets } from "./assets.ts";
import { parseArgs } from "node:util";
import { implement } from "./loop.ts";
import { selectMutation } from "./mutation.ts";
import { selectStaticCheck } from "./static-check.ts";
import { PHASES } from "./request.ts";
import type { Phase } from "./request.ts";
import { commandStrategy } from "./strategy.ts";
import { selectTarget } from "./target-typescript.ts";

// 暫定エントリ:
//   node packages/cli/src/implement.ts --out <dir> --agent "<command>"
//     [--src <dir>] [--tests <dir | path-prefix.>] [--component <name>]
//     [--specs specs] [--max-attempts 3] [--max-rounds 2] [--from design|wiring|implementation]
//     [--fresh] [--keep-sandbox] [--transcripts <dir>]
//     [--asset [<phases>=]<file>]... [--drafts] [--mutation auto|builtin|off] [--static-check auto|tsc|off]
//     [--target typescript]
//
// --out: 出力先。本番コードは <out>/src、テスト側は <out>/clp に置く
// --src / --tests: 本番コードとテスト側の置き場所を、直接指定する（両方を指定すれば --out は要らない）。
//          --tests が "." で終わるときは、最後の部分がテスト側のファイル名の接頭辞になる:
//            --tests test/clp         → test/clp/order.adapter.ts
//            --tests src/order/clp.   → src/order/clp.order.adapter.ts （本番コードと同じ場所に並べる）
// --component: 一致させるコンポーネントの名前。省略すると、仕様にあるすべてを名前順に一致させる
// --asset: 依頼に添付する資料（設計方針、用語集など）。何度でも指定できる。既定では設計と実装の段階に渡す。
//          "wiring,design=docs/x.md" のように段階を指定できる
// --drafts: 人が確認していない解釈の下書き (*.draft.ts) を正解として使う
const { values } = parseArgs({
  options: {
    specs: { type: "string", default: "specs" },
    out: { type: "string" },
    src: { type: "string" },
    tests: { type: "string" },
    component: { type: "string" },
    agent: { type: "string" },
    "max-attempts": { type: "string", default: "3" },
    "max-rounds": { type: "string", default: "2" },
    from: { type: "string" },
    fresh: { type: "boolean", default: false },
    "keep-sandbox": { type: "boolean", default: false },
    transcripts: { type: "string" },
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
if ((!values.out && !(values.src && values.tests)) || !values.agent) {
  console.error('usage: implement (--out <dir> | --src <dir> --tests <dir | path-prefix.>) --agent "<command>" [--component <name>] [--specs specs] [--max-attempts 3] [--max-rounds 2] [--from design|wiring|implementation] [--fresh] [--keep-sandbox] [--transcripts <dir>] [--asset [<phases>=]<file>]... [--drafts] [--mutation auto|builtin|off] [--static-check auto|tsc|off] [--target typescript]');
  process.exit(2);
}

const result = await implement({
  specs: values.specs,
  out: values.out,
  src: values.src,
  tests: values.tests,
  component: values.component,
  strategy: commandStrategy(values.agent, { transcriptDir: values.transcripts }),
  maxAttempts: Number(values["max-attempts"]),
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
