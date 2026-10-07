import { isDeepStrictEqual, parseArgs } from "node:util";
import fc from "fast-check";
import { activate, matchCondition } from "@clp/core";
import type { BoundSpecification, FieldSchema } from "@clp/core";
import { isReference } from "./extract.ts";
import type { Reference, SpecInput, SpecModel, SpecValue } from "./extract.ts";
import { loadSpecs } from "./loader.ts";
import { conforms, isEnum, isNumberSchema } from "./schema.ts";

// 生成された verify.ts から呼ばれる PBT ランタイム。
// 1回の試行は「初期状態から始まるコマンド列」。期待値は仕様 (Layer 1/2) を具体値で実行して得る。
// 本番システムの依存は代役 (Ports) に置き換え、問い合わせには生成した答えを返し、副作用は記録して照合する。

type Fn = (...args: any[]) => any;

export type Ports = { queries: Record<string, Fn>; effects: Record<string, Fn> };

export type Adapter = {
  setupIsolation(ports: any): Promise<void>;
  teardownIsolation(): Promise<void>;
  executeCommand(command: any): Promise<void>;
  getCurrentState(): Promise<unknown>;
};

type Values = Record<string, unknown>;
type RawStep = { pick: number; inputs: Record<string, Values>; queries: Values };
type Observation = { state: unknown; effects: unknown };

// data は、そのコマンドの実行前に部品が覚えているはずのデータ。case は成立した条件（無ければ "otherwise"）
export type Step = { from: string; data: Values; command: string; input: Values; queries: Values; case: string };

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

export const RESULT_PREFIX = "CLP_RESULT ";
const MAX_STEPS = 8;
// 既定の試行回数（verify.ts を直接実行したとき。ループから呼ぶときは loop.ts が回数を渡す）
const DEFAULT_RUNS = 1000;

// 仕様の評価中に起きた問題（条件の衝突、意味の漏れ、不変条件の破れ、型に合わない値）
class SpecError extends Error {
  steps: Step[];
  constructor(message: string, steps: Step[]) {
    super(message);
    this.name = "SpecError";
    this.steps = steps;
  }
}

// 意味の関数に書かれている定数。入力の生成に混ぜる。
// 自由な文字列や、しきい値を宣言していない数値は、一様な乱数では関数の中の定数にまず当たらないため
// （文字列を "Gold" と比べる条件は、"Gold" を生成しなければ一度も成り立たない）
type Hints = { strings: string[]; numbers: number[] };
function literalsIn(...bindings: BoundSpecification[]): Hints {
  const strings = new Set<string>();
  const numbers = new Set<number>();
  for (const binding of bindings) {
    for (const fn of [binding.conditions, binding.calculations ?? {}, binding.invariants ?? {}].flatMap((group) => Object.values(group))) {
      const source = String(fn);
      for (const match of source.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g)) strings.add(match[1] ?? match[2]);
      for (const match of source.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, "").matchAll(/(?<![\w.$])\d[\d_]*(?:\.\d+)?(?![\w.])/g)) {
        numbers.add(Number(match[0].replaceAll("_", "")));
      }
    }
  }
  return { strings: [...strings].sort(), numbers: [...numbers].filter(Number.isFinite).sort((a, b) => a - b) };
}

function arbitraryOf(schema: FieldSchema, hints: Hints): fc.Arbitrary<unknown> {
  if (schema === "boolean") return fc.boolean();
  if (schema === "string") {
    return hints.strings.length === 0 ? fc.string() : fc.oneof({ weight: 1, arbitrary: fc.string() }, { weight: 1, arbitrary: fc.constantFrom(...hints.strings) });
  }
  if (isEnum(schema)) return fc.constantFrom(...schema);

  // しきい値: 宣言 (around) があればそれを使い、無ければ、意味の関数の中の数値を使う
  const declared = isNumberSchema(schema) ? schema : { type: schema as "integer" | "number" };
  const { type, min, max, around = hints.numbers } = declared;
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

const recordOf = (fields: Record<string, FieldSchema>, hints: Hints) =>
  fc.record(Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, arbitraryOf(schema, hints)])));

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const messageOf = (error: unknown) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

// 仕様側のシミュレーション。実装には触れず、仕様だけで「次に何が起きるべきか」を進める
function simulator(input: SpecInput, model: SpecModel, binding: BoundSpecification, hints: Hints = literalsIn(binding)) {
  const commands = Object.keys(input.behaviors).sort();

  const sequences = fc.array(
    fc.record({
      pick: fc.nat(),
      inputs: fc.record(Object.fromEntries(commands.map((name) => [name, recordOf(model.commands[name] ?? {}, hints)]))),
      queries: recordOf(model.queries, hints),
    }),
    { minLength: 1, maxLength: MAX_STEPS },
  );

  const start = () => ({
    status: model.init,
    // 未設定のデータも undefined のキーとして持つ
    data: Object.fromEntries(Object.keys(model.data).map((field) => [field, undefined])) as Values,
  });

  const checkInvariants = (state: { status: string; data: Values }, steps: Step[]) => {
    for (const name of model.invariants ?? []) {
      const invariant = binding.invariants?.[name];
      if (!invariant) throw new SpecError(`不変条件 "${name}" の判定が、解釈にありません`, steps);
      if (!invariant({ status: state.status, ...state.data })) {
        throw new SpecError(`不変条件が破れました: "${name}" (状態 ${state.status}, データ ${JSON.stringify(state.data)})`, steps);
      }
    }
  };

  // 参照を、その場の値に解決する
  const resolve = (value: SpecValue, context: Values & { status: string }, command: string): unknown => {
    if (!isReference(value)) return value;
    const ref: Reference = value;
    const name = String(ref.path);
    switch (ref.$ref) {
      case "decision": {
        const [decision, column] = ref.path as [string, string];
        const table = input.decisions[decision];
        if (!table) throw new Error(`決定表 "${decision}" がありません`);
        const row = matchCondition(binding, Object.keys(table), context);
        const cell = table[row][column];
        if (cell === null) throw new Error(`決定表 "${decision}" の行 "${row}" には、列 "${column}" の値がありません (null) が、その値が使われました`);
        return cell;
      }
      case "calculation": {
        const calculation = binding.calculations?.[name];
        if (!calculation) throw new Error(`計算 "${name}" の中身が、解釈にありません`);
        return calculation(context);
      }
      case "input":
        if (!(name in (model.commands[command] ?? {}))) throw new Error(`"${name}" は、コマンド ${command} の入力ではありません`);
        return context[name];
      case "data":
      case "query":
        return context[name];
      case "was":
        return (ref.path as string[]).includes(context.status);
    }
  };

  // 1手進める。実行できるコマンドが無ければ undefined。仕様の評価に失敗したら SpecError
  const next = (state: { status: string; data: Values }, raw: RawStep, steps: Step[]) => {
    try {
      // 意味の関数の中の decide / calculate が、この解釈を引くようにする
      activate(binding);
      const contextOf = (name: string) => ({ status: state.status, ...state.data, ...raw.queries, ...raw.inputs[name] });
      const enabled = commands.filter((name) => {
        const behavior = input.behaviors[name];
        return (
          (behavior.from ?? model.states).includes(state.status) &&
          (behavior.onlyIf ?? []).every((text) => {
            const condition = binding.conditions[text];
            if (!condition) throw new Error(`事前条件 "${text}" の意味が、解釈にありません`);
            return condition(contextOf(name));
          })
        );
      });
      if (enabled.length === 0) return undefined;

      const command = enabled[raw.pick % enabled.length];
      const context = contextOf(command);
      const cases = input.behaviors[command].when;
      const matched = matchCondition(binding, Object.keys(cases), context);
      const step: Step = { from: state.status, data: plain(state.data), command, input: raw.inputs[command], queries: raw.queries, case: matched };
      steps.push(step);

      const outcome = cases[matched];
      // goTo が無ければ、状態は変わらない
      const target = outcome.goTo ?? state.status;
      if (!model.states.includes(target)) throw new Error(`goTo "${target}" は states にありません`);

      // 副作用: when が成り立つものだけを、書かれた順に
      const effects: { name: string; payload: Values }[] = [];
      for (const effect of outcome.effects) {
        const issued =
          effect.when === undefined
            ? true
            : typeof effect.when === "string"
              ? matchCondition(binding, [effect.when], context) === effect.when
              : resolve(effect.when, context, command) === true;
        if (!issued) continue;
        const fields = model.effects[effect.name];
        if (!fields) throw new Error(`副作用 "${effect.name}" は effects にありません`);
        const payload = Object.fromEntries(Object.entries(effect.payload).map(([field, value]) => [field, resolve(value, context, command)]));
        for (const [field, schema] of Object.entries(fields)) {
          if (!conforms(schema, payload[field])) {
            throw new Error(`${effect.name}.${field} = ${JSON.stringify(payload[field])} が宣言した型・範囲に合いません`);
          }
        }
        effects.push({ name: effect.name, payload });
      }

      // 覚えるデータ
      const set: Values = {};
      for (const [field, value] of Object.entries(outcome.set)) {
        if (!(field in model.data)) throw new Error(`set: "${field}" は data にありません`);
        set[field] = resolve(value, context, command);
        if (!conforms(model.data[field], set[field])) {
          throw new Error(`set: ${field} = ${JSON.stringify(set[field])} が宣言した型・範囲に合いません`);
        }
      }

      const after = { status: target, data: { ...state.data, ...set } as Values };
      checkInvariants(after, steps);
      return { step, expected: plain({ state: target, effects }) as Observation, after };
    } catch (error) {
      throw error instanceof SpecError ? error : new SpecError(messageOf(error), steps);
    }
  };

  return { commands, sequences, start, next, checkInvariants };
}

// 仕様の事前検査: 実装なしで、仕様だけをランダムなアクション列で実行する。
// 条件の衝突、意味の漏れ、不変条件の破れ、宣言した型に合わない値を、LLM を呼ぶ前に見つける。
export async function selfCheck(
  input: SpecInput,
  params: { seed?: number; numRuns?: number } = {},
): Promise<{ ok: true; numRuns: number } | { ok: false; message: string; steps: Step[] }> {
  const model = input.model;
  if (input.problems?.length) return { ok: false, message: `解釈が Layer 1 と合いません: ${input.problems.join(" / ")}`, steps: [] };
  if (!model && input.layer1) return { ok: false, message: "コンポーネントの解釈 (interpretation) がありません", steps: [] };
  if (!model) return { ok: false, message: "仕様にコンポーネントがありません", steps: [] };
  if (!input.binding) return { ok: false, message: "コンポーネントの解釈 (interpretation) がありません", steps: [] };
  const sim = simulator(input, model, input.binding);

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

// 2つの解釈の比較: 同じ境界を持つ2つの仕様を、同じコマンド列で実行し、期待する結果が食い違う所を探す。
// 独立に導いた2つの解釈が食い違う所は、Layer 1 の記述があいまいな所である。
// コマンドごとに、食い違いが起きる最短のコマンド列を1つ返す
export type Difference = {
  command: string;
  // 1つ目の解釈で見た、そこまでのコマンド列。最後の1つで食い違う
  steps: Step[];
  first: Observation | { error: string } | { skipped: true };
  other: Observation | { error: string } | { skipped: true };
};

export async function compareSpecs(first: SpecInput, second: SpecInput, params: { seed?: number; numRuns?: number } = {}): Promise<Difference[]> {
  if (!first.model || !first.binding || !second.model || !second.binding) throw new Error("比べる仕様に、解釈がありません");
  // 入力の生成には、どちらの解釈の定数も混ぜる（片方だけが見ている値で食い違うことがある）
  const a = simulator(first, first.model, first.binding, literalsIn(first.binding, second.binding));
  const b = simulator(second, second.model, second.binding);
  type Seen = { command?: string; result: Difference["first"]; after?: { status: string; data: Values } };
  const advance = (sim: typeof a, state: { status: string; data: Values }, raw: RawStep, steps: Step[]): Seen => {
    try {
      const planned = sim.next(state, raw, steps);
      return planned ? { command: planned.step.command, result: planned.expected, after: planned.after } : { result: { skipped: true } };
    } catch (error) {
      if (error instanceof SpecError) return { command: error.steps.at(-1)?.command, result: { error: error.message } };
      throw error;
    }
  };
  const walk = (raw: RawStep[], only: string): Difference | undefined => {
    const steps: Step[] = [];
    const others: Step[] = [];
    let left = a.start();
    let right = b.start();
    for (const rawStep of raw) {
      const x = advance(a, left, rawStep, steps);
      const y = advance(b, right, rawStep, others);
      const command = x.command ?? y.command;
      if (x.command !== y.command || !isDeepStrictEqual(x.result, y.result)) {
        // 1つ目がそのコマンドを実行できないと読んだ場合は、最後の1手を、もう一方のものから取る
        const path = steps.length >= others.length ? steps : [...steps, others[others.length - 1]];
        return command === only ? { command, steps: plain(path), first: x.result, other: y.result } : undefined;
      }
      if (!x.after || !y.after) return undefined;
      left = x.after;
      right = y.after;
    }
    return undefined;
  };

  const differences: Difference[] = [];
  for (const command of a.commands) {
    const details = await fc.check(fc.property(a.sequences, (raw) => walk(raw, command) === undefined), { numRuns: 300, ...params });
    if (!details.failed || !details.counterexample) continue;
    const found = walk(details.counterexample[0], command);
    if (found) differences.push(found);
  }
  return differences;
}

export async function runPbt(options: { specs: string; adapter: Adapter; component?: string; args?: string[] }): Promise<PbtResult> {
  const { values } = parseArgs({
    args: options.args ?? process.argv.slice(2),
    options: {
      seed: { type: "string" },
      path: { type: "string" },
      runs: { type: "string" },
      // 人がまだ確認していない解釈の下書き (*.draft.ts) を、正解として使う
      drafts: { type: "boolean", default: false },
    },
  });
  const result = await check(options.specs, options.adapter, { drafts: values.drafts, component: options.component }, {
    seed: values.seed === undefined ? undefined : Number(values.seed),
    path: values.path,
    numRuns: values.runs === undefined ? DEFAULT_RUNS : Number(values.runs),
  });
  console.log(RESULT_PREFIX + JSON.stringify(result));
  if (result.status !== "pass") process.exitCode = 1;
  return result;
}

async function check(
  specs: string,
  adapter: Adapter,
  select: { drafts: boolean; component?: string },
  params: { seed?: number; path?: string; numRuns: number },
): Promise<PbtResult> {
  const input = await loadSpecs(specs, select);
  const model = input.model;
  if (input.problems?.length) return { status: "error", message: `解釈が Layer 1 と合いません: ${input.problems.join(" / ")}` };
  if (!model && input.layer1) return { status: "error", message: "コンポーネントの解釈 (interpretation) がありません" };
  if (input.stale) return { status: "error", message: "解釈を導いたあとで、Layer 1 が変わっています (interpret を実行してください)" };
  if (!model) return { status: "error", message: "仕様にコンポーネントがありません" };
  if (!input.binding) return { status: "error", message: "コンポーネントの解釈 (interpretation) がありません" };
  const sim = simulator(input, model, input.binding);
  if (sim.commands.length === 0) return { status: "error", message: "検証するコマンドがありません" };

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
            if (!current) throw new Error(`ports.queries.${name}() was called before any command; ask during the command instead`);
            return current.queries[name];
          },
        ]),
      ),
      effects: Object.fromEntries(
        Object.keys(model.effects).map((name) => [
          name,
          (payload: unknown) => void recorded.push({ name, payload: plain(payload ?? {}) }),
        ]),
      ),
    };

    let expected: Observation = { state: model.init, effects: [] };
    try {
      await adapter.setupIsolation(ports);
      try {
        let state = sim.start();
        const initial = plain({ state: await adapter.getCurrentState(), effects: recorded });
        if (!isDeepStrictEqual(expected, initial)) return { steps, expected, actual: initial };

        for (const rawStep of raw) {
          const planned = sim.next(state, rawStep, steps);
          if (!planned) continue;
          expected = planned.expected;
          current = planned.step;
          recorded = [];
          await adapter.executeCommand({ name: current.command, input: structuredClone(current.input) });
          const actual = plain({ state: await adapter.getCurrentState(), effects: recorded });
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
