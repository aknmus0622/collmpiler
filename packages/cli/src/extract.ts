import type { BoundSpecification, Constant, Declaration, FieldSchema, Fields, Table } from "@aac/core";
import type { Asset } from "./assets.ts";
import { compatible, conforms, describe } from "./schema.ts";

// 仕様 (コンポーネント + 決定表 + 結び付けの構造) から IR を作る。
// コンポーネントにも結び付けの構造にも関数は無いので、IR は宣言をほぼそのまま並べ直したものになる。
// 結び付けの意味 (条件・計算・不変条件の関数) は IR に含めない。採点の正解だからである。
//
// あわせて、型チェックをすり抜けた誤りを、分かりやすい文面で報告する。

export const IR_VERSION = 2;

// --- 読み込んだ仕様を、扱いやすい形に正規化したもの (loader が作る) ---
export type SpecModel = {
  initial: string;
  states: readonly string[];
  data: Fields;
  // アクション名 → 入力
  actions: Record<string, Fields>;
  queries: Fields;
  commands: Record<string, Fields>;
  // 計算の名前 → 式を述べる文と、結果の型
  formulas?: Record<string, { is: string; type: FieldSchema }>;
  invariants?: readonly string[];
};

// 結び付けの構造の中の値: 定数か、参照
export type Reference = { $ref: "decided" | "calculated" | "given" | "remembered" | "asked" | "was"; path: unknown };
export type SpecValue = Constant | Reference;
export type SpecCommand = { action: string; payload: Record<string, SpecValue>; when?: string | Reference };
export type SpecOutcome = { nextState: string; does: string; tell: SpecCommand[]; set: Record<string, SpecValue> };

export type SpecInput = {
  model?: SpecModel;
  // アクション名 → 実行できる状態、事前条件、条件ごとの結果（分かれないアクションは otherwise だけ）
  behaviors: Record<string, { from?: readonly string[]; where?: readonly string[]; cases: Record<string, SpecOutcome> }>;
  decisions: Record<string, Table>;
  // コンポーネントと、その結び付け（意味の関数を含む）
  component?: Declaration;
  binding?: BoundSpecification;
  // コンポーネントの assets に宣言された添付資料（ファイルは内容を読み込んだもの）。IR には含めない
  assets?: Asset[];
  // どのファイルのどの export か（結び付けの下書きを書くときに使う）
  sources?: { component?: { file: string; exportName: string }; binding?: string; decisions: Record<string, { file: string; exportName: string } | undefined> };
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
function typeOf(input: SpecInput, action: string, ref: Reference): { schema?: FieldSchema; values?: Constant[]; boolean?: true; problem?: string } {
  const model = input.model!;
  const name = String(ref.path);
  switch (ref.$ref) {
    case "decided": {
      const [decision, column] = ref.path as [string, string];
      const table = input.decisions[decision];
      if (!table) return { problem: `決定表 "${decision}" は、コンポーネントの decisions にありません` };
      if (!(column in table.otherwise)) return { problem: `決定表 "${decision}" に、列 "${column}" はありません` };
      return { values: Object.values(table).map((row) => row[column]) };
    }
    case "calculated":
      return model.formulas?.[name] ? { schema: model.formulas[name].type } : { problem: `計算 "${name}" は、calculations にありません` };
    case "given":
      return model.actions[action]?.[name] ? { schema: model.actions[action][name] } : { problem: `"${name}" は、アクション ${action} の takes にありません` };
    case "remembered":
      return model.data[name] ? { schema: model.data[name] } : { problem: `"${name}" は、remembers にありません` };
    case "asked":
      return model.queries[name] ? { schema: model.queries[name] } : { problem: `"${name}" は、asks にありません` };
    case "was": {
      const unknown = (ref.path as string[]).find((state) => !model.states.includes(state));
      return unknown === undefined ? { boolean: true } : { problem: `was: "${unknown}" は states にありません` };
    }
  }
}

// 値 (定数か参照) を、宣言した型のフィールドに入れてよいか。だめなら理由を返す
function mismatch(input: SpecInput, action: string, value: SpecValue, target: FieldSchema): string | undefined {
  if (!isReference(value)) {
    return conforms(target, value) ? undefined : `${JSON.stringify(value)} は ${describe(target)} に入りません`;
  }
  const found = typeOf(input, action, value);
  if (found.problem) return found.problem;
  if (found.boolean) return target === "boolean" ? undefined : `was(...) は真偽値で、${describe(target)} には入りません`;
  if (found.values) {
    const bad = found.values.find((cell) => !conforms(target, cell));
    return bad === undefined ? undefined : `決定表の値 ${JSON.stringify(bad)} は ${describe(target)} に入りません`;
  }
  return compatible(found.schema!, target) ? undefined : `${describe(found.schema!)} は ${describe(target)} に入りません`;
}

function serialize(value: SpecValue): unknown {
  if (!isReference(value)) return value;
  if (value.$ref === "was") return { $was: value.path };
  const prefix = { decided: "decision", calculated: "formula", given: "input", remembered: "data", asked: "query" }[value.$ref];
  return { $ref: `${prefix}:${Array.isArray(value.path) ? value.path.join(".") : value.path}` };
}

export function extract(input: SpecInput) {
  const diagnostics: Diagnostic[] = [];
  const model = input.model;
  if (!model) return { ir: { irVersion: IR_VERSION, behaviors: [], decisions: {} }, diagnostics };

  const report = (code: string, behavior: string, caseName: string, message: string) =>
    diagnostics.push({ severity: "error", code, behavior, case: caseName, message });
  const binding = input.binding;
  if (!binding) report("unbound-specification", "", "", "このコンポーネントの結び付け (bind) がありません");

  const condition = (behavior: string, caseName: string, name: string) => {
    if (binding && name !== "otherwise" && typeof binding.conditions?.[name] !== "function") {
      report("unbound-condition", behavior, caseName, `条件 "${name}" の意味が、結び付けの conditions に書かれていません`);
    }
  };

  const behaviors = [];
  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    for (const state of behavior.from ?? []) {
      if (!model.states.includes(state)) report("unknown-state", name, "", `allowedIn の "${state}" は states にありません`);
    }
    for (const precondition of behavior.where ?? []) condition(name, "", precondition);

    const transitions: Record<string, unknown> = {};
    for (const caseName of Object.keys(behavior.cases).sort()) {
      const outcome = behavior.cases[caseName];
      condition(name, caseName, caseName);
      if (!model.states.includes(outcome.nextState)) {
        report("unknown-state", name, caseName, `goTo の "${outcome.nextState}" は states にありません`);
      }

      const emittedCommands = outcome.tell.map((command) => {
        const fields = model.commands[command.action];
        if (!fields) {
          report("unknown-command", name, caseName, `指示 "${command.action}" は tells にありません`);
        } else {
          for (const field of Object.keys(fields)) {
            if (!(field in command.payload)) report("missing-field", name, caseName, `指示 ${command.action} に、フィールド "${field}" がありません`);
          }
          for (const [field, value] of Object.entries(command.payload)) {
            const problem = fields[field] ? mismatch(input, name, value, fields[field]) : `指示 ${command.action} に、フィールド "${field}" はありません`;
            if (problem) report("bad-value", name, caseName, `${command.action}.${field}: ${problem}`);
          }
        }
        if (typeof command.when === "string") condition(name, caseName, command.when);
        else if (command.when) {
          const problem = mismatch(input, name, command.when, "boolean");
          if (problem) report("bad-value", name, caseName, `${command.action} の when: ${problem}`);
        }
        return {
          action: command.action,
          payload: Object.fromEntries(Object.entries(command.payload).map(([field, value]) => [field, serialize(value)])),
          ...(command.when === undefined ? {} : { when: typeof command.when === "string" ? command.when : serialize(command.when) }),
        };
      });

      for (const [field, value] of Object.entries(outcome.set)) {
        const problem = model.data[field] ? mismatch(input, name, value, model.data[field]) : `"${field}" は remembers にありません`;
        if (problem) report("bad-value", name, caseName, `remember.${field}: ${problem}`);
      }

      transitions[caseName] = {
        nextState: outcome.nextState,
        description: outcome.does,
        emittedCommands,
        ...(Object.keys(outcome.set).length > 0
          ? { set: Object.fromEntries(Object.entries(outcome.set).map(([field, value]) => [field, serialize(value)])) }
          : {}),
      };
    }
    behaviors.push({
      name,
      from: [...(behavior.from ?? model.states)],
      preconditions: [...(behavior.where ?? [])],
      transitions,
    });
  }

  const decisions: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(input.decisions)) {
    for (const row of Object.keys(table)) condition("", "", row);
    decisions[name] = { rows: table };
  }
  for (const name of Object.keys(model.formulas ?? {})) {
    if (binding && typeof binding.calculations?.[name] !== "function") {
      report("unbound-formula", "", "", `計算 "${name}" の中身が、結び付けの calculations に書かれていません`);
    }
  }
  for (const name of model.invariants ?? []) {
    if (binding && typeof binding.alwaysTrue?.[name] !== "function") {
      report("unbound-invariant", "", "", `不変条件 "${name}" の判定が、結び付けの alwaysTrue に書かれていません`);
    }
  }

  return { ir: { irVersion: IR_VERSION, model, decisions, behaviors }, diagnostics };
}

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
