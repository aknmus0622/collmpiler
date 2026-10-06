import { isDeepStrictEqual, parseArgs } from "node:util";
import fc from "fast-check";
import { createState, getPrecondition } from "@aac/core";
import type { FieldSchema } from "@aac/core";
import { loadSpecs } from "./loader.ts";

// 生成された verify.ts から呼ばれる PBT ランタイム。
// 1回の試行は「初期状態から始まるアクション列」。期待値は仕様 (Layer 1/2) を具体値で実行して得る。
// 本番システムの依存は代役 (Ports) に置き換え、問い合わせには生成した答えを返し、指示は記録して照合する。

type Fn = (...args: any[]) => any;

export type Ports = {
  queries: Record<string, Fn>;
  outcomes: Record<string, Fn>;
  commands: Record<string, Fn>;
};

export type Adapter = {
  setupIsolation(ports: any): Promise<void>;
  teardownIsolation(): Promise<void>;
  executeAction(action: any): Promise<void>;
  getCurrentState(): Promise<unknown>;
};

type Values = Record<string, unknown>;
type RawStep = { pick: number; outcomePick: number; inputs: Record<string, Values>; queries: Values };
type Observation = { state: unknown; commands: unknown };

// data は、そのアクションの実行前に部品が覚えているはずのデータ
export type Step = { from: string; data: Values; action: string; input: Values; queries: Values; outcome: string };

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
  | { status: "error"; message: string };

export const RESULT_PREFIX = "AAC_RESULT ";
const MAX_STEPS = 8;

function arbitraryOf(schema: FieldSchema): fc.Arbitrary<unknown> {
  if (schema === "boolean") return fc.boolean();
  if (schema === "number") return fc.double({ noNaN: true, noDefaultInfinity: true });
  if (schema === "string") return fc.string();
  return fc.constantFrom(...schema);
}

const recordOf = (fields: Record<string, FieldSchema>) =>
  fc.record(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, arbitraryOf(schema)])));

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const messageOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

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
  if (!model) return { status: "error", message: "仕様に DomainModel がありません" };
  const actions = Object.keys(input.behaviors).sort();
  if (actions.length === 0) return { status: "error", message: "検証する behavior がありません" };

  // 1試行を実行し、不一致があればその内容を返す
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
      outcomes: Object.fromEntries(
        actions.map((action) => [
          action,
          () => {
            if (current?.action !== action) throw new Error(`ports.outcomes.${action}() was called while "${action}" was not executing`);
            return current.outcome;
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
        let status = model.initial;
        // 未設定のデータも undefined のキーとして持つ（createState が状態コンストラクタと区別できるように）
        let data: Values = Object.fromEntries(Object.keys(model.data).map((field) => [field, undefined]));
        const initial = plain({ state: await adapter.getCurrentState(), commands: recorded });
        if (!isDeepStrictEqual(expected, initial)) return { steps, expected, actual: initial };

        for (const { pick, outcomePick, inputs, queries } of raw) {
          const contextOf = (name: string) => ({ status, ...data, ...queries, ...inputs[name] });
          // 現在の状態で実行でき、事前条件 (where) を満たすアクションだけが対象
          const enabled = actions.filter((name) => {
            const behavior = input.behaviors[name];
            return (
              (behavior.from ?? model.states).includes(status) &&
              (behavior.where ?? []).every((text) => getPrecondition(text)?.(contextOf(name)))
            );
          });
          if (enabled.length === 0) continue;
          const action = enabled[pick % enabled.length];
          const outcomes = Object.keys(input.behaviors[action].cases).sort();
          const outcome = outcomes[outcomePick % outcomes.length];

          const transition = input.behaviors[action].cases[outcome](createState(contextOf(action))) as any;
          expected = plain({ state: transition.nextState, commands: transition.effects });

          current = { from: status, data: plain(data), action, input: inputs[action], queries, outcome };
          steps.push(current);
          recorded = [];
          await adapter.executeAction({ name: action, input: structuredClone(inputs[action]) });
          const actual = plain({ state: await adapter.getCurrentState(), commands: recorded });
          if (!isDeepStrictEqual(expected, actual)) return { steps, expected, actual };
          status = transition.nextState;
          data = { ...data, ...transition.set };
        }
      } finally {
        await adapter.teardownIsolation();
      }
    } catch (error) {
      return { steps, expected, actual: { error: messageOf(error) } };
    }
    return undefined;
  };

  const sequences = fc.array(
    fc.record({
      pick: fc.nat(),
      outcomePick: fc.nat(),
      inputs: fc.record(Object.fromEntries(actions.map((name) => [name, recordOf(model.actions[name] ?? {})]))),
      queries: recordOf(model.queries),
    }),
    { minLength: 1, maxLength: MAX_STEPS },
  );
  const details = await fc.check(
    fc.asyncProperty(sequences, async (raw) => (await trial(raw)) === undefined),
    params,
  );
  if (!details.failed) return { status: "pass", seed: details.seed, numRuns: details.numRuns };
  if (!details.counterexample) return { status: "error", message: "反例を特定できませんでした" };

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
}
