import { ABSTRACT_APPLY, ABSTRACT_FORMULA, getCondition, getFormula, getInvariant } from "@aac/core";
import type { FieldSchema, Fields } from "@aac/core";
import { lintCase } from "./lint.ts";

// レコーディング Proxy による抽象実行: cases の関数を「記号的な state」で1回走らせ、
// 返ってきた遷移記述から IR を組み立てる。

export const IR_VERSION = 1;

// コンポーネントを、抽出と検証が扱いやすい形に正規化したもの (loader が作る)。
// actions は「アクション名 → 入力」だけを持ち、from / where / cases は behaviors 側に置く
export type SpecModel = {
  initial: string;
  states: readonly string[];
  data: Fields;
  actions: Record<string, Fields>;
  queries: Fields;
  commands: Record<string, Fields>;
  formulas?: Fields;
  invariants?: readonly string[];
};

export type SpecInput = {
  behaviors: Record<
    string,
    { from?: readonly string[]; where?: readonly string[]; cases: Record<string, (state: any) => unknown> }
  >;
  // export 名 → DecisionTable。applyDecision に渡された表の名前解決に使う
  tables: Record<string, object>;
  model?: SpecModel;
};

export type Diagnostic = {
  severity: "error" | "warning";
  code: string;
  behavior: string;
  case: string;
  message: string;
};

export type ExtractOptions = {
  allowAsync?: boolean;
  // false にすると構文制限を外し、Proxy 単体の挙動を観察できる（テスト用）
  lint?: boolean;
};

export class AbstractExecutionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AbstractExecutionError";
    this.code = code;
  }
}

type Origin = { kind: "state" } | { kind: "decision"; table: string } | { kind: "formula"; name: string };
type Node = { origin: Origin; path: string[]; used: boolean };
type Context = {
  nodes: Node[];
  model: SpecModel | undefined;
  // 実行中の behavior 名（モデルがあるとき、入力フィールドの解決に使う）
  action: string;
  tableNames: Map<object, string>;
  tables: Record<string, object>;
  usedTables: Set<string>;
};

const META = Symbol("aac.meta");
const SPREAD = Symbol("aac.spread");
const TRANSITION = Symbol("aac.transition");

function label(node: Node): string {
  const head =
    node.origin.kind === "state"
      ? "state"
      : node.origin.kind === "decision"
        ? `decision:${node.origin.table}`
        : `formula:${node.origin.name}`;
  return node.path.length === 0 ? head : `${head}.${node.path.join(".")}`;
}

function columnsOf(ctx: Context, table: string): string[] {
  return Object.keys((ctx.tables[table] as any).default ?? {});
}

function symbolic(ctx: Context, origin: Origin, path: string[]): any {
  const node: Node = { origin, path, used: false };
  ctx.nodes.push(node);
  const isStateRoot = origin.kind === "state" && path.length === 0;
  const isDecisionRoot = origin.kind === "decision" && path.length === 0;

  // アロー関数は non-configurable な own property を持たないので ownKeys を自由に偽装できる
  return new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === META) return node;
      if (prop === ABSTRACT_APPLY) {
        return isStateRoot ? (table: object) => applyAbstract(ctx, table) : undefined;
      }
      if (prop === ABSTRACT_FORMULA) {
        return isStateRoot ? (name: string) => symbolic(ctx, { kind: "formula", name }, []) : undefined;
      }
      // これが無いと `await` が thenable とみなして then() を呼び、symbolic-call で落ちる
      if (prop === "then") return undefined;
      if (prop === Symbol.toPrimitive) {
        return (hint: string) => {
          throw new AbstractExecutionError(
            "symbolic-coercion",
            `${label(node)} をプリミティブ(${hint})に変換しようとした。算術・大小比較・文字列連結は記録できない`,
          );
        };
      }
      if (prop === Symbol.iterator) {
        return function* () {
          yield { [SPREAD]: node };
        };
      }
      if (typeof prop === "symbol") return undefined;
      node.used = true;
      return symbolic(ctx, origin, [...path, prop]);
    },
    apply(_target, _self, args) {
      if (origin.kind === "state" && path.length === 1) {
        node.used = true;
        return { [TRANSITION]: true, nextState: path[0], spec: args[0] ?? {} };
      }
      throw new AbstractExecutionError(
        "symbolic-call",
        `${label(node)} を関数として呼んだ。記号値に対するメソッド呼び出し (map / filter 等) は記録できない`,
      );
    },
    ownKeys() {
      if (isDecisionRoot) return columnsOf(ctx, origin.table);
      throw new AbstractExecutionError(
        "symbolic-enumerate",
        `${label(node)} のキーを列挙しようとした ({...x} / Object.keys 等)。キー集合が分からないため記録できない`,
      );
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (isDecisionRoot && typeof prop === "string" && columnsOf(ctx, origin.table).includes(prop)) {
        return { value: undefined, enumerable: true, configurable: true, writable: true };
      }
      return undefined;
    },
    has() {
      throw new AbstractExecutionError("symbolic-in", `${label(node)} に対する in 演算は記録できない`);
    },
    set() {
      throw new AbstractExecutionError("symbolic-write", `${label(node)} への代入はできない`);
    },
  });
}

function applyAbstract(ctx: Context, table: object): unknown {
  const name = ctx.tableNames.get(table);
  if (name === undefined) {
    throw new AbstractExecutionError(
      "unknown-table",
      "applyDecision に渡された表が、どの spec ファイルからも export されていないため名前を決められない",
    );
  }
  ctx.usedTables.add(name);
  return symbolic(ctx, { kind: "decision", table: name }, []);
}

function metaOf(value: unknown): Node | undefined {
  return typeof value === "function" ? (value as any)[META] : undefined;
}

// モデルがあれば、state の参照を「どの境界の値か」に解決する
function stateRef(ctx: Context, node: Node): string {
  const model = ctx.model;
  if (!model || node.path.length === 0) return label(node);
  const [field, ...rest] = node.path;
  const kind =
    field === "status"
      ? "status"
      : field in model.data
        ? "data"
        : field in model.queries
          ? "query"
          : field in (model.actions[ctx.action] ?? {})
            ? "input"
            : undefined;
  if (kind === undefined) {
    throw new AbstractExecutionError("unknown-field", `${label(node)}: モデルに "${field}" というデータ・問い合わせ・入力が無い`);
  }
  if (kind === "status") return "status";
  return `${kind}:${[field, ...rest].join(".")}`;
}

function useRef(ctx: Context, node: Node): string {
  node.used = true;
  if (node.origin.kind === "state") return stateRef(ctx, node);
  if (node.origin.kind === "formula") {
    if (ctx.model && !(node.origin.name in (ctx.model.formulas ?? {}))) {
      throw new AbstractExecutionError("unknown-formula", `モデルの formulas に "${node.origin.name}" が無い`);
    }
    return label(node);
  }
  if (node.origin.kind === "decision" && node.path.length > 0) {
    const column = node.path[0];
    if (!columnsOf(ctx, node.origin.table).includes(column)) {
      throw new AbstractExecutionError("unknown-column", `${label(node)}: 表に列 "${column}" が無い`);
    }
  }
  return label(node);
}

function serialize(ctx: Context, value: unknown): unknown {
  const node = metaOf(value);
  if (node) return { $ref: useRef(ctx, node) };
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AbstractExecutionError("non-json", `JSON にできない数値: ${value}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => serializeItem(ctx, item));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) out[key] = serialize(ctx, item);
    }
    return out;
  }
  throw new AbstractExecutionError("non-json", `出力に JSON にできない値が含まれている (${typeof value})`);
}

function serializeItem(ctx: Context, item: unknown): unknown {
  const spread = (item as any)?.[SPREAD] as Node | undefined;
  return spread ? { $spread: useRef(ctx, spread) } : serialize(ctx, item);
}

const schemaType = (schema: FieldSchema | undefined): string =>
  schema === undefined ? "unknown" : typeof schema === "string" ? schema : Array.isArray(schema) ? "string" : (schema as { type: string }).type;

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// 型は実行時に消えているので、スキーマは「リテラルの typeof」か「表の列の実データ」からしか復元できない
function schemaOf(ctx: Context, value: unknown): unknown {
  const node = metaOf(value);
  if (node) {
    if (node.origin.kind === "state") {
      const model = ctx.model;
      const [field] = node.path;
      const schema = model?.data[field] ?? model?.queries[field] ?? model?.actions[ctx.action]?.[field];
      return schemaType(schema);
    }
    if (node.origin.kind === "formula") return schemaType(ctx.model?.formulas?.[node.origin.name]);
    const rows = Object.values(ctx.tables[node.origin.table]);
    const types = rows.map((row) => typeName(node.path.reduce((cur: any, key) => cur?.[key], row)));
    return [...new Set(types)].sort().join(" | ");
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, schemaOf(ctx, item)]));
  }
  return typeName(value);
}

function commandsOf(ctx: Context, effects: unknown): unknown[] {
  if (effects === undefined) return [];
  const node = metaOf(effects);
  if (node) return [{ $spread: useRef(ctx, node) }];
  if (!Array.isArray(effects)) throw new AbstractExecutionError("bad-effects", "effects が配列ではない");
  return effects.map((effect) => {
    const item = serializeItem(ctx, effect) as any;
    if (item.$spread !== undefined || item.$ref !== undefined) return item;
    return { ...item, payloadSchema: schemaOf(ctx, (effect as any).payload ?? {}) };
  });
}

async function runCase(
  input: SpecInput,
  tableNames: Map<object, string>,
  action: string,
  fn: (state: any) => unknown,
  allowAsync: boolean,
) {
  const ctx: Context = { nodes: [], model: input.model, action, tableNames, tables: input.tables, usedTables: new Set() };
  const state = symbolic(ctx, { kind: "state" }, []);
  ctx.nodes[0].used = true;

  let out: any = fn(state);
  if (out instanceof Promise) {
    if (!allowAsync) {
      out.catch(() => {});
      throw new AbstractExecutionError("async-case", "case が Promise を返した。Layer 1 の case は同期でなければならない");
    }
    out = await out;
  }
  if (!out?.[TRANSITION]) {
    throw new AbstractExecutionError("no-transition", "case が state.<次状態>(...) の結果を返していない");
  }

  const transition: Record<string, unknown> = {
    nextState: out.nextState,
    emittedCommands: commandsOf(ctx, out.spec.effects),
  };
  if (out.spec.event !== undefined) transition.event = serialize(ctx, out.spec.event);
  if (out.spec.set !== undefined) {
    const unknown = Object.keys(out.spec.set).find((field) => input.model && !(field in input.model.data));
    if (unknown !== undefined) {
      throw new AbstractExecutionError("unknown-field", `set: モデルの data に "${unknown}" が無い`);
    }
    transition.set = serialize(ctx, out.spec.set);
  }

  const unused = ctx.nodes.filter((node) => !node.used).map(label);
  return { transition, unused: [...new Set(unused)], usedTables: ctx.usedTables };
}

export async function extract(input: SpecInput, options: ExtractOptions = {}) {
  const tableNames = new Map(Object.entries(input.tables).map(([name, table]) => [table, name]));
  const diagnostics: Diagnostic[] = [];
  const usedTables = new Set<string>();
  const behaviors = [];

  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    const transitions: Record<string, unknown> = {};
    for (const caseName of Object.keys(behavior.cases).sort()) {
      const report = (severity: Diagnostic["severity"], code: string, message: string) =>
        diagnostics.push({ severity, code, behavior: name, case: caseName, message });
      if (options.lint ?? true) {
        const found = lintCase(Function.prototype.toString.call(behavior.cases[caseName]));
        if (found) {
          report(
            "error",
            "forbidden-syntax",
            `case の ${found.line} 行目 \`${found.token}\`: ${found.reason}。分岐と演算は DecisionTable に寄せること`,
          );
          continue;
        }
      }
      try {
        const run = () => runCase(input, tableNames, name, behavior.cases[caseName], options.allowAsync ?? false);
        const first = await run();
        // 2回走らせて結果が変われば、乱数・時刻などの外部状態に依存している
        const second = await run();
        if (stableStringify(first.transition) !== stableStringify(second.transition)) {
          report("error", "nondeterministic", "同じ case を2回実行して結果が変わった (乱数・時刻などへの依存)");
          continue;
        }
        for (const ref of first.unused) {
          report(
            "warning",
            "unused-read",
            `${ref} を読んだが出力に現れない。if / === / 真偽判定などの分岐に使われた可能性があり、その場合は片方の経路しか記録されていない`,
          );
        }
        for (const table of first.usedTables) usedTables.add(table);
        transitions[caseName] = first.transition;
      } catch (error) {
        if (!(error instanceof AbstractExecutionError)) throw error;
        report("error", error.code, error.message);
      }
    }
    const unbound = (caseName: string, text: string) =>
      diagnostics.push({
        severity: "error",
        code: "unbound-condition",
        behavior: name,
        case: caseName,
        message: `条件 "${text}" に bindSpecification による評価関数が登録されていない`,
      });
    for (const text of behavior.where ?? []) if (!getCondition(text)) unbound("", text);
    for (const text of Object.keys(behavior.cases)) if (text !== "default" && !getCondition(text)) unbound(text, text);
    behaviors.push({
      name,
      from: [...(behavior.from ?? input.model?.states ?? [])],
      preconditions: [...(behavior.where ?? [])],
      transitions,
    });
  }

  const specError = (code: string, message: string) =>
    diagnostics.push({ severity: "error", code, behavior: "", case: "", message });

  const decisions: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(input.tables)) {
    const missing = Object.keys(table).filter((row) => row !== "default" && !getCondition(row));
    if (usedTables.has(name)) {
      for (const row of missing) {
        specError("unbound-condition", `決定表 ${name} の条件 "${row}" に bindSpecification による評価関数が登録されていない`);
      }
    }
    if (usedTables.has(name) || missing.length === 0) decisions[name] = { bound: missing.length === 0, rows: table };
  }
  for (const formula of Object.keys(input.model?.formulas ?? {})) {
    if (!getFormula(formula)) specError("unbound-formula", `計算 "${formula}" に bindSpecification による関数が登録されていない`);
  }
  for (const invariant of input.model?.invariants ?? []) {
    if (!getInvariant(invariant)) {
      specError("unbound-invariant", `不変条件 "${invariant}" に bindSpecification による関数が登録されていない`);
    }
  }

  const ir = { irVersion: IR_VERSION, behaviors, decisions, ...(input.model ? { model: input.model } : {}) };
  return { ir, diagnostics };
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
