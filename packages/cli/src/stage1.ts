import { referenceEvents } from "./extract.ts";
import type { ReferenceDiagnostic, SpecInput } from "./extract.ts";
import type { Adapter } from "./runtime.ts";

// Stage 1: フレームワーク自身の仕様 (packages/cli/self/specs) から生成したコードで、フレームワークの一部を動かす。
//
// いま置き換えているのは、名前の検査 (reference-check) だけ。使うのは、生成された契約
// (TargetSystemAdapter) を通してである。契約は仕様から決まり、アダプターと本番コードの整合は実装のループが
// 保証しているので、本番コードの形（クラス名やメソッド名）が作り直しで変わっても、ここは変わらない。
//
// 自分の生成物に依存すると、生成物が壊れたときに、それを直すためのフレームワークが動かなくなる。
// そこで、読み込めない・実行できないときは、手書きの Stage 0 (extract.ts の referenceDiagnostics) に落とす。
// 環境変数 CLP_STAGE=0 で、Stage 0 に固定できる。

export const STAGE1_ADAPTER = new URL("../self/clp/reference-check.adapter.ts", import.meta.url).href;

const warned = new Set<string>();
function fallback(reason: string): undefined {
  if (!warned.has(reason)) {
    warned.add(reason);
    console.error(`注意: Stage 1 (生成したコード) で名前の検査を実行できないので、Stage 0 (手書き) で続けます: ${reason}`);
  }
  return undefined;
}

// 名前の検査を Stage 1 で実行する。実行できなければ undefined（呼び出し側は Stage 0 で判断する）
export async function stage1References(input: SpecInput, adapterUrl = STAGE1_ADAPTER): Promise<ReferenceDiagnostic[] | undefined> {
  const model = input.model;
  if (!model || process.env.CLP_STAGE === "0") return undefined;
  let adapter: Adapter;
  try {
    adapter = ((await import(adapterUrl)) as { adapter: Adapter }).adapter;
  } catch (error) {
    return fallback(error instanceof Error ? error.message.split("\n")[0] : String(error));
  }
  const found: ReferenceDiagnostic[] = [];
  try {
    // 依存: 宣言されているかは、この仕様の語彙に尋ねる。報告は、ここに集める
    await adapter.setupIsolation({
      queries: {
        stateDeclared: ({ name }: { name: string }) => model.states.includes(name),
        effectDeclared: ({ name }: { name: string }) => name in model.effects,
      },
      effects: { ReportDiagnostic: (payload: ReferenceDiagnostic) => void found.push({ ...payload }) },
    });
    try {
      for (const event of referenceEvents(input)) await adapter.executeCommand(event);
    } finally {
      await adapter.teardownIsolation();
    }
  } catch (error) {
    return fallback(error instanceof Error ? error.message.split("\n")[0] : String(error));
  }
  return found;
}

// 名前の検査を、使える中でいちばん新しい Stage で実行した結果を、extract に渡す形で返す
export const references = async (input: SpecInput) => {
  const found = await stage1References(input);
  return found ? { references: found } : {};
};
