import { isDeepStrictEqual, parseArgs } from "node:util";
import fc from "fast-check";
import { createState, evaluateConditions, getCondition, getInvariant } from "@aac/core";
import type { FieldSchema } from "@aac/core";
import type { SpecInput, SpecModel } from "./extract.ts";
import { loadSpecs } from "./loader.ts";

// 生成された verify.ts から呼ばれる PBT ランタイム。
// 1回の試行は「初期状態から始まるアクション列」。期待値は仕様 (Layer 1/2) を具体値で実行して得る。
// 本番システムの依存は代役 (Ports) に置き換え、問い合わせには生成した答えを返し、指示は記録して照合する。

type Fn = (...args: any[]) => any;

export type Ports = { queries: Record<string, Fn>; commands: Record<string, Fn> };

export type Adapter = {
  setupIsolation(ports: any): Promise<void>;
  teardownIsolation(): Promise<void>;
  executeAction(action: any): Promise<void>;
  getCurrentState(): Promise<unknown>;
};

type Values = Record<string, unknown>;
type RawStep = { pick: number; inputs: Record<string, Values>; queries: Values };
type Observation = { state: unknown; commands: unknown };

// data は、そのアクションの実行前に部品が覚えているはずのデータ。case は成立した条件（無ければ "default"）
export type Step = { from: string; data: Values; action: string; input: Values; queries: Values; case: string };

export type PbtResult =
  | { status: "pass"; seed: number; numRuns: number }
  | {
      status: "fail";
      seed: number;
      path: string;
      numRuns: number;
      numShrinks: number;
      // 初期状態から実行したアクション列。最後の1つで不一致が起きた（空なら初期状態が違う）
      steps: Step[];
      expected: Observation;
      actual: Observation | { error: string };
    }
  // 仕様またはハーネス側の問題。実装の誤りではないので、エージェントには差し戻さない
  | { status: "error"; message: string; steps?: Step[] };

export const RESULT_PREFIX = "AAC_RESULT ";
const MAX_STEPS = 8;

// 仕様の評価中に起きた問題（条件の衝突、結び付け漏れ、不変条件の破れ、型に合わない値）
class SpecError extends Error {
  steps: Step[];
  constructor(message: string, steps: Step[]) {
    super(message);
    this.name = "SpecError";
    this.steps = steps;
  }
}

const isNumberSchema = (schema: FieldSchema): schema is Extract<FieldSchema, { type: string }> =>
  typeof schema === "object" && !Array.isArray(schema);

function arbitraryOf(schema: FieldSchema): fc.Arbitrary<unknown> {
  if (schema === "boolean") return fc.boolean();
  if (schema === "string") return fc.string();
  if (!isNumberSchema(schema) && typeof schema !== "string") return fc.constantFrom(...schema);

  const { type, min, max, around = [] } = isNumberSchema(schema) ? schema : { type: schema as "integer" | "number" };
  const base =
    type === "integer"
      ? fc.integer({ min: min ?? -(2 ** 31), max: max ?? 2 ** 31 - 1 })
      : fc.double({ min, max, noNaN: true, noDefaultInfinity: true });
  // 範囲の端と、しきい値の前後を重点的に生成する（「以上」と「より大きい」の取り違えを見つけるため）。
  // しきい値にちょうど当たる入力は一様な乱数ではまず出ないので、半分はここから選ぶ
  const valid = (values: (number | undefined)[]) => [
    ...new Set(values.filter((value): value is number => value !== undefined && conforms(schema, value))),
  ];
  const limits = valid([min, max]);
  const thresholds = valid(around.flatMap((value) => (type === "integer" ? [value - 1, value, value + 1] : [value])));
  const choices: fc.WeightedArbitrary<unknown>[] = [{ weight: 2, arbitrary: base }];
  if (limits.length > 0) choices.push({ weight: 1, arbitrary: fc.constantFrom(...limits) });
  if (thresholds.length > 0) choices.push({ weight: 3, arbitrary: fc.constantFrom(...thresholds) });
  return choices.length === 1 ? base : fc.oneof(...choices);
}

function conforms(schema: FieldSchema, value: unknown): boolean {
  if (schema === "boolean" || schema === "string") return typeof value === schema;
  if (!isNumberSchema(schema) && typeof schema !== "string") return schema.includes(value as string);
  const { type, min, max } = isNumberSchema(schema) ? schema : { type: schema as "integer" | "number" };
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    (type !== "integer" || Number.isInteger(value)) &&
    (min === undefined || value >= min) &&
    (max === undefined || value <= max)
  );
}

const recordOf = (fields: Record<string, FieldSchema>) =>
  fc.record(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, arbitraryOf(schema)])));

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const messageOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

// 仕様側のシミュレーション。実装には触れず、仕様だけで「次に何が起きるべきか」を進める
function simulator(input: SpecInput, model: SpecModel) {
  const actions = Object.keys(input.behaviors).sort();

  const sequences = fc.array(
    fc.record({
      pick: fc.nat(),
      inputs: fc.record(Object.fromEntries(actions.map((name) => [name, recordOf(model.actions[name] ?? {})]))),
      queries: recordOf(model.queries),
    }),
    { minLength: 1, maxLength: MAX_STEPS },
  );

  const start = () => ({
    status: model.initial,
    // 未設定のデータも undefined のキーとして持つ（createState が状態コンストラクタと区別できるように）
    data: Object.fromEntries(Object.keys(model.data).map((field) => [field, undefined])) as Values,
  });

  const checkInvariants = (state: { status: string; data: Values }, steps: Step[]) => {
    for (const name of model.invariants ?? []) {
      const invariant = getInvariant(name);
      if (!invariant) throw new SpecError(`不変条件 "${name}" に評価関数がありません`, steps);
      if (!invariant({ status: state.status, ...state.data })) {
        throw new SpecError(`不変条件が破れました: "${name}" (状態 ${state.status}, データ ${JSON.stringify(state.data)})`, steps);
      }
    }
  };

  // 1手進める。実行できるアクションが無ければ undefined。仕様の評価に失敗したら SpecError
  const next = (state: { status: string; data: Values }, raw: RawStep, steps: Step[]) => {
    try {
      const contextOf = (name: string) => ({ status: state.status, ...state.data, ...raw.queries, ...raw.inputs[name] });
      const enabled = actions.filter((name) => {
        const behavior = input.behaviors[name];
        return (
          (behavior.from ?? model.states).includes(state.status) &&
          (behavior.where ?? []).every((text) => {
            const condition = getCondition(text);
            if (!condition) throw new Error(`事前条件 "${text}" に評価関数がありません`);
            return condition(contextOf(name));
          })
        );
      });
      if (enabled.length === 0) return undefined;

      const action = enabled[raw.pick % enabled.length];
      const context = contextOf(action);
      const cases = input.behaviors[action].cases;
      const matched = evaluateConditions(Object.keys(cases), context);
      const step: Step = { from: state.status, data: plain(state.data), action, input: raw.inputs[action], queries: raw.queries, case: matched };
      steps.push(step);

      const transition = cases[matched](createState(context)) as any;
      if (!model.states.includes(transition?.nextState)) throw new Error(`case が状態への遷移を返していません`);
      for (const [field, value] of Object.entries(transition.set ?? {})) {
        if (!(field in model.data)) throw new Error(`set: モデルの data に "${field}" がありません`);
        if (!conforms(model.data[field], value)) throw new Error(`set: ${field} = ${JSON.stringify(value)} が宣言した型・範囲に合いません`);
      }
      for (const command of transition.effects as { action: string; payload: Values }[]) {
        const fields = model.commands[command.action];
        if (!fields) throw new Error(`モデルの commands に "${command.action}" がありません`);
        for (const [field, schema] of Object.entries(fields)) {
          if (!conforms(schema, command.payload?.[field])) {
            throw new Error(`${command.action}.${field} = ${JSON.stringify(command.payload?.[field])} が宣言した型・範囲に合いません`);
          }
        }
      }

      const after = { status: transition.nextState as string, data: { ...state.data, ...transition.set } as Values };
      checkInvariants(after, steps);
      return { step, expected: plain({ state: transition.nextState, commands: transition.effects }) as Observation, after };
    } catch (error) {
      throw error instanceof SpecError ? error : new SpecError(messageOf(error), steps);
    }
  };

  return { actions, sequences, start, next, checkInvariants };
}

// 仕様の事前検査: 実装なしで、仕様だけをランダムなアクション列で実行する。
// 条件の衝突、結び付け漏れ、不変条件の破れ、宣言した型に合わない値を、LLM を呼ぶ前に見つける。
export async function selfCheck(
  input: SpecInput,
  params: { seed?: number; numRuns?: number } = {},
): Promise<{ ok: true; numRuns: number } | { ok: false; message: string; steps: Step[] }> {
  const model = input.model;
  if (!model) return { ok: false, message: "仕様にコンポーネントがありません", steps: [] };
  const sim = simulator(input, model);

  const walk = (raw: RawStep[]) => {
    const steps: Step[] = [];
    let state = sim.start();
    sim.checkInvariants(state, steps);
    for (const rawStep of raw) state = sim.next(state, rawStep, steps)?.after ?? state;
  };
  const details = await fc.check(fc.property(sim.sequences, (raw) => walk(raw)), { numRuns: 500, ...params });
  if (!details.failed) return { ok: true, numRuns: details.numRuns };
  try {
    walk(details.counterexample![0]);
  } catch (error) {
    if (error instanceof SpecError) return { ok: false, message: error.message, steps: error.steps };
    throw error;
  }
  return { ok: false, message: "仕様の検査に失敗しましたが、再現できませんでした", steps: [] };
}

export async function runPbt(options: { specs: string; adapter: Adapter; args?: string[] }): Promise<PbtResult> {
  const { values } = parseArgs({
    args: options.args ?? process.argv.slice(2),
    options: { seed: { type: "string" }, path: { type: "string" }, runs: { type: "string" } },
  });
  const result = await check(options.specs, options.adapter, {
    seed: values.seed === undefined ? undefined : Number(values.seed),
    path: values.path,
    numRuns: values.runs === undefined ? 200 : Number(values.runs),
  });
  console.log(RESULT_PREFIX + JSON.stringify(result));
  if (result.status !== "pass") process.exitCode = 1;
  return result;
}

async function check(
  specs: string,
  adapter: Adapter,
  params: { seed?: number; path?: string; numRuns: number },
): Promise<PbtResult> {
  const input = await loadSpecs(specs);
  const model = input.model;
  if (!model) return { status: "error", message: "仕様にコンポーネントがありません" };
  const sim = simulator(input, model);
  if (sim.actions.length === 0) return { status: "error", message: "検証する behavior がありません" };

  // 1試行を実行し、不一致があればその内容を返す。仕様側の問題は SpecError として投げる
  const trial = async (raw: RawStep[]) => {
    const steps: Step[] = [];
    let current: Step | undefined;
    let recorded: unknown[] = [];

    const ports: Ports = {
      queries: Object.fromEntries(
        Object.keys(model.queries).map((name) => [
          name,
          () => {
            if (!current) throw new Error(`ports.queries.${name}() was called before any action; ask during the action instead`);
            return current.queries[name];
          },
        ]),
      ),
      commands: Object.fromEntries(
        Object.keys(model.commands).map((action) => [
          action,
          (payload: unknown) => void recorded.push({ action, payload: plain(payload ?? {}) }),
        ]),
      ),
    };

    let expected: Observation = { state: model.initial, commands: [] };
    try {
      await adapter.setupIsolation(ports);
      try {
        let state = sim.start();
        const initial = plain({ state: await adapter.getCurrentState(), commands: recorded });
        if (!isDeepStrictEqual(expected, initial)) return { steps, expected, actual: initial };

        for (const rawStep of raw) {
          const planned = sim.next(state, rawStep, steps);
          if (!planned) continue;
          expected = planned.expected;
          current = planned.step;
          recorded = [];
          await adapter.executeAction({ name: current.action, input: structuredClone(current.input) });
          const actual = plain({ state: await adapter.getCurrentState(), commands: recorded });
          if (!isDeepStrictEqual(expected, actual)) return { steps, expected, actual };
          state = planned.after;
        }
      } finally {
        await adapter.teardownIsolation();
      }
    } catch (error) {
      if (error instanceof SpecError) throw error;
      return { steps, expected, actual: { error: messageOf(error) } };
    }
    return undefined;
  };

  const details = await fc.check(
    fc.asyncProperty(sim.sequences, async (raw) => (await trial(raw)) === undefined),
    params,
  );
  if (!details.failed) return { status: "pass", seed: details.seed, numRuns: details.numRuns };
  if (!details.counterexample) return { status: "error", message: "反例を特定できませんでした" };

  try {
    const failure = await trial(details.counterexample[0]);
    if (!failure) return { status: "error", message: "反例を再現できませんでした（本番システムが非決定的な可能性があります）" };
    return {
      status: "fail",
      seed: details.seed,
      path: details.counterexamplePath ?? "",
      numRuns: details.numRuns,
      numShrinks: details.numShrinks,
      ...failure,
    };
  } catch (error) {
    if (error instanceof SpecError) return { status: "error", message: `仕様の誤り: ${error.message}`, steps: error.steps };
    throw error;
  }
}
