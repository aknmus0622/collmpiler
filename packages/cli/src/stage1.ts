import { referenceEvents, valuesToWrite, writeEvent } from "./extract.ts";
import type { ReferenceDiagnostic, SpecInput } from "./extract.ts";
import { slotQueries, slotsOf } from "./slots.ts";
import type { SlotReport } from "./slots.ts";
import { EXTRA_SEEDS } from "./runtime.ts";
import type { Adapter, CellTrial, Unobservable } from "./runtime.ts";
import { fileURLToPath } from "node:url";
import { GRAMMAR, leafEvents, leafMessage, leafQueries, slotOf, treeDiagnostic } from "@clp/core";
import type { LeafFacts, LeafReport, Node, TreeReport } from "@clp/core";
import type { LoadJudges } from "./loader.ts";
import { staleness } from "./verified.ts";
import { declaredEvents, failureEvents, failureKey } from "./declared.ts";
import type { DeclaredEvent, DeclaredReport } from "./declared.ts";
import { transitions, vocabularyFacts } from "./graph.ts";
import type { GraphReport } from "./graph.ts";

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
export const stage1Unavailable = (component: string, error?: unknown) => (error === undefined ? void fallback("pipeline", component) : void fallback(component, error));

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
// 生成した部品は、モジュールに1つだけの状態を持つので、1度に1つずつ動かす（並行して呼ばれても、順に）
let queue: Promise<unknown> = Promise.resolve();
export function runStage1<I, R>(part: Stage1Part<I, R>, input: I, url?: string): Promise<R | undefined> {
  const run = queue.then(() => runStage1Now(part, input, url));
  queue = run.catch(() => undefined);
  return run;
}
async function runStage1Now<I, R>(part: Stage1Part<I, R>, input: I, url?: string): Promise<R | undefined> {
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

// 値の置き場所の検査 (payload-check)。スロットごとに1回の隔離で、事実を順に渡す。報告は、そのスロットの鍵と一緒に
export const payloadCheck: Stage1Part<SpecInput, SlotReport[]> = {
  component: "payload-check",
  inScope: (input) => input.model !== undefined,
  async run(adapter, input) {
    const found: SlotReport[] = [];
    for (const slot of slotsOf(input)) {
      await session(
        adapter,
        {
          queries: slotQueries(slot),
          effects: { Report: ({ code, field }: { code: SlotReport["code"]; field: string }) => void found.push({ key: slot.key, code, field }) },
        },
        slot.events,
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

// 仕様のミューテーションの判定 (mutation-verdict)。値を1つずつ渡し、部品が頼んだ試行 (RunTrials) を走らせて、結果 (Tried) を返す。
// 部品が報告したもの (Report) が、検証に現れない値
export const mutationVerdict: Stage1Part<CellTrial[], Unobservable[]> = {
  component: "mutation-verdict",
  async run(adapter, trials) {
    const found: Unobservable[] = [];
    const requested: ({ name: "RunTrials"; extra: number } | { name: "Report"; verdict: Unobservable["verdict"]; severity: Unobservable["severity"] })[] = [];
    await adapter.setupIsolation({
      queries: {},
      effects: {
        RunTrials: ({ extra }: { extra: number }) => void requested.push({ name: "RunTrials", extra }),
        Report: ({ verdict, severity }: { verdict: Unobservable["verdict"]; severity: Unobservable["severity"] }) => void requested.push({ name: "Report", verdict, severity }),
      },
    });
    try {
      for (const trial of trials) {
        const { table, row, column, value } = trial;
        requested.length = 0;
        await adapter.executeCommand({ name: "Begin", input: { kind: value === null ? "null" : typeof value } });
        // 頼まれたことを、頼まれた順に行う。試行は、値1つにつき、検証のシードとほかのシードの数まで
        let runs = 0;
        while (requested.length > 0) {
          const request = requested.shift()!;
          if (request.name === "Report") {
            found.push({ table, row, column, value, verdict: request.verdict, severity: request.severity });
            continue;
          }
          if (++runs > 1 + EXTRA_SEEDS) throw new Error(`mutation-verdict が、値 ${table}.${row}.${column} について、試行を ${runs} 回頼みました`);
          await adapter.executeCommand({ name: "Tried", input: await trial.run(request.extra) });
        }
      }
    } finally {
      await adapter.teardownIsolation();
    }
    return found;
  },
};

// グラフの検査 (graph-check)。事実を1つずつ渡す。たどり着ける状態を探す繰り返しは、部品が頼む (RunRound)。
// 判断のあとの事実（状態、コマンド、出口、語彙）は、部品が「たどり着ける状態が分かった」と言ってから (ReachingDone) 渡す
export type GraphInput = { spec: SpecInput; provided?: ReadonlySet<string>; strict?: boolean };
export const graphCheck: Stage1Part<GraphInput, GraphReport[]> = {
  component: "graph-check",
  inScope: ({ spec }) => spec.model !== undefined,
  async run(adapter, { spec, provided = new Set(), strict = false }) {
    const model = spec.model!;
    const edges = transitions(spec);
    const found: GraphReport[] = [];
    const requested: string[] = [];
    await adapter.setupIsolation({
      queries: { stateDeclared: ({ name }: { name: string }) => model.states.includes(name) },
      effects: {
        RunRound: () => void requested.push("RunRound"),
        ReachingDone: () => void requested.push("ReachingDone"),
        Report: (report: GraphReport) => void found.push({ code: report.code, subject: report.subject, severity: report.severity }),
      },
    });
    const send = (name: string, input: object = {}) => adapter.executeCommand({ name, input });
    try {
      await send("Begin", { init: model.init, strict, finalsDeclared: model.final !== undefined });
      let rounds = 0;
      while (requested.length > 0) {
        const request = requested.shift()!;
        if (request === "RunRound") {
          // 1回ごとに、たどり着ける状態は1つ以上増える。状態の数より多く頼まれたら、部品の誤り
          if (++rounds > model.states.length + 1) throw new Error(`graph-check が、繰り返しを ${rounds} 回頼みました`);
          for (const edge of edges) await send("Edge", edge);
          await send("RoundEnd");
          continue;
        }
        for (const name of model.states) await send("CheckState", { name });
        for (const [name, behavior] of Object.entries(spec.behaviors)) {
          await send("BeginCommand", { name });
          for (const state of behavior.from ?? model.states) await send("From", { state });
          await send("EndCommand");
        }
        for (const state of model.states) {
          await send("BeginExits", { state, final: model.final?.includes(state) ?? false });
          for (const edge of edges) await send("Exit", edge);
          await send("EndExits");
        }
        for (const entry of vocabularyFacts(spec, provided)) await send("Vocabulary", entry);
      }
    } finally {
      await adapter.teardownIsolation();
    }
    return found;
  },
};

// 木の検査 (tree-check)。親ごとに1回の隔離で、子を書いた順に渡す。部品が言った「中を見る」子へ、そのあとで降りる。
// 報告の順は Stage 0 と同じにそろえる（子の報告、その子の中、次の子、…、最後に親についての報告）。組み立ては糊
export const treeCheck: Stage1Part<Node, TreeReport[]> = {
  component: "tree-check",
  async run(adapter, root) {
    const found: TreeReport[] = [];
    const limitOf = (parent: string, slot: string) => {
      const limit = (GRAMMAR[parent] ?? {})[slot];
      return limit === undefined || limit === Number.POSITIVE_INFINITY ? 0 : limit;
    };
    const visit = async (parent: Node): Promise<void> => {
      const reports = new Map<number, TreeReport["code"][]>();
      const atEnd: TreeReport["code"][] = [];
      const descend = new Set<number>();
      let ending = false;
      await adapter.setupIsolation({
        queries: {
          allowed: ({ parent: kind, slot }: { parent: string; slot: string }) => slot in (GRAMMAR[kind] ?? {}),
          limit: ({ parent: kind, slot }: { parent: string; slot: string }) => limitOf(kind, slot),
          stateNamed: ({ name }: { name: string }) => parent.children.some((node) => node.kind === "state" && node.name === name),
        },
        effects: {
          Report: ({ code, index }: { code: TreeReport["code"]; index: number }) => void (ending ? atEnd : (reports.get(index) ?? reports.set(index, []).get(index)!)).push(code),
          Descend: ({ index }: { index: number }) => void descend.add(index),
        },
      });
      const states = parent.children.filter((node) => node.kind === "state");
      const initIndex = parent.children.findIndex((node) => node.kind === "init");
      try {
        await adapter.executeCommand({ name: "BeginParent", input: { kind: parent.kind } });
        for (const [index, node] of parent.children.entries()) {
          // 文法の節でないもの（種類に無い席、裸の値）と、節。同じ種類で同じ名前の節は、同じもの（種類と名前を合わせて渡す）
          if (node.kind === "badField" || node.kind === "unknown") await adapter.executeCommand({ name: "Stray", input: { index, form: node.kind === "badField" ? "bad-field" : "unknown" } });
          else await adapter.executeCommand({ name: "Child", input: { index, slot: slotOf(node.kind), named: node.name !== undefined, identity: `${node.kind}:${node.name ?? ""}` } });
        }
        ending = true;
        await adapter.executeCommand({
          name: "EndParent",
          input: {
            isComponent: parent.kind === "component",
            hasInit: initIndex >= 0,
            initIndex: Math.max(initIndex, 0),
            init: initIndex >= 0 ? String(parent.children[initIndex].value) : "",
            stateCount: states.length,
          },
        });
      } finally {
        await adapter.teardownIsolation();
      }
      for (const [index, node] of parent.children.entries()) {
        for (const code of reports.get(index) ?? []) found.push({ code, parent, node });
        if (descend.has(index)) await visit(node);
      }
      for (const code of atEnd) found.push({ code, parent, node: parent.children[initIndex] });
    };
    await visit(root);
    return found;
  },
};

// 葉の検査 (leaf-check)。事実の列 (leafEvents) を1つずつ渡す。報告は、直前に渡した事実についてのもの
export const leafCheckPart: Stage1Part<LeafFacts, LeafReport[]> = {
  component: "leaf-check",
  async run(adapter, facts) {
    const found: LeafReport[] = [];
    let current: ReturnType<typeof leafEvents> extends Generator<infer E> ? E : never;
    const events = [...leafEvents(facts)];
    await adapter.setupIsolation({
      queries: leafQueries,
      effects: { Report: ({ code }: { code: LeafReport["code"] }) => void found.push({ code, event: current }) },
    });
    try {
      for (const event of events) {
        current = event;
        await adapter.executeCommand({ name: event.name, input: event.input });
      }
    } finally {
      await adapter.teardownIsolation();
    }
    return found;
  },
};

// 宣言の検査 (type-check)。事実の列を1つの隔離で順に渡す。報告は、直前に渡した事実についてのもの
export const typeCheck: Stage1Part<DeclaredEvent[], DeclaredReport[]> = {
  component: "type-check",
  async run(adapter, events) {
    const found: DeclaredReport[] = [];
    let current: DeclaredEvent;
    await adapter.setupIsolation({
      queries: {},
      effects: { Report: ({ code, owner }: { code: DeclaredReport["code"]; owner: string }) => void found.push({ code, owner, event: current }) },
    });
    try {
      for (const event of events) {
        current = event;
        await adapter.executeCommand({ name: event.name, input: event.input });
      }
    } finally {
      await adapter.teardownIsolation();
    }
    return found;
  },
};
// IR を作るときの宣言の検査（型・列・約束と、失敗の条件）を Stage 1 で。失敗の条件は、どれについての判断かを鍵で引く
async function stage1Declared(input: SpecInput): Promise<{ reports: DeclaredReport[]; failures: Map<string, DeclaredReport[]> } | undefined> {
  if (!input.model) return undefined;
  const reports = await runStage1(typeCheck, [...declaredEvents(input)]);
  const failureFacts = [...failureEvents(input)];
  const decided = await runStage1(typeCheck, failureFacts);
  if (!reports || !decided) return undefined;
  const failures = new Map<string, DeclaredReport[]>();
  for (const event of failureFacts) {
    if (event.name !== "Failure") continue;
    const key = failureKey(event.where.behavior, event.where.caseName, event.where.sentence);
    failures.set(key, decided.filter((found) => found.event === event));
  }
  return { reports, failures };
}

// 仕様を読み込むときの判断（木の検査と葉の検査）を、使える中でいちばん新しい Stage で下す。loadSpecs の judges に渡す
export const loadJudges: LoadJudges = {
  tree: async (tree) => (await runStage1(treeCheck, tree))?.map(treeDiagnostic),
  leaf: async (facts) => (await runStage1(leafCheckPart, facts))?.map(leafMessage),
  claims: (events) => runStage1(typeCheck, events),
};

// これまでの呼び方（テストが、偽のアダプターの場所を渡して使う）
export const stage1References = (input: SpecInput, url = STAGE1_ADAPTER) => runStage1(referenceCheck, input, url);
export const stage1Payloads = (input: SpecInput, url?: string) => runStage1(payloadCheck, input, url);
export const stage1Values = (input: SpecInput, url?: string) => runStage1(valueWriter, input, url);

// IR を作るときの判断を、使える中でいちばん新しい Stage で実行した結果を、extract に渡す形で返す
export const references = async (input: SpecInput) => {
  const [found, slots, values, declared] = [await runStage1(referenceCheck, input), await runStage1(payloadCheck, input), await runStage1(valueWriter, input), await stage1Declared(input)];
  return { ...(found ? { references: found } : {}), ...(slots ? { slots } : {}), ...(values ? { values } : {}), ...(declared ? { declared } : {}) };
};
