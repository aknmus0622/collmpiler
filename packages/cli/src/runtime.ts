import { isDeepStrictEqual, parseArgs } from "node:util";
import fc from "fast-check";
import { activate, matchCondition } from "@clp/core";
import type { BoundSpecification, FieldSchema } from "@clp/core";
import { isRecordOutput, isReference, respondedValues } from "./extract.ts";
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
  // 返すものの形を宣言したコマンドは、その値を返す
  executeCommand(command: any): Promise<unknown>;
  getCurrentState(): Promise<unknown>;
};

type Values = Record<string, unknown>;
// answers: 引数つきの問い合わせの答え。問い合わせごとに、引数から答えを決める関数（同じ引数には同じ答え）
type RawStep = { pick: number; inputs: Record<string, Values>; queries: Values; answers: Record<string, (input: Values) => unknown> };
// output は、返すものの形を宣言したコマンドだけが持つ
type Observation = { state: unknown; effects: unknown; output?: unknown };

// data は、そのコマンドの実行前に部品が覚えているはずのデータ。case は成立した条件（無ければ "otherwise"）
// asks: そのコマンドで尋ねること（付けた名前、問い合わせ、引数）と、その答え
export type Asked = { name: string; query: string; input: Values; answer: unknown };
export type Step = { from: string; data: Values; command: string; input: Values; queries: Values; asks: Asked[]; case: string };

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
// 既定の試行回数。1000 回では、いくつもの偶然が重ならないと届かない判断（問い合わせの答えを何段も経た先）が、
// シードによっては一度も検証されなかった。壊れた実装の検証は最初の失敗で止まるので、回数に比例して遅くなるのは、
// 合格する検証だけ
export const DEFAULT_RUNS = 5000;

// 仕様の評価中に起きた問題（条件の衝突、意味の漏れ、不変条件の破れ、型に合わない値）
class SpecError extends Error {
  steps: Step[];
  constructor(message: string, steps: Step[]) {
    super(message);
    this.name = "SpecError";
    this.steps = steps;
  }
}

// 意味の関数に書かれている定数と、決定表の値。入力の生成に混ぜる。
// 自由な文字列や、しきい値を宣言していない数値は、一様な乱数では関数の中の定数にまず当たらないため
// （文字列を "Gold" と比べる条件は、"Gold" を生成しなければ一度も成り立たない）
type Hints = { strings: string[]; numbers: number[] };
function literalsIn(...bindings: BoundSpecification[]): Hints {
  const strings = new Set<string>();
  const numbers = new Set<number>();
  for (const binding of bindings) {
    // 決定表の値も混ぜる。意味の関数は表を引くだけで、しきい値（30 日、3 冊など）は関数の中に現れないことが多い
    for (const table of Object.values(binding.component.decisions)) {
      for (const cell of Object.values(table).flatMap((row) => Object.values(row))) {
        if (typeof cell === "number") numbers.add(cell);
        else if (typeof cell === "string") strings.add(cell);
      }
    }
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
  // 引数の無い問い合わせは、1手に1つの答え。引数つきは、1手ごとに、引数から答えを決める関数
  const nullary = Object.keys(model.queries).filter((name) => Object.keys(model.queries[name].input).length === 0);
  const parameterized = Object.keys(model.queries).filter((name) => !nullary.includes(name));

  const sequences = fc.array(
    fc.record({
      pick: fc.nat(),
      inputs: fc.record(Object.fromEntries(commands.map((name) => [name, recordOf(model.commands[name] ?? {}, hints)]))),
      queries: recordOf(Object.fromEntries(nullary.map((name) => [name, model.queries[name].output])), hints),
      answers: fc.record(Object.fromEntries(parameterized.map((name) => [name, fc.func(arbitraryOf(model.queries[name].output, hints))]))),
    }),
    { minLength: 1, maxLength: MAX_STEPS },
  );

  // 意味の関数に渡す状態。仕様に無い名前を読んだら、誤りとして止める。
  // 以前は、意味の関数の引数に型を付けて、名前の書き間違いを型エラーにしていた。型の検査を軽くした代わりに、ここで確かめる
  const known = new Set<string>([
    "status",
    ...Object.keys(model.data),
    ...Object.entries(model.queries).filter(([, query]) => Object.keys(query.input).length === 0).map(([name]) => name),
    ...Object.values(model.commands).flatMap((fields) => Object.keys(fields)),
    ...Object.values(input.behaviors).flatMap((behavior) => Object.keys(behavior.asks ?? {})),
  ]);
  const IGNORED = new Set(["toJSON", "then", "constructor", "valueOf", "toString", "inspect", "nodeType", "asymmetricMatch"]);
  const guarded = <T extends object>(state: T): T =>
    new Proxy(state, {
      get(target, key, receiver) {
        if (typeof key === "string" && !known.has(key) && !IGNORED.has(key) && !(key in target)) {
          throw new Error(`意味の関数が、仕様に無い名前 "${key}" を読みました（data、引数の無い問い合わせ、コマンドの入力、asks で付けた名前の、どれでもありません）`);
        }
        return Reflect.get(target, key, receiver);
      },
    });

  const start = () => ({
    status: model.init,
    // 未設定のデータも undefined のキーとして持つ
    data: Object.fromEntries(Object.keys(model.data).map((field) => [field, undefined])) as Values,
  });

  const checkInvariants = (state: { status: string; data: Values }, steps: Step[]) => {
    for (const name of model.invariants ?? []) {
      const invariant = binding.invariants?.[name];
      if (!invariant) throw new SpecError(`不変条件 "${name}" の判定が、解釈にありません`, steps);
      if (!invariant(guarded({ status: state.status, ...state.data }))) {
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
  // force: そのコマンドを、実行できるかどうか (from / onlyIf) を見ずに実行する（仕様のミューテーションで使う）
  const next = (state: { status: string; data: Values }, raw: RawStep, steps: Step[], force?: string) => {
    try {
      // 意味の関数の中の decide / calculate が、この解釈を引くようにする
      activate(binding);
      // そのコマンドが尋ねることを、引数を解決して、答えと一緒に並べる
      const askedBy = (name: string): Asked[] => {
        const base = { status: state.status, ...state.data, ...raw.queries, ...raw.inputs[name] };
        return Object.entries(input.behaviors[name].asks ?? {}).map(([alias, asked]) => {
          const answer = raw.answers[asked.query];
          if (!answer) throw new Error(`asks.${alias}: 問い合わせ "${asked.query}" は、引数つきの問い合わせとして宣言されていません`);
          const args = plain(Object.fromEntries(Object.entries(asked.input).map(([field, value]) => [field, resolve(value, base, name)]))) as Values;
          return { name: alias, query: asked.query, input: args, answer: answer(args) };
        });
      };
      const contextOf = (name: string) =>
        guarded({
          status: state.status,
          ...state.data,
          ...raw.queries,
          ...raw.inputs[name],
          ...Object.fromEntries(askedBy(name).map((asked) => [asked.name, asked.answer])),
        });
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
      if (force === undefined && enabled.length === 0) return undefined;

      const command = force ?? enabled[raw.pick % enabled.length];
      const context = contextOf(command);
      const cases = input.behaviors[command].when;
      const matched = matchCondition(binding, Object.keys(cases), context);
      const step: Step = { from: state.status, data: plain(state.data), command, input: raw.inputs[command], queries: raw.queries, asks: plain(askedBy(command)), case: matched };
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

      // 返す値
      const declared = model.outputs?.[command];
      let output: unknown;
      if (declared !== undefined) {
        const responded = respondedValues(outcome.responds);
        if (outcome.responds === undefined) throw new Error(`コマンド ${command} の、この場合に返す値 (responds) がありません`);
        const valueOf = (value: SpecValue) => ((value as unknown) === null ? null : resolve(value, context, command));
        if (isRecordOutput(declared)) {
          const fields = Object.fromEntries(responded.map(([field, value]) => [field, valueOf(value)]));
          for (const [field, schema] of Object.entries(declared.record)) {
            const fits = fields[field] === null ? declared.optional?.includes(field) === true : conforms(schema, fields[field]);
            if (!fits) throw new Error(`responds: ${field} = ${JSON.stringify(fields[field])} が宣言した型・範囲に合いません`);
          }
          output = fields;
        } else {
          output = valueOf(responded[0][1]);
          if (!conforms(declared as FieldSchema, output)) throw new Error(`responds: ${JSON.stringify(output)} が宣言した型・範囲に合いません`);
        }
      }

      const after = { status: target, data: { ...state.data, ...set } as Values };
      checkInvariants(after, steps);
      return { step, expected: plain({ state: target, effects, ...(declared === undefined ? {} : { output }) }) as Observation, after };
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
// コマンドと観点の組ごとに、食い違いが起きる最短のコマンド列を1つ返す。観点は:
//   runs            … 実行できるかどうか（片方だけが実行できる、片方だけが仕様の誤りになる）
//   state           … 遷移先
//   output          … 返す値
//   effect:<名前>   … その副作用を起こすかどうかと、その値
//   order           … 副作用の順序（起こす副作用と値は同じで、並びだけが違う）
// 観点を分けるのは、1つのコマンドにあいまいな所が複数あっても、それぞれを報告するためである
// （分けなければ、いちばん短く示せるものだけが出て、ほかは隠れる）
export type Difference = {
  command: string;
  aspect: string;
  // 1つ目の解釈で見た、そこまでのコマンド列。最後の1つで食い違う
  steps: Step[];
  first: Observation | { error: string } | { skipped: true };
  other: Observation | { error: string } | { skipped: true };
};

type Recorded = { name: string; payload: Values };
const isObservation = (result: Difference["first"]): result is Observation => "state" in result;

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
  // 1手の結果が食い違っている観点
  const aspectsOf = (x: Seen, y: Seen): string[] => {
    if (x.command !== y.command || !isObservation(x.result) || !isObservation(y.result)) {
      return x.command !== y.command || !isDeepStrictEqual(x.result, y.result) ? ["runs"] : [];
    }
    const found: string[] = [];
    if (x.result.state !== y.result.state) found.push("state");
    if (!isDeepStrictEqual(x.result.output, y.result.output)) found.push("output");
    const [left, right] = [x.result.effects as Recorded[], y.result.effects as Recorded[]];
    const of = (effects: Recorded[], name: string) => effects.filter((effect) => effect.name === name);
    for (const name of new Set([...left, ...right].map((effect) => effect.name))) {
      if (!isDeepStrictEqual(of(left, name), of(right, name))) found.push(`effect:${name}`);
    }
    if (!found.some((aspect) => aspect.startsWith("effect:")) && !isDeepStrictEqual(left, right)) found.push("order");
    return found;
  };
  const walk = (raw: RawStep[], only: string, aspect: string): Difference | undefined => {
    const steps: Step[] = [];
    const others: Step[] = [];
    let left = a.start();
    let right = b.start();
    for (const rawStep of raw) {
      const x = advance(a, left, rawStep, steps);
      const y = advance(b, right, rawStep, others);
      const command = x.command ?? y.command;
      const aspects = aspectsOf(x, y);
      if (command === only && aspects.includes(aspect)) {
        // 1つ目がそのコマンドを実行できないと読んだ場合は、最後の1手を、もう一方のものから取る
        const path = steps.length >= others.length ? steps : [...steps, others[others.length - 1]];
        return { command, aspect, steps: plain(path), first: x.result, other: y.result };
      }
      // 副作用だけの食い違いなら、その先も比べられる。実行できるかどうかや状態が分かれたら、そこまで
      if (!x.after || !y.after || aspects.includes("runs") || aspects.includes("state")) return undefined;
      left = x.after;
      right = y.after;
    }
    return undefined;
  };

  const aspects = ["runs", "state", "output", ...Object.keys(first.model.effects).sort().map((name) => `effect:${name}`), "order"];
  const differences: Difference[] = [];
  for (const command of a.commands) {
    for (const aspect of aspects) {
      const details = await fc.check(fc.property(a.sequences, (raw) => walk(raw, command, aspect) === undefined), { numRuns: 300, ...params });
      if (!details.failed || !details.counterexample) continue;
      const found = walk(details.counterexample[0], command, aspect);
      if (found) differences.push(found);
    }
  }
  return differences;
}

// 仕様のミューテーション: 決定表のセルを1つずつ変えて、仕様が期待する結果が変わるかを確かめる。
// 変わらない値は、検証に現れない。正しく実装しても、ミューテーションのゲートが差し戻すことになる
// （あるいは、その値を使う確認が、本番コードから消える）。エージェントを呼ぶ前に、仕様の側で見つける。
//   observable   … 実行したコマンドの結果（遷移先、副作用）が変わる。検証に現れる
//   precondition … 変わるのは、コマンドを実行できるかどうかだけ。検証は実行できるコマンドしか実行しないので、現れない
//   unobserved   … どのシードでも、何も変わらない。使われていないか、生成される入力が届かない
//   rare         … 検証のシードでは何も変わらないが、ほかのシードでは結果が変わる。その値の検証は薄い
// 「何も変わらない」には、本当に使われていない場合と、その乱数では届かなかった場合が混ざる。
// 1つのシードで決めると、しきい値の境目のような届きにくい値を、誤って止めてしまう（貸出の例で、30 シード中 3 回）。
// そこで、検証のシードで現れなかった値は、ほかのシードでも確かめてから決める
export type Unobservable = {
  table: string;
  row: string;
  column: string;
  value: string | number | boolean;
  verdict: "precondition" | "unobserved" | "rare";
  // 数値と文字列は、ミューテーションのゲートが合否に使う。真偽値は使わないので、ここでも止めない
  severity: "error" | "warning";
};
export const mutateCell = (cell: string | number | boolean): string | number | boolean =>
  typeof cell === "number" ? cell + 1 : typeof cell === "boolean" ? !cell : `${cell}~`;
// 検証のシードのほかに確かめるシードの数
const EXTRA_SEEDS = 2;

export async function observability(input: SpecInput, params: { seed?: number; numRuns?: number } = {}): Promise<Unobservable[]> {
  const { model, binding } = input;
  if (!model || !binding) return [];
  const original = simulator(input, model, binding);
  const found: Unobservable[] = [];
  for (const [table, rows] of Object.entries(input.decisions)) {
    for (const [row, cells] of Object.entries(rows)) {
      for (const [column, cell] of Object.entries(cells)) {
        if (cell === null) continue;
        // 値を1つ変えた仕様。解釈の関数はそのままで、決定表だけが違う
        const decisions = { ...input.decisions, [table]: { ...rows, [row]: { ...cells, [column]: mutateCell(cell) } } };
        const mutatedBinding = { ...binding, component: { ...binding.component, decisions } };
        const mutated = simulator({ ...input, decisions, binding: mutatedBinding }, model, mutatedBinding, literalsIn(binding));
        let enablementDiffers = false;
        const outcomeDiffers = (raw: RawStep[]): boolean => {
          let left = original.start();
          let right = mutated.start();
          for (const rawStep of raw) {
            const expected = original.next(left, rawStep, []);
            // 変えた仕様が、同じ場面で選ぶコマンド（実行できるかどうかの違いを見る）
            let chosen: string | undefined;
            try {
              chosen = mutated.next(right, rawStep, [])?.step.command;
            } catch (error) {
              if (!(error instanceof SpecError)) throw error;
            }
            if (chosen !== expected?.step.command) enablementDiffers = true;
            if (!expected) continue;
            // 元の仕様が実行するコマンドを、変えた仕様でも実行して、結果を比べる
            let changed: ReturnType<typeof mutated.next>;
            try {
              changed = mutated.next(right, rawStep, [], expected.step.command);
            } catch (error) {
              // 変えた値が型に合わなくなるなど。値が結果に届いている
              if (error instanceof SpecError) return true;
              throw error;
            }
            if (!changed || !isDeepStrictEqual(expected.expected, changed.expected)) return true;
            left = expected.after;
            right = changed.after;
          }
          return false;
        };
        const seenWith = async (seed: number | undefined) =>
          (await fc.check(fc.property(original.sequences, (raw) => !outcomeDiffers(raw)), { numRuns: DEFAULT_RUNS, ...params, ...(seed === undefined ? {} : { seed }) })).failed;
        // 検証と同じシードで現れれば、それでよい
        if (await seenWith(params.seed)) continue;
        // 現れなかった: ほかのシードでも確かめる
        let elsewhere = false;
        for (let extra = 1; extra <= EXTRA_SEEDS && !elsewhere; extra++) elsewhere = await seenWith((params.seed ?? 0) + extra);
        const verdict = elsewhere ? "rare" : enablementDiffers ? "precondition" : "unobserved";
        found.push({ table, row, column, value: cell, verdict, severity: verdict === "rare" || typeof cell === "boolean" ? "warning" : "error" });
      }
    }
  }
  return found;
}

// 検証に現れない値についての、利用者向けの説明
export function describeUnobservable(found: Unobservable): string {
  const where = `決定表 ${found.table} の行 "${found.row}" の ${found.column} (${JSON.stringify(found.value)})`;
  if (found.verdict === "precondition") {
    return `${where}: この値を変えても、変わるのは「コマンドを実行できるかどうか」だけです。実行できない場面は検証されないので、この値は実装で確かめられません。断ることは、from / onlyIf ではなく、結果の1つ (when の場合。遷移先も副作用も無い) として書いてください`;
  }
  if (found.verdict === "unobserved") {
    return `${where}: この値を変えても、仕様が期待する結果は変わりません。どこからも使われていないなら、列を消すか null にしてください。しきい値なら、生成される入力がそこに届いていません`;
  }
  return `${where}: この値は、検証に使うシードでは結果に現れません（ほかのシードでは現れます）。この値についての検証は薄く、ミューテーションのゲートが差し戻すことがあります。試行の回数を増やすと届きます (--runs)`;
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

// アダプターを通して本番システムを検証する（結果を返すだけ。出力や終了コードは runPbt が扱う）
export async function check(
  specs: string,
  adapter: Adapter,
  select: { drafts: boolean; component?: string },
  params: { seed?: number; path?: string; numRuns: number },
): Promise<PbtResult> {
  const input = await loadSpecs(specs, select);
  const model = input.model;
  if (input.problems?.length) return { status: "error", message: `解釈が Layer 1 と合いません: ${input.problems.join(" / ")}` };
  if (!model && input.layer1) return { status: "error", message: "コンポーネントの解釈 (interpretation) がありません" };
  if (input.stale) return { status: "error", message: "解釈を導いたあとで、Layer 1 が変わっています (clp interpret を実行してください)" };
  if (!model) return { status: "error", message: "仕様にコンポーネントがありません" };
  if (!input.binding) return { status: "error", message: "コンポーネントの解釈 (interpretation) がありません" };
  const sim = simulator(input, model, input.binding);
  if (sim.commands.length === 0) return { status: "error", message: "検証するコマンドがありません" };

  // 1試行を実行し、不一致があればその内容を返す。仕様側の問題は SpecError として投げる
  const trial = async (raw: RawStep[]) => {
    const steps: Step[] = [];
    let current: Step | undefined;
    let recorded: unknown[] = [];
    // 仕様に無いことを尋ねた（引数つきの問い合わせを、そのコマンドが尋ねない引数で呼んだ）
    let misasked: string | undefined;

    const ports: Ports = {
      queries: Object.fromEntries(
        Object.keys(model.queries).map((name) => [
          name,
          (asked?: unknown) => {
            if (!current) throw new Error(`ports.queries.${name}() was called before any command; ask during the command instead`);
            if (Object.keys(model.queries[name].input).length === 0) return current.queries[name];
            // 引数つき: そのコマンドが尋ねることの中から、引数が一致するものを探す。
            // 尋ねなかったことは問わない（答えで結果が変わるなら、結果の不一致として現れる）
            const given = plain(asked ?? {});
            const allowed = current.asks.filter((entry) => entry.query === name);
            const found = allowed.find((entry) => isDeepStrictEqual(entry.input, given));
            if (found) return found.answer;
            misasked = `ports.queries.${name} was asked with ${JSON.stringify(given)}, but in this command the specification asks it ${
              allowed.length === 0 ? "nothing" : `only with ${allowed.map((entry) => JSON.stringify(entry.input)).join(" or ")}`
            }`;
            throw new Error(misasked);
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
          misasked = undefined;
          const returned = await adapter.executeCommand({ name: current.command, input: structuredClone(current.input) });
          // 本番コードが例外を握りつぶしていても、仕様に無い問い合わせは不合格にする
          if (misasked) return { steps, expected, actual: { error: misasked } };
          // 返した値を比べるのは、返すものの形を宣言したコマンドだけ
          const answered = "output" in expected ? { output: returned === undefined ? null : returned } : {};
          const actual = plain({ state: await adapter.getCurrentState(), effects: recorded, ...answered });
          if (!isDeepStrictEqual(expected, actual)) return { steps, expected, actual };
          state = planned.after;
        }
      } finally {
        await adapter.teardownIsolation();
      }
    } catch (error) {
      if (error instanceof SpecError) throw error;
      return { steps, expected, actual: { error: misasked ?? messageOf(error) } };
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
