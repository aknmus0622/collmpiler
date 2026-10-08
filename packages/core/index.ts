// 仕様を書くための語彙 (DSL.md): 節、`{}` から節への変換、文法の表、木の検査。
//
// 書かれた木は、内部の形 (internal.ts。Layer 1 の値と、解釈の structure / meanings) に変換して、読み込む側に渡す。
// internal.ts は、以前の書き方の実装でもあった。語彙としては、もう公開していない。
//
// - 正規形は、節だけ。`{}` は「名前つきの子の並び」の糖衣構文で、何の名前かは、受け取る語が決める。
// - 検査の主役は、型ではなく、木の検査 (check)。文法は、データ (GRAMMAR) として持つ。
// - 節は、作られた場所（ファイルと行）を覚える。診断に出すため。

import { BINDING, COMPONENT, activate, calculate as calculateIn, decide as decideIn, resolveComponent } from "./internal.ts";
import type { BoundSpecification } from "./internal.ts";

export { BINDING, COMPONENT, RuleConflictError, UnboundNameError, activate, decisionTable, dir, file, isDescription, isFragment, matchCondition, ref, text } from "./internal.ts";
export type {
  AssetDeclaration, AssetPhase, BoundSpecification, CommandShape, Constant, Declaration, FieldSchema, Fields, Layer1, OutputSchema, Structure, Table,
} from "./internal.ts";

export type Position = { file: string; line: number };

export type Node = {
  kind: string;
  // 名前のある節は、親に含まれる。名前の無い component は、親に溶け込む
  name?: string;
  // 葉が持つ値（説明の文、定数、参照、状態の名前の並び、など）
  value?: unknown;
  children: Node[];
  at?: Position;
};

const NODE = Symbol.for("clp.node");
export const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && NODE in value;

// 節を作った場所: このファイルの外の、いちばん手前の呼び出し元
const HERE = import.meta.url;
function position(): Position | undefined {
  // stackTraceLimit は V8 のもの（型は @types/node が持つ。このパッケージは、それに頼らない）
  const limited = Error as { stackTraceLimit?: number };
  const previous = limited.stackTraceLimit;
  limited.stackTraceLimit = 20;
  const stack = new Error().stack ?? "";
  limited.stackTraceLimit = previous;
  for (const line of stack.split("\n").slice(1)) {
    const match = /\(?((?:file:\/\/)?[^()\s]+):(\d+):\d+\)?$/.exec(line.trim());
    if (!match || match[1] === HERE || match[1].startsWith("node:")) continue;
    return { file: match[1].replace(/^file:\/\//, ""), line: Number(match[2]) };
  }
  return undefined;
}

type Primitive = "boolean" | "integer" | "number" | "string";
export type TypeLike = Primitive | readonly string[] | Node;
const PRIMITIVES = new Set<unknown>(["boolean", "integer", "number", "string"]);

function make(kind: string, fields: { name?: string; value?: unknown; children?: unknown[] } = {}): Node {
  const node: Node = { kind, children: (fields.children ?? []).flatMap(child) };
  if (fields.name !== undefined) node.name = fields.name;
  if (fields.value !== undefined) node.value = fields.value;
  const at = position();
  if (at) node.at = at;
  Object.defineProperty(node, NODE, { value: true });
  return node;
}

// 子として渡されたもの。名前の無い component は溶け込む（その子が、ここの子になる）
function child(value: unknown): Node[] {
  // 型は、そのまま子に書ける（"integer" や、列挙の配列）
  if (PRIMITIVES.has(value) || (Array.isArray(value) && value.length > 0 && value.every((member) => typeof member === "string"))) return [type(value)];
  if (!isNode(value)) return [make("unknown", { value })];
  return value.kind === "component" && value.name === undefined ? value.children : [value];
}

// --- 型 ---


// 型の位置に書かれたものを、型の節にする。裸の `{}` は、型として書けない
function type(value: unknown): Node {
  if (isNode(value)) return value;
  if (PRIMITIVES.has(value)) return make("type", { value });
  if (Array.isArray(value) && value.every((member) => typeof member === "string")) return make("enum", { value: [...value] });
  return make("unknown", { value });
}
const settings = (given: Record<string, unknown> = {}) => Object.entries(given).map(([name, value]) => make("setting", { name, value }));

type Bounds = { min?: number; max?: number; around?: readonly number[] };
export const integer = (given?: Bounds) => make("type", { value: "integer", children: settings(given) });
export const number = (given?: Bounds) => make("type", { value: "number", children: settings(given) });
export const string = (given?: { examples?: readonly string[] }) => make("type", { value: "string", children: settings(given) });
export const boolean = () => make("type", { value: "boolean" });
export const list = (of: TypeLike) => make("list", { children: [type(of)] });
export const optional = (of: TypeLike) => make("optional", { children: [type(of)] });
// フィールド: 名前つきの、型か値。どちらなのかは、受け取る語が決める（record なら型、set や responds なら値）
export const field = (name: string, content: unknown) => make("field", { name, value: content });
const typedField = (name: string, content: unknown) => make("field", { name, children: [type(content)] });
const valueField = (name: string, value: unknown) => make("field", { name, children: [make("value", { value })] });
const typedFields = (given: Record<string, unknown>) => Object.entries(given).map(([name, content]) => typedField(name, content));
const valueFields = (given: Record<string, unknown>) => Object.entries(given).map(([name, value]) => valueField(name, value));
// field(...) で書かれたフィールドを、受け取る語の読み方にそろえる
const pending = (item: unknown): item is Node => isNode(item) && item.kind === "field" && item.children.length === 0;
const isDict = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && !isNode(value) && !("$ref" in value);

export function record(...given: unknown[]): Node {
  return make("record", { children: isDict(given[0]) ? typedFields(given[0]) : given.map((item) => (pending(item) ? typedField(item.name!, item.value) : item)) });
}

// --- 説明と、場面を言う節 ---

export const description = (text: string) => make("description", { value: text });
// input({...}) は、input(record({...})) の短い書き方
export const input = (shape: Record<string, TypeLike> | Node = {}) => make("input", { children: [isDict(shape) ? record(shape) : shape] });
export const output = (shape: TypeLike) => make("output", { children: [type(shape)] });
export const from = (...states: string[]) => make("from", { value: states });
// 条件を複数書くと、その数だけの事前条件になる
export const onlyIf = (...conditions: string[]) =>
  conditions.length === 1 ? make("onlyIf", { value: conditions[0] }) : make("component", { children: conditions.map((condition) => make("onlyIf", { value: condition })) });
export const when = (condition: string, ...children: Node[]) => make("when", { name: condition, children });
export const otherwise = (...children: Node[]) => make("otherwise", { children });

// --- 起きることを言う節（動詞） ---

// 値の並び: `{}`（フィールド名 → 値）か、field(...) の並び
const values = (given: unknown[]): unknown[] =>
  given.flatMap((item) => (isDict(item) ? valueFields(item) : [pending(item) ? valueField(item.name!, item.value) : item]));

export const goTo = (state: string) => make("goTo", { value: state });
export const does = (text: string) => make("does", { value: text });
export const set = (...given: unknown[]) => make("set", { children: values(given) });
export const asks = (alias: string, query: string, ...given: unknown[]) => make("asks", { name: alias, value: query, children: values(given) });
export const emits = (effect: string, ...given: unknown[]) => make("emits", { value: effect, children: values(given) });
export const onlyWhen = (condition: unknown) => make("onlyWhen", { value: condition });
// 結果を返す。値1つか、フィールドの並び
export const responds = (...given: unknown[]) =>
  make("responds", { children: given.length === 1 && !isDict(given[0]) && !isNode(given[0]) ? [make("value", { value: given[0] })] : values(given) });

// --- 性質を言う節 ---

export const initially = (value: unknown) => make("initially", { value });
export const fresh = () => make("fresh");
export const increasing = () => make("increasing");
export const meaning = (fn: (...args: never[]) => unknown) => make("meaning", { value: fn });

// --- 宣言する節（名詞） ---

const named = (kind: string) => (name: string, ...children: unknown[]) => make(kind, { name, children });
export const state = named("state");
export const query = named("query");
export const effect = named("effect");
export const calculation = named("calculation");
export const command = named("command");
// データは、型をそのまま子に書ける
export const data = (name: string, ...children: unknown[]) => make("data", { name, children: children.map((item) => (isNode(item) ? item : type(item))) });
// 条件と不変条件は、文が名前を兼ねる。名前を付けるなら、文は説明として書く
export const condition = (name: string, ...children: unknown[]) =>
  make("condition", { name, children: children.map((item) => (typeof item === "string" ? description(item) : typeof item === "function" ? meaning(item as never) : item)) });
export const invariant = (name: string, ...children: unknown[]) =>
  make("invariant", { name, children: children.map((item) => (typeof item === "string" ? description(item) : typeof item === "function" ? meaning(item as never) : item)) });
export const decision = (name: string, table: unknown) => make("decision", { name, value: table });
export const init = (stateName: string) => make("init", { value: stateName });

// dict 形式のまとまり。キーは、節の種類のまとまりの名前
export type ComponentShape = {
  description?: string | Node;
  states?: readonly string[] | Record<string, Node> | Node;
  init?: string;
  data?: Record<string, unknown> | Node;
  queries?: Record<string, unknown> | Node;
  effects?: Record<string, unknown> | Node;
  decisions?: Record<string, unknown>;
  calculations?: Record<string, unknown> | Node;
  conditions?: Record<string, string>;
  invariants?: readonly string[] | Record<string, string>;
  commands?: Record<string, unknown> | Node;
  assets?: readonly unknown[];
};
const GROUPS: Record<string, string> = { data: "data", queries: "query", effects: "effect", calculations: "calculation", commands: "command" };

// 名前つきの項目の中身: 名前の無い component（溶け込む）、節1つ、または裸の型
function entry(kind: string, name: string, content: unknown): Node {
  if (isNode(content)) {
    // 型の節をそのまま書いたとき: データならその形、問い合わせと計算なら、返すものの形
    const bare = ["type", "enum", "record", "list", "optional"].includes(content.kind);
    if (bare && kind !== "data") return make(kind, { name, children: [output(content)] });
    return make(kind, { name, children: [content] });
  }
  // 裸の型（文字列か、列挙）
  if (kind === "data") return make(kind, { name, children: [type(content)] });
  if (kind === "query" || kind === "calculation") return make(kind, { name, children: [output(content as TypeLike)] });
  return make(kind, { name, children: [make("unknown", { value: content })] });
}

function fromShape(shape: ComponentShape): Node[] {
  const children: Node[] = [];
  const known = new Set(["description", "states", "init", "decisions", "conditions", "invariants", "assets", "meanings", ...Object.keys(GROUPS)]);
  for (const key of Object.keys(shape)) if (!known.has(key)) children.push(make("unknown", { name: key, value: (shape as Record<string, unknown>)[key] }));
  if (shape.description !== undefined) children.push(typeof shape.description === "string" ? description(shape.description) : shape.description);
  if (Array.isArray(shape.states)) for (const name of shape.states) children.push(state(name));
  else if (isNode(shape.states)) children.push(make("group", { name: "states", children: [shape.states] }));
  else if (shape.states) for (const [name, content] of Object.entries(shape.states)) children.push(state(name, content));
  if (shape.init !== undefined) children.push(init(shape.init));
  for (const [group, kind] of Object.entries(GROUPS)) {
    const given = (shape as Record<string, unknown>)[group];
    if (given === undefined) continue;
    // まとまりを、文だけで書いたとき
    if (isNode(given)) children.push(make("group", { name: group, children: [given] }));
    else for (const [name, content] of Object.entries(given as Record<string, unknown>)) children.push(entry(kind, name, content));
  }
  for (const [name, table] of Object.entries(shape.decisions ?? {})) children.push(decision(name, table));
  for (const [name, sentence] of Object.entries(shape.conditions ?? {})) children.push(condition(name, sentence));
  if (Array.isArray(shape.invariants)) for (const sentence of shape.invariants) children.push(invariant(sentence));
  else for (const [name, sentence] of Object.entries(shape.invariants ?? {})) children.push(invariant(name, sentence));
  if (shape.assets !== undefined) children.push(make("assets", { value: shape.assets }));
  return children;
}

// 節を束ねる。3つの書き方:
//   component({ ... })          dict 形式（糖衣構文）
//   component("Name", ...節)     名前のある部品（正規形）
//   component(...節)             名前の無い束。置いた先に、溶け込む
export function component(shape: ComponentShape): Node;
export function component(name: string, ...children: unknown[]): Node;
export function component(...children: unknown[]): Node;
export function component(...given: unknown[]): Node {
  if (given.length === 1 && isDict(given[0])) return make("component", { children: fromShape(given[0] as ComponentShape) });
  if (typeof given[0] === "string") return make("component", { name: given[0], children: given.slice(1) });
  return make("component", { children: given });
}

// --- 文法: 親の種類 × 子の種類 → いくつまで書けるか ---
// 表に無い組み合わせは、書けない。"#type" は、型の節（type / enum / record / list / optional）のどれか

const MANY = Number.POSITIVE_INFINITY;
// 文 (description / does) は、いくつ書いても、つながって1つになる
const HAPPENS = { goTo: 1, set: MANY, emits: MANY, responds: 1, does: MANY };
export const GRAMMAR: Record<string, Record<string, number>> = {
  component: {
    description: 1, state: MANY, init: 1, data: MANY, query: MANY, effect: MANY, decision: MANY, calculation: MANY,
    condition: MANY, invariant: MANY, command: MANY, group: MANY, component: MANY, assets: 1,
  },
  group: { description: 1 },
  state: { description: 1 },
  data: { description: 1, "#type": 1, initially: 1 },
  query: { description: 1, input: 1, output: 1, fresh: 1, increasing: 1 },
  effect: { description: 1, input: 1 },
  calculation: { description: 1, output: 1, meaning: 1 },
  condition: { description: 1, meaning: 1 },
  invariant: { description: 1, meaning: 1 },
  command: { description: MANY, input: 1, output: 1, from: 1, onlyIf: MANY, asks: MANY, when: MANY, otherwise: 1, ...HAPPENS },
  when: HAPPENS,
  otherwise: HAPPENS,
  input: { "#type": 1 },
  output: { "#type": 1 },
  record: { field: MANY },
  list: { "#type": 1 },
  optional: { "#type": 1 },
  type: { setting: MANY },
  assets: {},
  field: { "#type": 1, value: 1 },
  set: { field: MANY },
  asks: { field: MANY },
  emits: { field: MANY, onlyWhen: 1 },
  responds: { field: MANY, value: 1 },
};
// 解釈の根は、部品と同じものを子に持てる
GRAMMAR.interpretation = GRAMMAR.component;
const TYPE_KINDS = new Set(["type", "enum", "record", "list", "optional"]);
const slot = (kind: string) => (TYPE_KINDS.has(kind) ? "#type" : kind);

// 診断に出す、節の呼び方
const LABEL: Record<string, string> = {
  component: "部品", interpretation: "解釈", assets: "添付資料 (assets)", group: "まとまり", description: "説明 (description)", state: "状態", init: "初期状態 (init)", data: "データ",
  query: "問い合わせ", effect: "副作用", decision: "決定表", calculation: "計算", condition: "条件", invariant: "不変条件",
  command: "コマンド", input: "入力 (input)", output: "返すものの形 (output)", from: "from", onlyIf: "onlyIf", when: "場合 (when)",
  otherwise: "otherwise", goTo: "goTo", set: "set", asks: "asks", emits: "emits", responds: "responds", does: "does",
  initially: "initially", fresh: "fresh", increasing: "increasing", onlyWhen: "onlyWhen", meaning: "意味の関数", field: "フィールド",
  value: "値", "#type": "型", type: "型", enum: "列挙", record: "record", list: "list", optional: "optional", setting: "設定",
};
const label = (node: Node) => `${LABEL[node.kind] ?? node.kind}${node.name !== undefined && node.kind !== "when" ? ` "${node.name}"` : ""}`;

export type Diagnostic = { code: string; message: string; at?: Position };

// 木の検査: 文法の表に照らして、書けない組み合わせ、多すぎる子、重なった名前を報告する
export function check(root: Node): Diagnostic[] {
  const found: Diagnostic[] = [];
  const report = (code: string, node: Node, message: string) => found.push({ code, message, ...(node.at ? { at: node.at } : {}) });
  const visit = (parent: Node) => {
    const allowed = GRAMMAR[parent.kind] ?? {};
    const counts = new Map<string, number>();
    const names = new Map<string, Node>();
    for (const node of parent.children) {
      if (node.kind === "unknown") {
        const what = node.name !== undefined ? `"${node.name}" というまとまり` : typeof node.value === "object" ? "裸の {}（受け取る語の無いもの）" : JSON.stringify(node.value);
        report("unknown", node.at ? node : parent, `${label(parent)}の中に、${what}は書けません`);
        continue;
      }
      const key = slot(node.kind);
      if (!(key in allowed)) {
        report("misplaced", node, `${label(parent)}の中に、${label(node)}は書けません`);
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (counts.get(key)! === allowed[key] + 1) {
        report("too-many", node, `${label(parent)}の中に、${LABEL[key] ?? key}を ${allowed[key] + 1} つ以上は書けません`);
      }
      // 同じ種類で、同じ名前の節は、1つだけ
      if (node.name !== undefined) {
        const id = `${node.kind}:${node.name}`;
        if (names.has(id)) report("duplicate", node, `${label(parent)}の中に、${label(node)}が2回書かれています`);
        names.set(id, node);
      }
      visit(node);
    }
    if (parent.kind === "command") {
      const cases = parent.children.filter((node) => node.kind === "when" || node.kind === "otherwise");
      const direct = parent.children.filter((node) => node.kind in HAPPENS);
      if (cases.length > 0 && direct.length > 0) {
        report("mixed-outcome", direct[0], `${label(parent)}は場合に分かれているので、${label(direct[0])}は、場合 (when / otherwise) の中に書いてください`);
      }
    }
    if (parent.kind === "component") {
      const states = parent.children.filter((node) => node.kind === "state");
      const start = parent.children.find((node) => node.kind === "init");
      // otherwise と init が無いことは、ここでは報告しない（Layer 1 に無ければ、解釈が足せる。重ねたあとで確かめる）
      if (start && states.length > 0 && !states.some((node) => node.name === start.value)) {
        report("unknown-state", start, `初期状態 "${String(start.value)}" は、状態にありません`);
      }
    }
  };
  visit(root);
  return found;
}

// 比較や保存のための形: 位置を落とした、素のデータ。意味の関数は "(function)" と書く
export function plain(node: Node): unknown {
  return {
    kind: node.kind,
    ...(node.name !== undefined ? { name: node.name } : {}),
    ...(node.value !== undefined ? { value: typeof node.value === "function" ? "(function)" : node.value } : {}),
    ...(node.children.length > 0 ? { children: node.children.map(plain) } : {}),
  };
}

// --- いまの内部の形への変換 ---
// 仕様を読み込む側 (packages/cli) は、いまの書き方が作る形（Layer 1 の値と、解釈の structure / meanings）を扱う。
// 新しい書き方の木を、その形に変換する。新しい機能（コマンドの結果、構造を持つ値など）は、内部の形がまだ持てないので、
// 「まだ使えません」と報告する

const NOT_YET = "は、まだ使えません（この書き方は決まっていますが、実装がこれからです）";
type Shape = Record<string, unknown>;
type Collected = { problems: Diagnostic[] };
const later = (into: Collected, node: Node, what: string) =>
  void into.problems.push({ code: "not-yet", message: `${what}${NOT_YET}`, ...(node.at ? { at: node.at } : {}) });

// 型の節 → いまのフィールドの型
function schemaOf(node: Node, into: Collected): unknown {
  if (node.kind === "enum") return node.value;
  if (node.kind === "type") {
    const given = Object.fromEntries(node.children.map((setting) => [setting.name!, setting.value]));
    if ("examples" in given) later(into, node, "string の examples ");
    const { examples: _examples, ...bounds } = given;
    return Object.keys(bounds).length === 0 ? node.value : { type: node.value, ...bounds };
  }
  later(into, node, `型 ${node.kind} `);
  return "string";
}
const fieldsOf = (node: Node, into: Collected): Shape => {
  const shape = node.children[0];
  if (shape?.kind !== "record") {
    if (shape) later(into, shape, `input に書いた ${shape.kind} `);
    return {};
  }
  return Object.fromEntries(shape.children.map((item) => [item.name!, schemaOf(item.children[0], into)]));
};
const valuesOf = (node: Node): Shape =>
  Object.fromEntries(node.children.filter((item) => item.kind === "field").map((item) => [item.name!, item.children[0]?.value]));
const join = (a: unknown, b: string) => (a === undefined ? b : `${String(a)} ${b}`);

// コマンドが返すものの形: 値1つの型か、record。record のフィールドは optional(...) にできる
function outputOf(node: Node, into: Collected): unknown {
  if (node.kind !== "record") return schemaOf(node, into);
  const optional: string[] = [];
  const fields = Object.fromEntries(
    node.children.map((item) => {
      const inner = item.children[0];
      if (inner.kind !== "optional") return [item.name!, schemaOf(inner, into)];
      optional.push(item.name!);
      return [item.name!, schemaOf(inner.children[0], into)];
    }),
  );
  return { record: fields, ...(optional.length > 0 ? { optional } : {}) };
}

// 起きることの節 → いまの形（goTo / does は Layer 1 と解釈の両方、effects / set は解釈だけが持つ）
function happens(target: Shape, node: Node, into: Collected): boolean {
  switch (node.kind) {
    case "goTo":
      target.goTo = node.value;
      return true;
    case "does":
      target.does = join(target.does, String(node.value));
      return true;
    case "set":
      target.set = { ...(target.set as Shape | undefined), ...valuesOf(node) };
      return true;
    case "emits": {
      const condition = node.children.find((item) => item.kind === "onlyWhen");
      target.effects = [...((target.effects as unknown[] | undefined) ?? []), { [String(node.value)]: valuesOf(node), ...(condition ? { when: condition.value } : {}) }];
      return true;
    }
    case "responds": {
      // 値1つか、フィールドの組
      const [only] = node.children;
      target.responds = node.children.length === 1 && only.kind === "value" ? only.value : valuesOf(node);
      return true;
    }
    default:
      return false;
  }
}

// 項目（データ、問い合わせ、副作用、計算、コマンド）の子 → いまの「部品が決める構造」
function shapeOfEntry(node: Node, into: Collected): Shape {
  const shape: Shape = {};
  for (const item of node.children) {
    if (happens(shape, item, into)) continue;
    switch (item.kind) {
      case "description":
        shape.description = join(shape.description, String(item.value));
        break;
      case "type":
      case "enum":
      case "record":
      case "list":
      case "optional":
        shape.type = schemaOf(item, into);
        break;
      case "input":
        shape.input = { ...(shape.input as Shape | undefined), ...fieldsOf(item, into) };
        break;
      case "output":
        shape.output = node.kind === "command" ? outputOf(item.children[0], into) : schemaOf(item.children[0], into);
        break;
      case "from":
        shape.from = [...((shape.from as string[] | undefined) ?? []), ...(item.value as string[])];
        break;
      case "onlyIf":
        shape.onlyIf = [...((shape.onlyIf as string[] | undefined) ?? []), item.value];
        break;
      case "asks":
        shape.asks = { ...(shape.asks as Shape | undefined), [item.name!]: { [String(item.value)]: valuesOf(item) } };
        break;
      case "when":
      case "otherwise": {
        const outcome: Shape = {};
        for (const part of item.children) happens(outcome, part, into);
        shape.when = { ...(shape.when as Shape | undefined), [item.kind === "when" ? item.name! : "otherwise"]: outcome };
        break;
      }
      case "meaning":
        break;
      case "initially":
      case "fresh":
      case "increasing":
        later(into, item, `${item.kind} `);
        break;
    }
  }
  return shape;
}

const GROUP_OF: Record<string, string> = { data: "data", query: "queries", effect: "effects", calculation: "calculations", command: "commands" };

// Layer 1 の木 → いまの Layer 1 の値。文だけの項目は { $description }、部品のある項目は { $fragment }
function layer1From(root: Node): { layer1: Shape; problems: Diagnostic[] } {
  const into: Collected = { problems: [] };
  const layer1: Shape = {};
  const states: [string, string | undefined][] = [];
  for (const node of root.children) {
    switch (node.kind) {
      case "description":
        layer1.description = join(layer1.description, String(node.value));
        break;
      case "state":
        states.push([node.name!, node.children.find((item) => item.kind === "description")?.value as string | undefined]);
        break;
      case "init":
        layer1.init = node.value;
        break;
      case "group":
        layer1[node.name!] = { $description: node.children[0]?.value };
        break;
      case "decision":
        layer1.decisions = { ...(layer1.decisions as Shape | undefined), [node.name!]: node.value };
        break;
      case "invariant":
        layer1.invariants = [...((layer1.invariants as string[] | undefined) ?? []), node.name!];
        break;
      case "condition":
        later(into, node, "名前を付けた条件 (conditions) ");
        break;
      case "assets":
        layer1.assets = node.value;
        break;
      case "component":
        later(into, node, "部品の中の部品 ");
        break;
      default: {
        const group = GROUP_OF[node.kind];
        if (!group) break;
        const shape = shapeOfEntry(node, into);
        // Layer 1 は、覚えることと副作用を、文 (does) で言う。構造として書くのは、まだ解釈だけ
        for (const outcome of [shape, ...Object.values((shape.when as Record<string, Shape> | undefined) ?? {})]) {
          for (const key of ["set", "effects"]) {
            if (outcome[key] !== undefined) {
              later(into, node, `Layer 1 のコマンドに書いた ${key === "set" ? "set" : "emits"} `);
              delete outcome[key];
            }
          }
        }
        const only = Object.keys(shape).length === 1 && shape.description !== undefined;
        layer1[group] = { ...(layer1[group] as Shape | undefined), [node.name!]: only ? { $description: shape.description } : { $fragment: shape } };
      }
    }
  }
  if (states.length > 0) {
    layer1.states = states.every(([, text]) => text !== undefined) ? Object.fromEntries(states.map(([name, text]) => [name, { $description: text }])) : states.map(([name]) => name);
  }
  Object.defineProperty(layer1, COMPONENT, { value: true });
  return { layer1, problems: into.problems };
}

const LAYER1 = new WeakMap<Node, { layer1: Shape; problems: Diagnostic[] }>();
// export された値が、部品（検証の単位）か。コマンドの断片（input や when を束ねたもの）は、部品ではない
export const isComponent = (value: unknown): value is Node =>
  isNode(value) && value.kind === "component" && value.children.every((node) => node.kind in GRAMMAR.component);
// 部品の木に当たる、いまの Layer 1 の値（同じ木には、いつも同じ値を返す）
export function layer1Of(node: Node): object {
  if (!LAYER1.has(node)) LAYER1.set(node, layer1From(node));
  return LAYER1.get(node)!.layer1;
}

// 解釈: 同じ木に、節を足したもの。dict 形式では、関数を meanings の表にまとめる
export type Meanings = {
  conditions?: Record<string, (state: any) => boolean>;
  calculations?: Record<string, (state: any) => unknown>;
  invariants?: Record<string, (state: any) => boolean>;
};
const TREES = new WeakMap<object, { tree: Node; problems: Diagnostic[] }>();

export function interpretation(target: Node, written: ComponentShape & { meanings?: Meanings }): BoundSpecification;
export function interpretation(target: Node, ...children: Node[]): BoundSpecification;
export function interpretation(target: Node, ...given: unknown[]): BoundSpecification {
  const dict = given.length === 1 && isDict(given[0]) ? (given[0] as ComponentShape & { meanings?: Meanings }) : undefined;
  const tree = make("interpretation", { children: dict ? fromShape(dict) : given });
  const into: Collected = { problems: [] };
  const structure: Shape = {};
  const meanings: Required<Meanings> = { conditions: { ...dict?.meanings?.conditions }, calculations: { ...dict?.meanings?.calculations }, invariants: { ...dict?.meanings?.invariants } };
  const fn = (node: Node) => node.children.find((item) => item.kind === "meaning")?.value as never;
  const states: string[] = [];
  for (const node of tree.children) {
    switch (node.kind) {
      case "state":
        states.push(node.name!);
        break;
      case "init":
        structure.init = node.value;
        break;
      case "invariant":
        if (node.children.some((item) => item.kind === "description") || !fn(node)) structure.invariants = [...((structure.invariants as string[] | undefined) ?? []), node.name!];
        if (fn(node)) meanings.invariants[node.name!] = fn(node);
        break;
      case "condition":
        if (fn(node)) meanings.conditions[node.name!] = fn(node);
        break;
      case "decision":
        structure.decisions = { ...(structure.decisions as Shape | undefined), [node.name!]: node.value };
        break;
      default: {
        const group = GROUP_OF[node.kind];
        if (!group) break;
        const { type, description: sentence, ...shape } = shapeOfEntry(node, into);
        if (node.kind === "calculation" && fn(node)) meanings.calculations[node.name!] = fn(node);
        // 解釈では、データの型は type、計算の文は is と書く（いまの内部の形）
        const entry = { ...shape, ...(type !== undefined ? { type } : {}), ...(sentence !== undefined ? (node.kind === "calculation" ? { is: sentence } : { description: sentence }) : {}) };
        structure[group] = { ...(structure[group] as Shape | undefined), [node.name!]: entry };
      }
    }
  }
  if (states.length > 0) structure.states = states;

  const layer1 = layer1Of(target);
  const { declaration, commands, problems } = resolveComponent(layer1, structure);
  const value: BoundSpecification = {
    source: target,
    component: declaration,
    commands,
    conditions: meanings.conditions,
    ...(Object.keys(meanings.calculations).length > 0 ? { calculations: meanings.calculations } : {}),
    ...(Object.keys(meanings.invariants).length > 0 ? { invariants: meanings.invariants } : {}),
    problems,
  };
  Object.defineProperty(value, BINDING, { value: true });
  activate(value);
  TREES.set(value, { tree, problems: into.problems });
  return value;
}

// 木の検査の結果: 文法に合わない所と、まだ使えない書き方。value は、部品の木か、解釈
export function grammarOf(value: object): Diagnostic[] {
  if (isNode(value)) return [...check(value), ...(LAYER1.get(value)?.problems ?? (layer1Of(value), LAYER1.get(value)!.problems))];
  const found = TREES.get(value);
  return found ? [...check(found.tree), ...found.problems] : [];
}

// 意味の関数の中から、決定表を引く、ほかの計算の結果を使う
export const decide = (target: Node, decision: string, state: object): any => decideIn(target, decision, state);
export const calculate = (target: Node, name: string, state: object): any => calculateIn(target, name, state);
