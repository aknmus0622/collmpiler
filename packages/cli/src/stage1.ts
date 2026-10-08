import { effectOccurrences, isReference, kindOf, payloadEvents, referenceEvents, valuesToWrite, writeEvents } from "./extract.ts";
import type { PayloadDiagnostic, ReferenceDiagnostic, SpecInput } from "./extract.ts";
import { isEnum, isNumberSchema } from "./schema.ts";
import type { Adapter } from "./runtime.ts";
import { fileURLToPath } from "node:url";
import { staleness } from "./verified.ts";

// Stage 1: フレームワーク自身の仕様 (packages/cli/self/specs) から生成したコードで、フレームワークの一部を動かす。
//
// いま置き換えているのは、名前の検査 (reference-check) だけ。使うのは、生成された契約
// (TargetSystemAdapter) を通してである。契約は仕様から決まり、アダプターと本番コードの整合は実装のループが
// 保証しているので、本番コードの形（クラス名やメソッド名）が作り直しで変わっても、ここは変わらない。
//
// 自分の生成物に依存すると、生成物が壊れたときに、それを直すためのフレームワークが動かなくなる。
// そこで、読み込めない・実行できないときは、手書きの Stage 0 (extract.ts の referenceDiagnostics) に落とす。
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

// 名前の検査を Stage 1 で実行する。実行できなければ undefined（呼び出し側は Stage 0 で判断する）
export async function stage1References(input: SpecInput, adapterUrl = STAGE1_ADAPTER): Promise<ReferenceDiagnostic[] | undefined> {
  const model = input.model;
  if (!model) return undefined;
  const adapter = await stage1Adapter("reference-check", adapterUrl);
  if (!adapter) return undefined;
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
    return fallback("reference-check", error);
  }
  return found;
}

// ペイロードの検査を Stage 1 で実行する。実行できなければ undefined
export async function stage1Payloads(input: SpecInput, url?: string): Promise<PayloadDiagnostic[] | undefined> {
  const model = input.model;
  if (!model) return undefined;
  const adapter = await stage1Adapter("payload-check", url);
  if (!adapter) return undefined;
  const found: PayloadDiagnostic[] = [];
  try {
    for (const { occurrence, command, effect } of effectOccurrences(input)) {
      // 依存: 宣言と、与えられたフィールドについて、名前で尋ねられる。答えるのは、この仕様の語彙と、いまたどっている副作用
      type At = { effect: string; field: string };
      const schema = ({ effect: name, field }: At) => model.effects[name]?.[field];
      const bounds = (at: At): { min?: number; max?: number } => {
        const declared = schema(at);
        return declared !== undefined && isNumberSchema(declared) ? declared : {};
      };
      await adapter.setupIsolation({
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
      });
      try {
        for (const event of payloadEvents(input, command, effect)) await adapter.executeCommand(event);
      } finally {
        await adapter.teardownIsolation();
      }
    }
  } catch (error) {
    return fallback("payload-check", error);
  }
  return found;
}

// 値の直列化を Stage 1 で実行する。返すのは、置き場所の名前 → IR の形。実行できなければ undefined
type Written =
  | { name: "WriteConstant"; payload: { kind: "string" | "number" | "boolean"; text: string; number: number; flag: boolean } }
  | { name: "WriteReference"; payload: { text: string } }
  | { name: "WriteWasState"; payload: { state: string } };
export async function stage1Values(input: SpecInput, url?: string): Promise<Map<string, unknown> | undefined> {
  if (!input.model) return undefined;
  const adapter = await stage1Adapter("value-writer", url);
  if (!adapter) return undefined;
  const values = new Map<string, unknown>();
  let written: Written[] = [];
  const record = (name: Written["name"]) => (payload: unknown) => void written.push({ name, payload: { ...(payload as object) } } as Written);
  try {
    await adapter.setupIsolation({
      queries: {},
      effects: { WriteConstant: record("WriteConstant"), WriteReference: record("WriteReference"), WriteWasState: record("WriteWasState") },
    });
    try {
      for (const [slot, value] of valuesToWrite(input)) {
        written = [];
        for (const event of writeEvents(value)) await adapter.executeCommand(event);
        // 書かれたものを、置き場所に組み上げる（1要素ずつ出てくるものを、IR の入れ子に戻す。判断は無い）
        const wasStates = written.flatMap((entry) => (entry.name === "WriteWasState" ? [entry.payload.state] : []));
        const [first] = written;
        if (isReference(value) && value.$ref === "was" && wasStates.length === written.length) values.set(slot, { $was: wasStates });
        else if (written.length === 1 && first.name === "WriteReference") values.set(slot, { $ref: first.payload.text });
        else if (written.length === 1 && first.name === "WriteConstant") {
          const { kind, text, number, flag } = first.payload;
          values.set(slot, kind === "string" ? text : kind === "number" ? number : flag);
        } else throw new Error(`値 ${slot} に対して、書かれたものが想定と違います: ${JSON.stringify(written)}`);
      }
    } finally {
      await adapter.teardownIsolation();
    }
  } catch (error) {
    return fallback("value-writer", error);
  }
  return values;
}

// 検査と直列化を、使える中でいちばん新しい Stage で実行した結果を、extract に渡す形で返す
export const references = async (input: SpecInput) => {
  const [found, payloads, values] = [await stage1References(input), await stage1Payloads(input), await stage1Values(input)];
  return { ...(found ? { references: found } : {}), ...(payloads ? { payloads } : {}), ...(values ? { values } : {}) };
};
