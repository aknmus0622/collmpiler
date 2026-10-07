import type { BoundSpecification, Constant, Declaration, FieldSchema, Fields, Table } from "@clp/core";
import type { Asset } from "./assets.ts";
import { compatible, conforms, describe } from "./schema.ts";

// 仕様 (Layer 1 のコンポーネント + 決定表 + 解釈の構造) から IR を作る。
// どれにも関数は無いので、IR は宣言をほぼそのまま並べ直したものになる。
// 解釈の意味 (条件・計算・不変条件の関数) は IR に含めない。採点の正解だからである。
//
// IR のキーは、仕様を書くときの語と同じにしている。
// あわせて、型チェックをすり抜けた誤りを、分かりやすい文面で報告する。

export const IR_VERSION = 4;

// --- 読み込んだ仕様を、扱いやすい形に正規化したもの (loader が作る) ---
export type SpecModel = {
  init: string;
  states: readonly string[];
  data: Fields;
  // コマンド名 → 入力
  commands: Record<string, Fields>;
  queries: Fields;
  // 副作用の名前 → フィールド
  effects: Record<string, Fields>;
  // 計算の名前 → 式を述べる文と、結果の型
  calculations?: Record<string, { is: string; type: FieldSchema }>;
  invariants?: readonly string[];
};

// 構造の中の値: 定数か、参照
export type Reference = { $ref: "decision" | "calculation" | "input" | "data" | "query" | "was"; path: unknown };
export type SpecValue = Constant | Reference;
export type SpecEffect = { name: string; payload: Record<string, SpecValue>; when?: string | Reference };
// goTo が無ければ、状態は変わらない
export type SpecOutcome = { goTo?: string; does?: string; effects: SpecEffect[]; set: Record<string, SpecValue> };

export type SpecInput = {
  // コンポーネントの名前 (order など)
  name?: string;
  model?: SpecModel;
  // コマンド名 → 実行できる状態、事前条件、条件ごとの結果（分かれないコマンドは otherwise だけ）
  behaviors: Record<string, { description?: string; from?: readonly string[]; onlyIf?: readonly string[]; when: Record<string, SpecOutcome> }>;
  decisions: Record<string, Table>;
  // Layer 1 のコンポーネント（書かれたまま）、解釈を重ねたもの、解釈（意味の関数を含む）
  layer1?: object;
  component?: Declaration;
  binding?: BoundSpecification;
  // Layer 1 と解釈が合わない点
  problems?: string[];
  // 解釈を導いたあとで、Layer 1 が変わっている
  stale?: boolean;
  // コンポーネントの assets に宣言された添付資料（ファイルは内容を読み込んだもの）。IR には含めない
  assets?: Asset[];
  // どのファイルのどの export か（解釈の下書きを書くときに使う）
  sources?: { component?: { file: string; exportName: string }; binding?: string; otherBindings?: string[]; decisions: Record<string, { file: string; exportName: string } | undefined> };
};

export type Diagnostic = {
  severity: "error" | "warning";
  code: string;
  behavior: string;
  case: string;
  message: string;
};

export const isReference = (value: unknown): value is Reference =>
  typeof value === "object" && value !== null && "$ref" in value && "path" in value;

// 参照が指すものの型。見つからなければ、その理由
function typeOf(input: SpecInput, command: string, ref: Reference): { schema?: FieldSchema; values?: (Constant | null)[]; boolean?: true; problem?: string } {
  const model = input.model!;
  const name = String(ref.path);
  switch (ref.$ref) {
    case "decision": {
      const [decision, column] = ref.path as [string, string];
      const table = input.decisions[decision];
      if (!table) return { problem: `決定表 "${decision}" は、コンポーネントの decisions にありません` };
      if (!(column in table.otherwise)) return { problem: `決定表 "${decision}" に、列 "${column}" はありません` };
      return { values: Object.values(table).map((row) => row[column]) };
    }
    case "calculation":
      return model.calculations?.[name] ? { schema: model.calculations[name].type } : { problem: `計算 "${name}" は、calculations にありません` };
    case "input":
      return model.commands[command]?.[name] ? { schema: model.commands[command][name] } : { problem: `"${name}" は、コマンド ${command} の input にありません` };
    case "data":
      return model.data[name] ? { schema: model.data[name] } : { problem: `"${name}" は、data にありません` };
    case "query":
      return model.queries[name] ? { schema: model.queries[name] } : { problem: `"${name}" は、queries にありません` };
    case "was": {
      const unknown = (ref.path as string[]).find((state) => !model.states.includes(state));
      return unknown === undefined ? { boolean: true } : { problem: `was: "${unknown}" は states にありません` };
    }
  }
}

// 値 (定数か参照) を、宣言した型のフィールドに入れてよいか。だめなら理由を返す
function mismatch(input: SpecInput, command: string, value: SpecValue, target: FieldSchema): string | undefined {
  if (!isReference(value)) {
    return conforms(target, value) ? undefined : `${JSON.stringify(value)} は ${describe(target)} に入りません`;
  }
  const found = typeOf(input, command, value);
  if (found.problem) return found.problem;
  if (found.boolean) return target === "boolean" ? undefined : `was(...) は真偽値で、${describe(target)} には入りません`;
  if (found.values) {
    // null は「この行では値が無い」。その行でこの参照が使われないことは、仕様の事前検査が確かめる
    const bad = found.values.find((cell) => cell !== null && !conforms(target, cell));
    return bad === undefined ? undefined : `決定表の値 ${JSON.stringify(bad)} は ${describe(target)} に入りません`;
  }
  return compatible(found.schema!, target) ? undefined : `${describe(found.schema!)} は ${describe(target)} に入りません`;
}

function serialize(value: SpecValue): unknown {
  if (!isReference(value)) return value;
  if (value.$ref === "was") return { $was: value.path };
  return { $ref: `${value.$ref}:${Array.isArray(value.path) ? value.path.join(".") : value.path}` };
}

export function extract(input: SpecInput) {
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, behavior: string, caseName: string, message: string) =>
    diagnostics.push({ severity: "error", code, behavior, case: caseName, message });
  const model = input.model;
  const binding = input.binding;
  // 解釈が無い、または Layer 1 と合わない: 語彙が定まらないので、IR は作れない
  if (input.layer1 && !binding) report("unbound-specification", "", "", "このコンポーネントの解釈 (interpretation) がありません");
  for (const problem of input.problems ?? []) report("bad-interpretation", "", "", problem);
  if (input.stale) {
    report("stale-interpretation", "", "", "解釈を導いたあとで、Layer 1 が変わっています。interpret で導き直すか、解釈がいまも正しいことを確かめて interpret --accept を実行してください");
  }
  if (!model) return { ir: { irVersion: IR_VERSION, behaviors: [], decisions: {} }, diagnostics };

  const condition = (behavior: string, caseName: string, name: string) => {
    if (binding && name !== "otherwise" && typeof binding.conditions?.[name] !== "function") {
      report("unbound-condition", behavior, caseName, `条件 "${name}" の意味が、解釈の conditions に書かれていません`);
    }
  };

  const behaviors = [];
  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    for (const state of behavior.from ?? []) {
      if (!model.states.includes(state)) report("unknown-state", name, "", `from の "${state}" は states にありません`);
    }
    for (const precondition of behavior.onlyIf ?? []) condition(name, "", precondition);

    const when: Record<string, unknown> = {};
    for (const caseName of Object.keys(behavior.when).sort()) {
      const outcome = behavior.when[caseName];
      condition(name, caseName, caseName);
      if (outcome.goTo !== undefined && !model.states.includes(outcome.goTo)) {
        report("unknown-state", name, caseName, `goTo の "${outcome.goTo}" は states にありません`);
      }

      const effects = outcome.effects.map((effect) => {
        const fields = model.effects[effect.name];
        if (!fields) {
          report("unknown-effect", name, caseName, `副作用 "${effect.name}" は effects にありません`);
        } else {
          for (const field of Object.keys(fields)) {
            if (!(field in effect.payload)) report("missing-field", name, caseName, `副作用 ${effect.name} に、フィールド "${field}" がありません`);
          }
          for (const [field, value] of Object.entries(effect.payload)) {
            const problem = fields[field] ? mismatch(input, name, value, fields[field]) : `副作用 ${effect.name} に、フィールド "${field}" はありません`;
            if (problem) report("bad-value", name, caseName, `${effect.name}.${field}: ${problem}`);
          }
        }
        if (typeof effect.when === "string") condition(name, caseName, effect.when);
        else if (effect.when) {
          const problem = mismatch(input, name, effect.when, "boolean");
          if (problem) report("bad-value", name, caseName, `${effect.name} の when: ${problem}`);
        }
        return {
          name: effect.name,
          payload: Object.fromEntries(Object.entries(effect.payload).map(([field, value]) => [field, serialize(value)])),
          ...(effect.when === undefined ? {} : { when: typeof effect.when === "string" ? effect.when : serialize(effect.when) }),
        };
      });

      for (const [field, value] of Object.entries(outcome.set)) {
        const problem = model.data[field] ? mismatch(input, name, value, model.data[field]) : `"${field}" は data にありません`;
        if (problem) report("bad-value", name, caseName, `set.${field}: ${problem}`);
      }

      when[caseName] = {
        ...(outcome.goTo === undefined ? {} : { goTo: outcome.goTo }),
        ...(outcome.does === undefined ? {} : { does: outcome.does }),
        effects,
        ...(Object.keys(outcome.set).length > 0
          ? { set: Object.fromEntries(Object.entries(outcome.set).map(([field, value]) => [field, serialize(value)])) }
          : {}),
      };
    }
    behaviors.push({
      name,
      ...(behavior.description === undefined ? {} : { description: behavior.description }),
      from: [...(behavior.from ?? model.states)],
      onlyIf: [...(behavior.onlyIf ?? [])],
      when,
    });
  }

  const decisions: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(input.decisions)) {
    for (const row of Object.keys(table)) condition("", "", row);
    decisions[name] = { rows: table };
  }
  for (const name of Object.keys(model.calculations ?? {})) {
    if (binding && typeof binding.calculations?.[name] !== "function") {
      report("unbound-calculation", "", "", `計算 "${name}" の中身が、解釈の calculations に書かれていません`);
    }
  }
  for (const name of model.invariants ?? []) {
    if (binding && typeof binding.invariants?.[name] !== "function") {
      report("unbound-invariant", "", "", `不変条件 "${name}" の判定が、解釈の invariants に書かれていません`);
    }
  }

  // Layer 1 が文で書いた説明（全体と、項目ごと）。構造が正確な形で、こちらは意図を伝える
  const descriptions = input.component?.descriptions ?? {};
  return {
    ir: { irVersion: IR_VERSION, ...(Object.keys(descriptions).length > 0 ? { descriptions } : {}), model, decisions, behaviors },
    diagnostics,
  };
}

// 境界: アダプターの契約を決める部分（状態・コマンドと入力・問い合わせ・副作用）
export const boundaryOf = (ir: { model?: Partial<SpecModel> }) => {
  const { init, states, commands, queries, effects } = ir.model ?? {};
  return stableStringify({ init, states, commands, queries, effects });
};

// キーをソートし、インデントと改行を固定する（出力の決定性）
export function stableStringify(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (typeof item === "object" && item !== null) {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((key) => [key, sort((item as Record<string, unknown>)[key])]),
      );
    }
    return item;
  };
  return JSON.stringify(sort(value), null, 2) + "\n";
}
