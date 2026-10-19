import { effectOccurrences, isReference, kindOf, payloadEvents, referenceEvents, structuredVocabulary, valuesToWrite, writeEvent } from "./extract.ts";
import type { PayloadDiagnostic, ReferenceDiagnostic, SpecInput } from "./extract.ts";
import { isEnum, isNumberSchema } from "./schema.ts";
import type { Adapter } from "./runtime.ts";
import { fileURLToPath } from "node:url";
import { staleness } from "./verified.ts";

// Stage 1: フレームワーク自身の仕様 (packages/cli/self/specs) から生成したコードで、フレームワークの判断を下す。
//
// 使うのは、生成された契約 (TargetSystemAdapter) を通してである。契約は仕様から決まり、アダプターと本番コードの整合は
// 実装のループが保証しているので、本番コードの形（クラス名やメソッド名）が作り直しで変わっても、ここは変わらない。
// 部品は、下の登録の表に1つずつ置く（どの部品も、手順は runStage1 が持つ）。
//
// 自分の生成物に依存すると、生成物が壊れたときに、それを直すためのフレームワークが動かなくなる。
// そこで、範囲の外・記録が古い・読み込めない・実行できないときは、手書きの Stage 0 に落とす。
// 環境変数 CLP_STAGE=0 で、Stage 0 に固定できる。

const adapterUrl = (component: string) => new URL(`../self/clp/${component}.adapter.ts`, import.meta.url).href;
export const STAGE1_ADAPTER = adapterUrl("reference-check");

const warned = new Set<string>();
function fallback(component: string, error: unknown): undefined {
  const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
  if (!warned.has(`${component}: ${reason}`)) {
    warned.add(`${component}: ${reason}`);
    console.error(`注意: Stage 1 (生成したコード) の ${component} を実行できないので、Stage 0 (手書き) で続けます: ${reason}`);
  }
  return undefined;
}

// Stage 1 のコンポーネントを、生成された契約 (アダプター) として読み込む。使えなければ undefined
export async function stage1Adapter(component: string, url = adapterUrl(component)): Promise<Adapter | undefined> {
  if (process.env.CLP_STAGE === "0") return undefined;
  // 使うのは、検証に合格した、いまの仕様の版だけ。作りかけのコードや、合格のあとで書き換えられたコードは使わない
  if (url === adapterUrl(component)) {
    const stale = staleness(fileURLToPath(new URL(`../self/clp/${component}.verified.json`, import.meta.url)), fileURLToPath(new URL("../self/specs", import.meta.url)));
    if (stale !== undefined) return fallback(component, new Error(stale));
  }
  try {
    return ((await import(url)) as { adapter: Adapter }).adapter;
  } catch (error) {
    return fallback(component, error);
  }
}
// 読み込めたが、動かし始められなかったとき
export const stage1Unavailable = (error: unknown) => void fallback("pipeline", error);

// --- 登録の表 (SELF_HOSTING.md §11) ---
// Stage 1 で動かす判断は、部品ごとに、ここに1つずつ登録する。手順（読み込み、範囲の外かどうか、実行、
// 動かなければ Stage 0 に戻る）は、どの部品でも同じで、runStage1 が持つ。部品ごとに違うのは:
//   inScope … 入力が、その部品の仕様の範囲の中か（外なら Stage 0 が判断する。判断の途中で切り替えないため、始める前に決める）
//   run     … イベントを流して、結果を集める（依存の答え方と、結果の集め方。判断を持たない糊）
export type Stage1Part<I, R> = {
  component: string;
  inScope?: (input: I) => boolean;
  run: (adapter: Adapter, input: I) => Promise<R>;
};

// 登録した部品を Stage 1 で実行する。実行できなければ（範囲の外、記録が古い、読み込めない、例外）undefined。
// 呼び出し側は、そのとき Stage 0 で判断する
export async function runStage1<I, R>(part: Stage1Part<I, R>, input: I, url?: string): Promise<R | undefined> {
  if (part.inScope && !part.inScope(input)) return undefined;
  const adapter = await stage1Adapter(part.component, url);
  if (!adapter) return undefined;
  try {
    return await part.run(adapter, input);
  } catch (error) {
    return fallback(part.component, error);
  }
}

// 1回の隔離の中で、イベントを順に流す。答え（返す値）を、イベントの順に返す
export async function session(adapter: Adapter, ports: { queries: Record<string, (...args: any[]) => unknown>; effects: Record<string, (...args: any[]) => unknown> }, events: Iterable<unknown>): Promise<unknown[]> {
  const answers: unknown[] = [];
  await adapter.setupIsolation(ports);
  try {
    for (const event of events) answers.push(await adapter.executeCommand(event));
  } finally {
    await adapter.teardownIsolation();
  }
  return answers;
}

// 名前の検査 (reference-check)
export const referenceCheck: Stage1Part<SpecInput, ReferenceDiagnostic[]> = {
  component: "reference-check",
  inScope: (input) => input.model !== undefined,
  async run(adapter, input) {
    const model = input.model!;
    const found: ReferenceDiagnostic[] = [];
    // 依存: 宣言されているかは、この仕様の語彙に尋ねる。報告は、ここに集める
    await session(
      adapter,
      {
        queries: {
          stateDeclared: ({ name }: { name: string }) => model.states.includes(name),
          effectDeclared: ({ name }: { name: string }) => name in model.effects,
        },
        effects: { ReportDiagnostic: (payload: ReferenceDiagnostic) => void found.push({ ...payload }) },
      },
      referenceEvents(input),
    );
    return found;
  },
};

// ペイロードの検査 (payload-check)。構造を持つ値（並び、フィールドの組、無いことがある値）は、この部品の仕様の範囲の外
export const payloadCheck: Stage1Part<SpecInput, PayloadDiagnostic[]> = {
  component: "payload-check",
  inScope: (input) => input.model !== undefined && !structuredVocabulary(input.model),
  async run(adapter, input) {
    const model = input.model!;
    const found: PayloadDiagnostic[] = [];
    for (const { occurrence, command, effect } of effectOccurrences(input)) {
      // 依存: 宣言と、与えられたフィールドについて、名前で尋ねられる。答えるのは、この仕様の語彙と、いまたどっている副作用
      type At = { effect: string; field: string };
      const schema = ({ effect: name, field }: At) => model.effects[name]?.[field];
      const bounds = (at: At): { min?: number; max?: number } => {
        const declared = schema(at);
        return declared !== undefined && isNumberSchema(declared) ? declared : {};
      };
      await session(
        adapter,
        {
          queries: {
            effectDeclared: ({ name }: { name: string }) => name in model.effects,
            fieldDeclared: (at: At) => schema(at) !== undefined,
            fieldGiven: ({ field }: At) => field in effect.payload,
            fieldKind: (at: At) => (schema(at) === undefined ? "string" : kindOf(schema(at)!)),
            memberOf: ({ value, ...at }: At & { value: string }) => {
              const declared = schema(at);
              return declared !== undefined && isEnum(declared) && declared.includes(value);
            },
            hasMinimum: (at: At) => bounds(at).min !== undefined,
            minimum: (at: At) => bounds(at).min ?? 0,
            hasMaximum: (at: At) => bounds(at).max !== undefined,
            maximum: (at: At) => bounds(at).max ?? 0,
          },
          effects: { ReportDiagnostic: ({ code, field }: { code: PayloadDiagnostic["code"]; field: string }) => void found.push({ code, occurrence, field }) },
        },
        payloadEvents(input, command, effect),
      );
    }
    return found;
  },
};

// 値の直列化 (value-writer)。返すのは、置き場所の名前 → IR の形
export const valueWriter: Stage1Part<SpecInput, Map<string, unknown>> = {
  component: "value-writer",
  inScope: (input) => input.model !== undefined,
  async run(adapter, input) {
    const values = new Map<string, unknown>();
    const slots = [...valuesToWrite(input)];
    const answers = await session(adapter, { queries: {}, effects: {} }, slots.map(([, value]) => writeEvent(value)));
    for (const [index, [slot]] of slots.entries()) {
      const written = answers[index] as { constant?: unknown; reference?: string; was?: string[] } | undefined;
      // 答えを、IR の形に置き換える（形の名前を、IR のキーに読み替えるだけ。判断は無い）
      if (written && "constant" in written) values.set(slot, written.constant);
      else if (written && "reference" in written) values.set(slot, { $ref: written.reference });
      else if (written && "was" in written) values.set(slot, { $was: written.was });
      else throw new Error(`値 ${slot} に対して、答えが想定と違います: ${JSON.stringify(written)}`);
    }
    return values;
  },
};

// これまでの呼び方（テストが、偽のアダプターの場所を渡して使う）
export const stage1References = (input: SpecInput, url = STAGE1_ADAPTER) => runStage1(referenceCheck, input, url);
export const stage1Payloads = (input: SpecInput, url?: string) => runStage1(payloadCheck, input, url);
export const stage1Values = (input: SpecInput, url?: string) => runStage1(valueWriter, input, url);

// IR を作るときの判断を、使える中でいちばん新しい Stage で実行した結果を、extract に渡す形で返す
export const references = async (input: SpecInput) => {
  const [found, payloads, values] = [await runStage1(referenceCheck, input), await runStage1(payloadCheck, input), await runStage1(valueWriter, input)];
  return { ...(found ? { references: found } : {}), ...(payloads ? { payloads } : {}), ...(values ? { values } : {}) };
};
