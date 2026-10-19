import { referenceEvents, valuesToWrite, writeEvent } from "./extract.ts";
import type { ReferenceDiagnostic, SpecInput } from "./extract.ts";
import { slotQueries, slotsOf } from "./slots.ts";
import type { SlotReport } from "./slots.ts";
import { EXTRA_SEEDS } from "./runtime.ts";
import type { Adapter, CellTrial, Unobservable } from "./runtime.ts";
import { fileURLToPath } from "node:url";
import { GRAMMAR, leafEvents, leafMessage, leafQueries, slotOf, treeDiagnostic } from "@clp/core";
import type { FieldSchema, LeafFacts, LeafReport, Node, TreeReport } from "@clp/core";
import type { LoadJudges } from "./loader.ts";
import { hashFiles, staleness } from "./verified.ts";
import { judgeEvents, judgeStage0 } from "./mutation.ts";
import { changedFileStage0, mutationSiteStage0, partFileStage0, removedInputStage0, sandboxFileStage0, testsStage0, wiringStage0 } from "./rules.ts";
// 出口の門の判定の Stage 0 (事例の集まりで、生成した部品と比べる相手)
const GATE_RULES_STAGE0 = {
  SandboxFile: sandboxFileStage0,
  Removed: removedInputStage0,
  PartFile: partFileStage0,
  Wiring: wiringStage0,
  Tests: testsStage0,
  ChangedFile: changedFileStage0,
  Site: mutationSiteStage0,
} as const;
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { isSource } from "./layout.ts";
import type { Workspace } from "./layout.ts";
const CLP_BIN = fileURLToPath(new URL("../bin/clp.ts", import.meta.url));
import type { JudgeEvent, JudgeReport } from "./mutation.ts";
import { contractFacts, innerSchemas, registerContractPlan, typeFactsOf } from "./generate.ts";
import type { ContractPlan, ContractSections, Ir, NoteId } from "./generate.ts";
import type { RequestFacts, RequestSections } from "./request.ts";
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

// --- 採点の部品 (SELF_HOSTING.md §10.3) ---
// 採点の判定と意味の実行の部品 (R1 の部品)。値は、対になる Stage 0 (手書き) のファイル（packages/cli/src からの相対パス）。
// これらは、つねに Stage 0 が採点し (R1)、その記録があるときだけ使い (R2)、人が Stage 0 を直したら使わない (R5)
export const R1_COMPONENTS: Record<string, readonly string[]> = {
  "mutation-judge": ["mutation.ts"],
  "gate-rules": ["rules.ts"],
};
export const stage0HashOf = (component: string) => hashFiles(fileURLToPath(new URL(".", import.meta.url)), R1_COMPONENTS[component] ?? []);
// R1: 採点の部品を作り直す実行では、採点の判断をすべて Stage 0 が下す。切り替えるオプションは持たない
let gradingByStage0 = false;
export const setGradingByStage0 = (on: boolean) => void (gradingByStage0 = on);
export const isGradingByStage0 = () => gradingByStage0;

// 採点の判断を下す (R4)。Stage 0 はいつも判断し、Stage 1 が使えれば両方の厳しい側を取る（strict）。食い違えば知らせる（止めない）。
// 甘い Stage 1 が、Stage 0 なら落とすものを通すことはない
export async function grade<I, R>(part: Stage1Part<I, R>, input: I, stage0: R, strict: (a: R, b: R) => R, same: (a: R, b: R) => boolean): Promise<R> {
  if (gradingByStage0) return stage0;
  const stage1 = await runStage1(part, input);
  if (stage1 === undefined) return stage0;
  if (!same(stage0, stage1)) console.error(`注意: 採点の判断が、Stage 0 と Stage 1 (${part.component}) で食い違いました。厳しい側を取ります`);
  return strict(stage0, stage1);
}

// Stage 1 のコンポーネントを、生成された契約 (アダプター) として読み込む。使えなければ undefined
export async function stage1Adapter(component: string, url = adapterUrl(component)): Promise<Adapter | undefined> {
  if (process.env.CLP_STAGE === "0") return undefined;
  // 使うのは、検証に合格した、いまの仕様の版だけ。作りかけのコードや、合格のあとで書き換えられたコードは使わない
  if (url === adapterUrl(component)) {
    const record = fileURLToPath(new URL(`../self/clp/${component}.verified.json`, import.meta.url));
    const grading = component in R1_COMPONENTS ? { stage0: stage0HashOf(component) } : undefined;
    const stale = staleness(record, fileURLToPath(new URL("../self/specs", import.meta.url)), grading);
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

// 文面の判断 (text-plan)。契約に現れる型を、中から順に書き、注記と節を決める。結果は、生成の前に登録する
export const contractPlan: Stage1Part<Ir, ContractPlan> = {
  component: "text-plan",
  async run(adapter, ir) {
    const facts = contractFacts(ir);
    const plan: ContractPlan = { types: new Map(), notes: new Map(), sections: new Map() };
    const written = new Map<string, string>();
    await adapter.setupIsolation({ queries: {}, effects: {} });
    try {
      // 中の型を先に書き、その文を使って外の型の事実を作る
      const write = async (schema: FieldSchema): Promise<string> => {
        const key = JSON.stringify(schema);
        if (written.has(key)) return written.get(key)!;
        for (const inner of innerSchemas(schema)) await write(inner);
        const typeFacts = typeFactsOf(schema, (inner) => written.get(JSON.stringify(inner))!);
        const text = (await adapter.executeCommand({ name: "TypeText", input: typeFacts })) as string;
        written.set(key, text);
        plan.types.set(JSON.stringify(typeFacts), text);
        return text;
      };
      for (const schema of facts.schemas) await write(schema);
      for (const noted of facts.notes) {
        const key = JSON.stringify(noted);
        if (!plan.notes.has(key)) plan.notes.set(key, (await adapter.executeCommand({ name: "QueryNotes", input: noted })) as NoteId[]);
      }
      plan.sections.set(JSON.stringify(facts.sections), (await adapter.executeCommand({ name: "ContractSections", input: facts.sections })) as ContractSections);
    } finally {
      await adapter.teardownIsolation();
    }
    return plan;
  },
};
// 契約の判断を Stage 1 で下して、登録する（使えなければ、何もしない: 生成は Stage 0 の判断で行う）
export async function planContract(ir: Ir): Promise<void> {
  const plan = await runStage1(contractPlan, ir);
  if (plan) registerContractPlan(ir, plan);
}
export const requestPlan: Stage1Part<RequestFacts, RequestSections> = {
  component: "text-plan",
  async run(adapter, facts) {
    const [answer] = await session(adapter, { queries: {}, effects: {} }, [{ name: "RequestSections", input: { ...facts, attempt: Math.min(facts.attempt, 10) } }]);
    return answer as RequestSections;
  },
};

// ミューテーションの合否 (mutation-judge、採点の部品)。報告は、直前に渡した事実についてのもの
export const judgePart: Stage1Part<JudgeEvent[], JudgeReport[]> = {
  component: "mutation-judge",
  async run(adapter, events) {
    const found: JudgeReport[] = [];
    let current: JudgeEvent;
    const report = (code: JudgeReport["code"]) => () => void found.push({ code, event: current });
    await adapter.setupIsolation({ queries: {}, effects: { Survived: report("survived"), InAdapter: report("in-adapter"), Ineffective: report("ineffective") } });
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
// 合否を下す: Stage 0 と Stage 1 の報告を合わせる（どちらかが報告したものは、報告する）
export async function judgeDecided(events: JudgeEvent[]): Promise<JudgeReport[]> {
  const key = (found: JudgeReport) => `${found.code}\u0000${events.indexOf(found.event)}`;
  const union = (a: JudgeReport[], b: JudgeReport[]) => {
    const seen = new Set(a.map(key));
    return [...a, ...b.filter((found) => !seen.has(key(found)))].sort((x, y) => events.indexOf(x.event) - events.indexOf(y.event));
  };
  const same = (a: JudgeReport[], b: JudgeReport[]) => a.length === b.length && a.every((found, index) => key(found) === key(b[index]));
  return grade(judgePart, events, judgeStage0(events), union, same);
}

// 出口の門の判定 (gate-rules、採点の部品)。問い1つを、1回の隔離で尋ねる
const gateRulesPart: Stage1Part<{ name: string; input: object }, unknown> = {
  component: "gate-rules",
  async run(adapter, question) {
    const [answer] = await session(adapter, { queries: {}, effects: {} }, [question]);
    return answer;
  },
};
// 判定を下す (R4): Stage 0 と、使えれば Stage 1 の厳しい側。strict は、2つの判定から厳しいほうを選ぶ
export function gateVerdict<R>(name: string, facts: object, stage0: R, strict: (a: R, b: R) => R): Promise<R> {
  return grade(gateRulesPart as Stage1Part<{ name: string; input: object }, R>, { name, input: facts }, stage0, strict, (a, b) => JSON.stringify(a) === JSON.stringify(b));
}

// 採点の部品の事例の集まり (R3)。事例は入力だけ（期待値は持たない: 同じ入力で Stage 0 が判断したもの）。
// compare は、1つの事例を Stage 0 と、渡したアダプターの両方で判断し、食い違えばその説明を返す
export const R1_CASES: Record<string, { compare(adapter: Adapter, given: unknown): Promise<string | undefined> }> = {
  "gate-rules": {
    async compare(adapter, given) {
      const { name, input } = given as { name: keyof typeof GATE_RULES_STAGE0; input: never };
      const stage0 = GATE_RULES_STAGE0[name](input);
      const stage1 = await gateRulesPart.run(adapter, { name, input });
      return JSON.stringify(stage0) === JSON.stringify(stage1) ? undefined : `${name} ${JSON.stringify(input)}: Stage 0 ${JSON.stringify(stage0)}、Stage 1 ${JSON.stringify(stage1)}`;
    },
  },
  "mutation-judge": {
    async compare(adapter, given) {
      const { mutants, values, adapter: adapterSource, shared } = given as { mutants: { value?: string | number; killed: boolean }[]; values: (string | number)[]; adapter: string; shared: boolean };
      const report = { strategy: "cases", mutants: mutants.map((mutant, index) => ({ file: "src/x.ts", line: index + 1, original: String(mutant.value ?? index), mutated: "", killed: mutant.killed, ...(mutant.value === undefined ? {} : { value: mutant.value }) })) };
      const events = [...judgeEvents(report, values, adapterSource, shared)];
      const key = (found: JudgeReport) => `${found.code}@${events.indexOf(found.event)}`;
      const stage0 = judgeStage0(events).map(key);
      const stage1 = (await judgePart.run(adapter, events)).map(key);
      return JSON.stringify(stage0) === JSON.stringify(stage1) ? undefined : `Stage 0 ${JSON.stringify(stage0)}、Stage 1 ${JSON.stringify(stage1)}`;
    },
  },
};

// 事例の集まりを、いま作ったコードで流す（別のプロセスで、実行した関数を記録しながら）。
// problem: Stage 0 と食い違った（記録を書かない）。unexecuted: 一度も実行されなかった関数（事例を足すのは人）
export function runCases(specsDir: string, ws: Workspace, component: string): { problem?: string; unexecuted: string[] } {
  const cases = join(specsDir, "..", "cases", `${component}.json`);
  if (!existsSync(cases)) return { problem: `事例の集まりがありません (${cases})`, unexecuted: [] };
  const coverage = mkdtempSync(join(tmpdir(), "clp-cases-"));
  try {
    const run = spawnSync(process.execPath, [CLP_BIN, "__cases", "--component", component, "--adapter", join(ws.root, ws.paths.adapter), "--cases", cases], {
      encoding: "utf8",
      timeout: 300_000,
      env: { ...process.env, NODE_V8_COVERAGE: coverage },
    });
    if (run.status !== 0) return { problem: `事例を流せませんでした: ${(run.stderr ?? "").trim().slice(-500)}`, unexecuted: [] };
    const result = JSON.parse(run.stdout) as { problem?: string };
    return { ...result, unexecuted: unexecutedFunctions(coverage, ws) };
  } finally {
    rmSync(coverage, { recursive: true, force: true });
  }
}
// 本番コードのうち、読み込まれたファイルの中で、一度も呼ばれなかった関数（モジュールそのものは除く）
function unexecutedFunctions(dir: string, ws: Workspace): string[] {
  type Fn = { functionName: string; ranges: { startOffset: number; endOffset: number; count: number }[] };
  const root = realpathSync(ws.root);
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const report = JSON.parse(readFileSync(join(dir, name), "utf8")) as { result?: { url: string; functions: Fn[] }[] };
    for (const script of report.result ?? []) {
      if (!script.url.startsWith("file://")) continue;
      const rel = relative(root, fileURLToPath(script.url)).split(sep).join("/");
      if (rel.startsWith("..") || !isSource(ws, rel) || script.functions.length === 0) continue;
      const size = (fn: Fn) => fn.ranges[0].endOffset - fn.ranges[0].startOffset;
      const module = script.functions.reduce((widest, fn) => (size(fn) > size(widest) ? fn : widest));
      // 読み出し (get / set) は、判断ではないので数えない（状態を外から見るためのもの）
      for (const fn of script.functions) {
        if (fn !== module && fn.ranges[0].count === 0 && fn.functionName !== "" && !/^[gs]et /.test(fn.functionName)) found.push(`${rel}: ${fn.functionName}`);
      }
    }
  }
  return [...new Set(found)].sort();
}

// これまでの呼び方（テストが、偽のアダプターの場所を渡して使う）
export const stage1References = (input: SpecInput, url = STAGE1_ADAPTER) => runStage1(referenceCheck, input, url);
export const stage1Payloads = (input: SpecInput, url?: string) => runStage1(payloadCheck, input, url);
export const stage1Values = (input: SpecInput, url?: string) => runStage1(valueWriter, input, url);

// IR を作るときの判断を、使える中でいちばん新しい Stage で実行した結果を、extract に渡す形で返す
export const references = async (input: SpecInput) => {
  const [found, slots, values, declared] = [await runStage1(referenceCheck, input), await runStage1(payloadCheck, input), await runStage1(valueWriter, input), await stage1Declared(input)];
  return { ...(found ? { references: found } : {}), ...(slots ? { slots } : {}), ...(values ? { values } : {}), ...(declared ? { declared } : {}) };
};
