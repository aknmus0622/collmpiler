import { isDeepStrictEqual, parseArgs } from "node:util";
import fc from "fast-check";
import { createState, getPrecondition } from "@aac/core";
import type { FieldSchema } from "@aac/core";
import { loadSpecs } from "./loader.ts";

// 生成された verify.ts から呼ばれる PBT ランタイム。
// 期待値は仕様 (Layer 1/2) を具体値で実行して得る。実際の値はアダプター経由で本番システムから得る。

export type Adapter = {
  setupIsolation(): Promise<void>;
  teardownIsolation(): Promise<void>;
  givenState(state: any, data: any): Promise<void>;
  executeAction(action: any, outcome: any): Promise<void>;
  getCurrentState(): Promise<unknown>;
  getFiredCommands(): Promise<unknown[]>;
};

type Scenario = { action: string; outcome: string; data: Record<string, unknown> };
type Observation = { state: unknown; commands: unknown };

export type PbtResult =
  | { status: "pass"; seed: number; numRuns: number }
  | {
      status: "fail";
      seed: number;
      path: string;
      numRuns: number;
      numShrinks: number;
      given: { state: string; data: Record<string, unknown> };
      action: string;
      outcome: string;
      expected: Observation;
      actual: Observation | { error: string };
    }
  | { status: "error"; message: string };

export const RESULT_PREFIX = "AAC_RESULT ";

function arbitraryOf(schema: FieldSchema): fc.Arbitrary<unknown> {
  if (schema === "boolean") return fc.boolean();
  if (schema === "number") return fc.double({ noNaN: true, noDefaultInfinity: true });
  if (schema === "string") return fc.string();
  return fc.constantFrom(...schema);
}

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

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

  const refs = Object.entries(input.behaviors).flatMap(([action, behavior]) =>
    Object.keys(behavior.cases).map((outcome) => ({ action, outcome })),
  );
  if (refs.length === 0) return { status: "error", message: "検証する behavior がありません" };

  const expectedOf = ({ action, outcome, data }: Scenario): Observation => {
    const transition = input.behaviors[action].cases[outcome](createState(data)) as any;
    return plain({ state: transition.nextState, commands: transition.effects });
  };

  const actualOf = async ({ action, outcome, data }: Scenario): Promise<Observation | { error: string }> => {
    try {
      await adapter.setupIsolation();
      try {
        await adapter.givenState(model.initial, structuredClone(data));
        await adapter.executeAction(action, outcome);
        return plain({ state: await adapter.getCurrentState(), commands: await adapter.getFiredCommands() });
      } finally {
        await adapter.teardownIsolation();
      }
    } catch (error) {
      return { error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  };

  const scenarios = fc.record({
    ref: fc.constantFrom(...refs),
    data: fc.record(Object.fromEntries(Object.entries(model.data).map(([key, schema]) => [key, arbitraryOf(schema)]))),
  });

  const property = fc.asyncProperty(scenarios, async ({ ref, data }) => {
    // 事前条件 (where) を満たす状態だけを検証する
    fc.pre((input.behaviors[ref.action].where ?? []).every((text) => getPrecondition(text)?.(data)));
    const scenario = { ...ref, data };
    return isDeepStrictEqual(expectedOf(scenario), await actualOf(scenario));
  });

  const details = await fc.check(property, params);
  if (!details.failed) return { status: "pass", seed: details.seed, numRuns: details.numRuns };
  if (!details.counterexample) {
    return { status: "error", message: "事前条件を満たす入力を生成できませんでした" };
  }

  const [{ ref, data }] = details.counterexample;
  const scenario = { ...ref, data };
  return {
    status: "fail",
    seed: details.seed,
    path: details.counterexamplePath ?? "",
    numRuns: details.numRuns,
    numShrinks: details.numShrinks,
    given: { state: model.initial, data },
    action: ref.action,
    outcome: ref.outcome,
    expected: expectedOf(scenario),
    actual: await actualOf(scenario),
  };
}
