// 仕様を書くための語彙 (DSL.md): 節、`{}` から節への変換、文法の表、木の検査。
//
// 書かれた木は、内部の形 (internal.ts。Layer 1 の値と、解釈の structure / meanings) に変換して、読み込む側に渡す。
// internal.ts は、以前の書き方の実装でもあった。語彙としては、もう公開していない。
//
// - 正規形は、節だけ。`{}` は「名前つきの子の並び」の糖衣構文で、何の名前かは、受け取る語が決める。
// - 検査の主役は、型ではなく、木の検査 (check)。文法は、データ (GRAMMAR) として持つ。
// - 節は、作られた場所（ファイルと行）を覚える。診断に出すため。

import { BINDING, COMPONENT, UnboundNameError, activate, active, matchCondition, resolveComponent } from "./internal.ts";
import type { BoundSpecification, Table } from "./internal.ts";

export { BINDING, COMPONENT, RuleConflictError, UnboundNameError, activate, dir, file, isDescription, isFragment, matchCondition, text } from "./internal.ts";
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

// 取っ手が表す節（input の取っ手など）
const STANDS_FOR = Symbol.for("clp.standsFor");
const nodeOf = (value: unknown): Node | undefined =>
  (typeof value === "object" || typeof value === "function") && value !== null && STANDS_FOR in value ? ((value as Record<symbol, Node>)[STANDS_FOR]) : undefined;

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
  // 節を表す取っ手（input）は、その節
  const stood = nodeOf(value);
  if (stood) return [stood];
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
// いま覚えている並び (data) の要素から、入力を選ぶ。field があれば、要素のそのフィールドから。型は、選ぶ値の型
// 覚えているデータ（取っ手）の中から選ぶ入力。field は、その一覧の要素のフィールド。
// 多数ある部品（Part.items）を指せば、いまある部品のキーから選ぶ
export const among = (data: DataHandle | { readonly $part: string }, field?: string, of: "string" | "integer" = "string") =>
  make("type", {
    value: of,
    children: [make("setting", { name: "among", value: { data: "$part" in data ? data.$part : String(data.path), ...(field === undefined ? {} : { field }) } })],
  });
export const integer = (given?: Bounds) => make("type", { value: "integer", children: settings(given) });
export const number = (given?: Bounds) => make("type", { value: "number", children: settings(given) });
export const string = (given?: { examples?: readonly string[] }) => make("type", { value: "string", children: settings(given) });
export const boolean = () => make("type", { value: "boolean" });
export const list = (of: TypeLike) => make("list", { children: [type(of)] });
export const optional = (of: TypeLike) => make("optional", { children: [type(of)] });
// フィールド: 名前つきの、型か値。どちらなのかは、受け取る語が決める（record なら型、set や responds なら値）
const field = (name: string, content: unknown) => make("field", { name, value: content });
const typedField = (name: string, content: unknown) => make("field", { name, children: [type(content)] });
const valueField = (name: string, value: unknown) => make("field", { name, children: [make("value", { value })] });
const typedFields = (given: Record<string, unknown>) => Object.entries(given).map(([name, content]) => typedField(name, content));
const valueFields = (given: Record<string, unknown>) => Object.entries(given).map(([name, value]) => valueField(name, value));
// field(...) で書かれたフィールドを、受け取る語の読み方にそろえる
const pending = (item: unknown): item is Node => isNode(item) && item.kind === "field" && item.children.length === 0;
const isDict = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !isNode(value) && !("$ref" in value) && !(STANDS_FOR in value) && !(GROUP in value) && !(HANDLE in value);

// フィールドの組の型。フィールドの名前を、型として持つ（入力の取っ手が、フィールドの取っ手を持てるように）
export type RecordType<K extends string = string> = Node & { readonly __fields?: K };
export function record<const S extends Record<string, unknown>>(shape: S): RecordType<keyof S & string>;
export function record(...given: unknown[]): Node;
export function record(...given: unknown[]): Node {
  return make("record", { children: isDict(given[0]) ? typedFields(given[0]) : given.map((item) => (pending(item) ? typedField(item.name!, item.value) : item)) });
}

// --- 説明と、場面を言う節 ---

const description = (text: string) => make("description", { value: text });
// input({...}) は、input(record({...})) の短い書き方
const inputNode = (shape: Record<string, TypeLike> | Node = {}) => make("input", { children: [isDict(shape) ? record(shape) : shape] });
const output = (shape: TypeLike) => make("output", { children: [type(shape)] });
const fromNode = (...states: string[]) => make("from", { value: states });
// 条件を複数書くと、その数だけの事前条件になる
const onlyIfNode = (...conditions: string[]) =>
  conditions.length === 1 ? make("onlyIf", { value: conditions[0] }) : make("component", { children: conditions.map((condition) => make("onlyIf", { value: condition })) });
const whenNode = (condition: string, ...children: unknown[]) => make("when", { name: condition, children });
export const otherwise = (...children: unknown[]) => make("otherwise", { children });

// --- 起きることを言う節（動詞） ---

// 値の並び: `{}`（フィールド名 → 値）か、field(...) の並び
const values = (given: unknown[]): unknown[] =>
  given.flatMap((item) => (isDict(item) ? valueFields(item) : [pending(item) ? valueField(item.name!, item.value) : item]));

const goToNode = (state: string) => make("goTo", { value: state });
const does = (text: string) => make("does", { value: text });
/**
 * 経路: このコマンドが、外からどう届くか（"POST /todos"、"DELETE /todos/:id"）。意味は持たない境界の約束で、
 * 契約に出る。本番コードと、それにリクエストを送るアダプターが、同じ経路を使うため
 */
const route = (text: string) => make("route", { value: text });
const set = (...given: unknown[]) => make("set", { children: values(given) });
const asks = (alias: string, query: string, ...given: unknown[]) => make("asks", { name: alias, value: query, children: values(given) });
const calls = (alias: string, part: string, command: string, key: unknown, ...given: unknown[]) =>
  make("calls", { name: alias, value: { part, command, ...(key === undefined ? {} : { key }) }, children: values(given) });
// 多数ある部品: 作る（キーと、子のデータのはじめの値）、消す（キー）
const adds = (part: string, key: unknown, ...given: unknown[]) => make("adds", { name: part, value: key, children: values(given) });
const removes = (part: string, key: unknown) => make("removes", { name: part, value: key });
const emits = (effect: string, ...given: unknown[]) => make("emits", { value: effect, children: values(given) });
const onlyWhenNode = (condition: unknown) => make("onlyWhen", { value: condition });
// 結果を返す。値1つか、フィールドの並び
const responds = (...given: unknown[]) =>
  make("responds", { children: given.length === 1 && !isDict(given[0]) && !isNode(given[0]) ? [make("value", { value: given[0] })] : values(given) });

// --- 性質を言う節 ---

const initially = (value: unknown) => make("initially", { value: value === undefined ? null : value });
const fresh = () => make("fresh");
const increasing = () => make("increasing");
const meaning = (fn: (...args: never[]) => unknown) => make("meaning", { value: fn });

// --- 宣言する節（名詞） ---

const named = (kind: string) => (name: string, ...children: unknown[]) => make(kind, { name, children });
const state = named("state");
// データは、型をそのまま子に書ける
const dataNode = (name: string, ...children: unknown[]) => make("data", { name, children: children.map((item) => (isNode(item) ? item : type(item))) });
// 条件と不変条件は、文が名前を兼ねる。名前を付けるなら、文は説明として書く
const condition = (name: string, ...children: unknown[]) =>
  make("condition", { name, children: children.map((item) => (typeof item === "string" ? description(item) : typeof item === "function" ? meaning(item as never) : item)) });
const invariant = (name: string, ...children: unknown[]) =>
  make("invariant", { name, children: children.map((item) => (typeof item === "string" ? description(item) : typeof item === "function" ? meaning(item as never) : item)) });
const decision = (name: string, table: unknown) => make("decision", { name, value: table });
const init = (stateName: string) => make("init", { value: stateName });


// --- 取っ手 (DSL.md §15) ---
// 参照には、文字列を書かない。語彙のまとまりを先に値として宣言し、そこから得た取っ手で指す。
// 取っ手は、これまでと同じ節と参照を作る（内部の形と IR は、文字列で書いたときと同じ）。

const GROUP = Symbol.for("clp.group");
const HANDLE = Symbol.for("clp.handle");
// 参照: 構造の中で「どこから来る値か」を指す。path は、決定表の列なら [表, 列]
export type Ref = { readonly $ref: string; readonly path: unknown };
// 意味の関数を、条件・計算・不変条件の取っ手に付けたもの。解釈の meanings に並べる
export type Meaning = { readonly $meaning: "conditions" | "calculations" | "invariants"; readonly name: string; readonly fn: (state: any) => unknown };
export type StateHandle<N extends string = string> = { readonly $state: N };
export type ConditionHandle = { readonly $condition: string; means(fn: (state: any) => boolean): Meaning; then(fields: Record<string, unknown>): unknown };
export type InvariantHandle = { readonly $invariant: string; means(fn: (state: any) => boolean): Meaning };
export type DataHandle = Ref & { set(value: unknown): Node };
export type CalculationHandle = Ref & { means(fn: (state: any) => unknown): Meaning; of(state: object): any };
export type AskNode = Node & { readonly answer: Ref; as(alias: string): AskNode };
export type QueryHandle = Ref & { (input?: Record<string, unknown>): AskNode; readonly answer: Ref };
export type EffectHandle = ((...given: unknown[]) => Node & { onlyWhen(condition: ConditionHandle | Ref): Node });
// 含む部品のコマンドの答え。フィールドは、そのまま続けて指す（Part.todos.Add.answer.todo）
export type AnswerRef = Ref & { readonly [field: string]: any };
export type CallNode = Node & { readonly answer: AnswerRef; as(alias: string): CallNode };
export type CommandCall = ((input?: Record<string, unknown>) => CallNode) & { readonly answer: AnswerRef };
// 多数ある部品の取っ手: キーで1つを選んでコマンドを呼ぶ、作る、消す
export type ManyPartHandle<C extends string> = {
  readonly $part: string;
  at(key: unknown): { readonly [K in C]: CommandCall };
  add(key: unknown, data?: Record<string, unknown>): Node;
  remove(key: unknown): Node;
};
// many(部品, by("id")) が返すもの。parts の中に置く
export type Many<C extends string = string> = { readonly $many: Component<C>; readonly by: string };
/** 多数ある部品のキーの名前。many(Todo, by("id")) */
export const by = (key: string) => ({ $by: key });
/** キーごとに多数ある部品。parts({ items: many(Todo, by("id")) }) */
export const many = <C extends string>(child: Component<C>, key: { $by: string }): Many<C> => ({ $many: child, by: key.$by });

// component({...}) が返す部品。コマンドの名前を、型として持つ（Part.todos.Add の書き間違いを型エラーにする）
export type Component<C extends string = string> = Node & { readonly __commands?: C };
type CommandsOf<S> = S extends { readonly commands: infer C } ? (C extends Node ? string : keyof C & string) : string;
export type InputHandle<K extends string = string> = { readonly [F in K]: Ref };
// 入力の取っ手。フィールドの組のフィールドは、続けて指せる（PostInput.body.title）
type InputHandles<S> = { readonly [F in keyof S & string]: S[F] extends RecordType<infer K> ? Ref & { readonly [G in K]: Ref } : Ref };
type Group<Kind extends string> = { readonly [GROUP]: { kind: Kind; shape: unknown } };

const ref = (kind: string, path: unknown): Ref => ({ $ref: kind, path });
const hidden = <T extends object>(target: T, members: Record<PropertyKey, unknown>): T => {
  for (const [key, value] of [...Object.entries(members), ...Object.getOwnPropertySymbols(members).map((symbol) => [symbol, members[symbol]] as const)]) {
    Object.defineProperty(target, key, { value, enumerable: false });
  }
  return target;
};
const groupOf = <G extends object>(target: G, kind: string, shape: unknown): G => hidden(target, { [GROUP]: { kind, shape } });
const groupIn = (value: unknown, kind?: string): { kind: string; shape: unknown } | undefined => {
  if ((typeof value !== "object" && typeof value !== "function") || value === null || !(GROUP in value)) return undefined;
  const found = (value as Record<symbol, { kind: string; shape: unknown }>)[GROUP];
  return kind === undefined || found.kind === kind ? found : undefined;
};

// 決定表の名前は、部品に置いたキーで決まる。列の参照は、その名前を、使うときに引く
const TABLE_NAMES = new WeakMap<object, string>();
const TABLE = Symbol.for("clp.table");

/**
 * 値が取っ手のまとまりなら、その種類と、取っ手の名前 → 指すもの（状態・データなどの名前、条件・不変条件の文）。
 * 決定表なら kind "table"。入力の取っ手なら kind "input"。どれでもなければ undefined。
 * 解釈の雛形が、Layer 1 の取っ手を import して使うために読む
 */
export function handlesOf(value: unknown): { kind: string; entries: [string, string][] } | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return undefined;
  if (TABLE in value) return { kind: "table", entries: Object.keys((value as { otherwise?: object }).otherwise ?? {}).map((column) => [column, column]) };
  if (STANDS_FOR in value) return { kind: "input", entries: Object.keys(value).map((field) => [field, field]) };
  const group = groupIn(value);
  if (!group) return undefined;
  const entries = Object.entries(value as Record<string, unknown>).map(([key, handle]): [string, string] => {
    const target = handle as { $state?: string; $condition?: string; $invariant?: string };
    return [key, target.$state ?? target.$condition ?? target.$invariant ?? key];
  });
  return { kind: group.kind, entries };
}

// 取っ手を、構造に書く値にする（参照は { $ref, path }、条件は文）
function valueOf(value: unknown): unknown {
  if ((typeof value === "object" || typeof value === "function") && value !== null) {
    if ("$condition" in value) return (value as ConditionHandle).$condition;
    if ("$ref" in value) return ref((value as Ref).$ref, (value as Ref).path);
  }
  return value;
}
// まとまりを文だけで書いたとき（queries("...")）: 項目は無く、文が、まとまりの説明
const proseFree = (shape: unknown): Record<string, unknown> => (typeof shape === "string" ? {} : (shape as Record<string, unknown>));
const proseOr = (shape: unknown): unknown => (typeof shape === "string" ? description(shape) : shape);
const nameOfState = (value: StateHandle | string): string => (typeof value === "string" ? value : value.$state);
const sentenceOf = (value: ConditionHandle | string): string => (typeof value === "string" ? value : value.$condition);

/** 状態の宣言。`State.PAID` で指す。説明の無い状態の並び: states(["IDLE", "DONE"]) */
export function states<const N extends readonly string[]>(names: N): { readonly [K in N[number]]: StateHandle<K> } & Group<"states">;
/** 説明を添えるとき: states({ DRAFT: "Before the order is placed.", ... }) */
export function states<const S extends Record<string, string>>(described: S): { readonly [K in keyof S & string]: StateHandle<K> } & Group<"states">;
/** 文だけのまとまり: 状態は解釈が決める */
export function states(prose: string): Group<"states">;
export function states(given: unknown): unknown {
  if (typeof given === "string") return groupOf({}, "states", description(given));
  // 生の文字列は、状態の説明（§16.0 の略記）
  const described = isDict(given) ? Object.fromEntries(Object.entries(given).map(([name, text]) => [name, typeof text === "string" ? description(text) : text])) : undefined;
  const names = described ? Object.keys(described) : (given as string[]);
  return groupOf(Object.fromEntries(names.map((name) => [name, { $state: name }])), "states", described ?? names);
}
/** 実行前の状態が、挙げたどれかであること（真偽値の参照） */
export const was = (...given: StateHandle[]): Ref => ref("was", given.map(nameOfState));
const goTo = (target: StateHandle) => goToNode(nameOfState(target));
const from = (...given: StateHandle[]) => fromNode(...given.map(nameOfState));
const onlyIf = (...given: ConditionHandle[]) => onlyIfNode(...given.map(sentenceOf));
const onlyWhen = (given: ConditionHandle | Ref) => onlyWhenNode(valueOf(given));
/** 場合（コマンドの中）。決定表の行（decisionTable の中）にも使う: when(If.x, { 列: 値 }) */
const when = (given: ConditionHandle, ...children: unknown[]) => whenNode(sentenceOf(given), ...children);

/** 条件の宣言。文は、ここに1回だけ書く。`If.paid` で指し、`If.paid.means(関数)` で意味を付ける */
export function conditions<const S extends Record<string, string>>(shape: S): { readonly [K in keyof S]: ConditionHandle } & Group<"conditions"> {
  const handles = Object.fromEntries(
    Object.entries(shape).map(([name, sentence]) => [
      name,
      hidden({ $condition: sentence }, {
        means: (fn: (state: any) => boolean): Meaning => ({ $meaning: "conditions", name: sentence, fn }),
        // 場合と決定表の行（§16.0）: 名前は、条件の名前
        then: (fields: Record<string, unknown> = {}) => makeThen(sentence, fields),
      }),
    ]),
  );
  return groupOf(handles, "conditions", shape) as never;
}
/** 不変条件の宣言 */
export function invariants<const S extends Record<string, string>>(shape: S): { readonly [K in keyof S]: InvariantHandle } & Group<"invariants"> {
  const handles = Object.fromEntries(
    Object.entries(shape).map(([name, sentence]) => [name, hidden({ $invariant: sentence }, { means: (fn: (state: any) => boolean): Meaning => ({ $meaning: "invariants", name: sentence, fn }) })]),
  );
  return groupOf(handles, "invariants", Object.values(shape)) as never;
}
/** 覚えるデータの宣言。`Data.price` で値を指し、`Data.price.set(値)` で覚える */
/** 文だけのまとまり: 項目は解釈が決める */
export function data(prose: string): Group<"data">;
export function data<const S extends Record<string, unknown>>(shape: S): { readonly [K in keyof S]: DataHandle } & Group<"data">;
export function data(shape: unknown): unknown {
  const handles = Object.fromEntries(Object.keys(proseFree(shape)).map((name) => [name, hidden(ref("data", name), { set: (value: unknown) => set({ [name]: value }) })]));
  return groupOf(handles, "data", proseOr(shape)) as never;
}
/** 問い合わせの宣言。引数の無いものは `Query.x` が答え。引数つきは `Query.x({ 引数 })` で尋ね、`Query.x.answer` が答え */
/** 文だけのまとまり: 項目は解釈が決める */
export function queries(prose: string): Group<"queries">;
export function queries<const S extends Record<string, unknown>>(shape: S): { readonly [K in keyof S]: QueryHandle } & Group<"queries">;
export function queries(shape: unknown): unknown {
  const ask = (query: string, alias: string, given: Record<string, unknown>): AskNode =>
    hidden(asks(alias, query, given), { answer: ref("query", alias), as: (other: string) => ask(query, other, given) }) as AskNode;
  const handles = Object.fromEntries(
    Object.keys(proseFree(shape)).map((name) => {
      const handle = (given: Record<string, unknown> = {}) => ask(name, name, given);
      Object.defineProperty(handle, "name", { value: name });
      return [name, hidden(Object.assign(handle, { $ref: "query", path: name }), { answer: ref("query", name) })];
    }),
  );
  return groupOf(handles, "queries", proseOr(shape)) as never;
}
/** 副作用の宣言。`Effect.Send({ 値 }, onlyWhen(...))` で起こす */
/** 文だけのまとまり: 項目は解釈が決める */
export function effects(prose: string): Group<"effects">;
export function effects<const S extends Record<string, unknown>>(shape: S): { readonly [K in keyof S]: EffectHandle } & Group<"effects">;
export function effects(shape: unknown): unknown {
  // 修飾は、続けて呼ぶ: Effect.IssueCoupon({ type }).onlyWhen(If.gold)（入力と、同じ {} に混ぜない）
  const emitted = (name: string, given: unknown[]): Node =>
    hidden(emits(name, ...given), { onlyWhen: (condition: ConditionHandle | Ref) => emitted(name, [...given, onlyWhen(condition)]) });
  const handles = Object.fromEntries(Object.keys(proseFree(shape)).map((name) => [name, hidden((...given: unknown[]) => emitted(name, given), { [EFFECT]: name })]));
  return groupOf(handles, "effects", proseOr(shape)) as never;
}
/** 計算の宣言。`Calc.x` が結果。`Calc.x.means(関数)` で意味を付け、意味の関数の中では `Calc.x.of(state)` で結果を使う */
/** 文だけのまとまり: 項目は解釈が決める */
export function calculations(prose: string): Group<"calculations">;
export function calculations<const S extends Record<string, unknown>>(shape: S): { readonly [K in keyof S]: CalculationHandle } & Group<"calculations">;
export function calculations(shape: unknown): unknown {
  const handles = Object.fromEntries(
    Object.keys(proseFree(shape)).map((name) => [
      name,
      hidden(ref("calculation", name), {
        means: (fn: (state: any) => unknown): Meaning => ({ $meaning: "calculations", name, fn }),
        of: (state: object) => {
          const calculation = active().calculations?.[name];
          if (!calculation) throw new UnboundNameError("計算", name);
          return calculation(state);
        },
      }),
    ]),
  );
  return groupOf(handles, "calculations", proseOr(shape)) as never;
}
/** コマンドの入力（問い合わせの引数、副作用のペイロードにも使う）。`PlaceInput.listPrice` で、そのコマンドの入力を指す */
export function input<const S extends Record<string, TypeLike>>(shape: S = {} as S): InputHandles<S> {
  // フィールドの組のフィールドは、"body.title" のように、点でつないだ名前で指す
  const fieldRef = (path: string, type: unknown): Ref => {
    const handle = ref("input", path);
    if (!isNode(type) || type.kind !== "record") return handle;
    return hidden(handle, Object.fromEntries(type.children.filter((item) => item.kind === "field").map((item) => [item.name!, fieldRef(`${path}.${item.name}`, item.children[0])])));
  };
  const handles = Object.fromEntries(Object.entries(shape).map(([name, type]) => [name, fieldRef(name, type)]));
  return hidden(handles, { [STANDS_FOR]: inputNode(shape) }) as never;
}

// 答えの参照。フィールドを続けて書くと、そのフィールドの参照になる
const answerRef = (path: readonly string[]): AnswerRef =>
  new Proxy(ref("call", path), {
    get(target, key, receiver) {
      if (typeof key === "symbol" || key in target || key === "toJSON" || key === "then") return Reflect.get(target, key, receiver);
      return answerRef([...path, key]);
    },
  }) as AnswerRef;

/**
 * 含む部品の宣言。`Part.todos.Add({ 入力 })` で、含む部品のコマンドを呼ぶ（場合を決める前に、書いた順に）。
 * 答えは `Part.todos.Add.answer`（フィールドは `.answer.todo`）。意味の関数からは `state.todos.Add`。
 * 同じコマンドを2回呼ぶときは `.as("名前")` で答えに名前を付ける（関数からは `state.名前`）
 */
export function parts<const S extends Record<string, Node | Many>>(
  shape: S,
): {
  readonly [K in keyof S]: S[K] extends Many<infer M>
    ? ManyPartHandle<M>
    : { readonly [C in S[K] extends Component<infer N> ? N : string]: CommandCall };
} & Group<"parts"> {
  // key: 多数ある部品の、どれを呼ぶか（値か参照）。1つだけの部品なら undefined
  const call = (part: string, command: string, alias: string, given: Record<string, unknown>, key: unknown): CallNode =>
    hidden(calls(alias, part, command, key, given), { answer: answerRef([alias]), as: (other: string) => call(part, command, other, given, key) }) as CallNode;
  // コマンドの名前 → 呼ぶ取っ手
  const commandsOf = (part: string, key: unknown) =>
    new Proxy({} as Record<string, CommandCall>, {
      get(target, name) {
        if (typeof name === "symbol" || name === "toJSON" || name === "then") return Reflect.get(target, name);
        const alias = `${part}.${name}`;
        return Object.assign((given: Record<string, unknown> = {}) => call(part, name, alias, given, key), { answer: answerRef([alias]) });
      },
    });
  const handles = Object.fromEntries(
    Object.entries(shape).map(([part, given]) => {
      if (isNode(given)) return [part, commandsOf(part, undefined)];
      const handle: ManyPartHandle<string> = {
        $part: part,
        at: (key: unknown) => commandsOf(part, valueOf(key)),
        add: (key: unknown, data: Record<string, unknown> = {}) => adds(part, valueOf(key), data),
        remove: (key: unknown) => removes(part, valueOf(key)),
      };
      return [part, handle];
    }),
  );
  return groupOf(handles, "parts", shape) as never;
}

/**
 * 決定表。行は、条件の取っ手で書く: decisionTable(when(If.gold, { discount: 20 }), otherwise({ discount: 0 }))。
 * 列は `Campaign.discount` で指す。意味の関数の中では `Campaign.of(state)` で、当たった行を引く
 */
function decisionTable<const R extends readonly Node[]>(...rows: R): Table & { readonly [column: string]: Ref } & { of(state: object): Record<string, any> } {
  const table: Table = {};
  for (const row of rows) {
    const cells = (row.children[0]?.value ?? {}) as Record<string, never>;
    table[row.kind === "otherwise" ? "otherwise" : row.name!] = cells;
  }
  const columns = Object.keys(table.otherwise ?? Object.values(table)[0] ?? {});
  const members: Record<string, unknown> = {
    // いま評価している解釈の表を、名前で引く（仕様のミューテーションは、値を変えた表を解釈に差し替えて確かめる）
    of: (state: object) => {
      const binding = active();
      const name = TABLE_NAMES.get(table);
      const current = (name !== undefined ? binding.component.decisions[name] : undefined) ?? table;
      return current[matchCondition(binding, Object.keys(current), state)];
    },
  };
  for (const column of columns) {
    members[column] = Object.defineProperty({ $ref: "decision" }, "path", { get: () => [TABLE_NAMES.get(table) ?? "?", column], enumerable: true });
  }
  return hidden(table, { ...members, [TABLE]: true }) as never;
}

// dict 形式のまとまり。キーは、節の種類のまとまりの名前
type ComponentShape = {
  description?: string | Node;
  states?: readonly string[] | Record<string, Node> | Node | Group<"states">;
  init?: StateHandle;
  data?: Record<string, unknown> | Node;
  queries?: Record<string, unknown> | Node;
  effects?: Record<string, unknown> | Node;
  decisions?: Record<string, unknown>;
  calculations?: Record<string, unknown> | Node;
  conditions?: Group<"conditions">;
  invariants?: Group<"invariants">;
  commands?: Record<string, unknown> | Node;
  // 含む部品
  parts?: Record<string, Node | Many> | Group<"parts">;
  assets?: readonly unknown[];
};
const GROUPS: Record<string, string> = { data: "data", queries: "query", effects: "effect", calculations: "calculation", commands: "command" };

// 名前つきの項目の中身: 名前の無い component（溶け込む）、節1つ、または裸の型
function entry(kind: string, name: string, given: unknown): Node {
  const content = nodeOf(given) ?? given;
  // §16.0 の形: 席の {}。副作用の生の文字列は、説明
  if (isDict(content) && kind in ENTRY_KIND) return make(kind, { name, children: [entryBody(ENTRY_KIND[kind], content)] });
  if (kind === "effect" && typeof content === "string") return make(kind, { name, children: [description(content)] });
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

function fromShape(given: ComponentShape): Node[] {
  // まとまりを値として宣言したもの（取っ手のまとまり）は、その中身として読む
  const shape = Object.fromEntries(Object.entries(given).map(([key, value]) => [key, groupIn(value)?.shape ?? value])) as ComponentShape & Record<string, unknown>;
  for (const [name, table] of Object.entries((given.decisions ?? {}) as Record<string, object>)) if (typeof table === "object" && table !== null) TABLE_NAMES.set(table, name);
  const children: Node[] = [];
  const known = new Set(["description", "states", "init", "decisions", "conditions", "invariants", "assets", "meanings", "parts", ...Object.keys(GROUPS)]);
  for (const key of Object.keys(shape)) if (!known.has(key)) children.push(make("unknown", { name: key, value: (shape as Record<string, unknown>)[key] }));
  if (shape.description !== undefined) children.push(typeof shape.description === "string" ? description(shape.description) : shape.description);
  if (Array.isArray(shape.states)) for (const name of shape.states) children.push(state(name));
  else if (isNode(shape.states)) children.push(make("group", { name: "states", children: [shape.states] }));
  else if (shape.states) for (const [name, content] of Object.entries(shape.states)) children.push(state(name, content));
  if (shape.init !== undefined) children.push(init(nameOfState(shape.init as StateHandle | string)));
  for (const [group, kind] of Object.entries(GROUPS)) {
    const given = (shape as Record<string, unknown>)[group];
    if (given === undefined) continue;
    // まとまりを、文だけで書いたとき
    if (isNode(given)) children.push(make("group", { name: group, children: [given] }));
    else for (const [name, content] of Object.entries(given as Record<string, unknown>)) children.push(entry(kind, name, content));
  }
  for (const [name, table] of Object.entries(shape.decisions ?? {})) children.push(decision(name, table));
  // 含む部品: 中身は、値として持つ（中の部品の木は、その部品として検査する）。多数ある部品は、キーの名前と一緒に
  for (const [name, part] of Object.entries((shape.parts ?? {}) as Record<string, Node | Many>)) {
    children.push(make("part", { name, value: isNode(part) ? { component: part } : { component: part.$many, by: part.by } }));
  }
  // 条件のまとまりは、使う所 (when / onlyIf / onlyWhen / 決定表の行) から集まる。部品に並べても、何も足さない
  if (Array.isArray(shape.invariants)) for (const sentence of shape.invariants as string[]) children.push(invariant(sentence));
  if (shape.assets !== undefined) children.push(make("assets", { value: shape.assets }));
  return children;
}

// 節を束ねる（内部の形）。component は基底の種類で、書き手は別名（service、command など）で書く（DSL.md §16.0）。
//   component(...節)             名前の無い束。置いた先に、溶け込む
function component(...given: unknown[]): Node {
  return make("component", { children: given });
}

/** 種類の定義。fields: 席の名前 → その席が受け取るもの。entries: 項目の種類。expand: 利用者の語（L2）の展開 */
export type KindDefinition = {
  fields?: Readonly<Record<string, string>>;
  entries?: string;
  expand?: (fields: Record<string, any>) => unknown;
};

// 起きること（場合の席。コマンドに書けば、どの場合でも起きる）
const OUTCOME_FIELDS = { goTo: "state", does: "text", set: "list of set", emits: "list of effects", responds: "value", adds: "list of add", removes: "list of remove" } as const;

/** 組み込みの種類。利用者の種類（kind(...)）も、同じ形で定義する */
export const KINDS: Record<string, KindDefinition> = {
  service: { fields: { description: "text", init: "state", uses: "list of groups", assets: "assets" } },
  command: {
    fields: {
      description: "text", input: "input", output: "type", route: "text", from: "list of states", onlyIf: "list of conditions",
      asks: "list of asks", calls: "list of calls", cases: "list of cases", ...OUTCOME_FIELDS,
    },
  },
  case: { fields: OUTCOME_FIELDS },
  datum: { fields: { description: "text", type: "type", initially: "value" } },
  query: { fields: { description: "text", input: "input", output: "type", fresh: "flag", increasing: "flag" } },
  effect: { fields: { description: "text", input: "input" } },
  calculation: { fields: { description: "text", output: "type" } },
  states: { entries: "state" },
  data: { entries: "datum" },
  queries: { entries: "query" },
  effects: { entries: "effect" },
  calculations: { entries: "calculation" },
  conditions: { entries: "condition" },
  invariants: { entries: "invariant" },
  commands: { entries: "command" },
  decisions: { entries: "decision" },
  types: { entries: "type" },
  parts: { entries: "part" },
};


// --- 文法: 親の種類 × 子の種類 → いくつまで書けるか ---
// 書き手が書く種類（KINDS: service、command、場合、データ・問い合わせ・副作用・計算）の行は、その席の定義から組み立てる。
// 席は、変換したあとの節の種類に対応する。表に無い組み合わせは、書けない。"#type" は、型の節のどれか

const MANY = Number.POSITIVE_INFINITY;
// 席 → 変換したあとの節の種類と、いくつまで書けるか（文 (description / does) は、つながって1つになる）
const FIELD_NODES: Record<string, Record<string, number>> = {
  description: { description: MANY }, does: { does: MANY }, input: { input: 1 }, output: { output: 1 }, route: { route: 1 },
  from: { from: 1 }, onlyIf: { onlyIf: MANY }, asks: { asks: MANY }, calls: { calls: MANY }, cases: { when: MANY, otherwise: 1 },
  goTo: { goTo: 1 }, set: { set: MANY }, emits: { emits: MANY }, responds: { responds: 1 }, adds: { adds: MANY }, removes: { removes: MANY },
  type: { "#type": 1 }, initially: { initially: 1 }, fresh: { fresh: 1 }, increasing: { increasing: 1 }, init: { init: 1 }, assets: { assets: 1 },
};
const rowOf = (kind: string, extra: Record<string, number> = {}): Record<string, number> =>
  Object.assign({}, ...Object.keys(KINDS[kind].fields ?? {}).map((field) => FIELD_NODES[field] ?? {}), extra);
// 1つしか書けない文（項目の説明）
const single = (row: Record<string, number>) => ({ ...row, ...("description" in row ? { description: 1 } : {}) });
const HAPPENS = rowOf("case");
// まとまりの項目 → 変換したあとの節の種類
const ENTRY_NODES: Record<string, string> = { states: "state", data: "data", queries: "query", effects: "effect", calculations: "calculation", conditions: "condition", invariants: "invariant", commands: "command", decisions: "decision", parts: "part" };
export const GRAMMAR: Record<string, Record<string, number>> = {
  // 部品: service の席と、まとまりの項目（uses に並べたもの）
  component: {
    ...single(rowOf("service")),
    ...Object.fromEntries(Object.values(ENTRY_NODES).map((node) => [node, MANY])),
    group: MANY,
  },
  command: rowOf("command"),
  when: HAPPENS,
  otherwise: HAPPENS,
  data: single(rowOf("datum")),
  query: single(rowOf("query")),
  effect: single(rowOf("effect")),
  calculation: { ...single(rowOf("calculation")), meaning: 1 },
  // 内部の節（書き手は、席と取っ手を通してだけ書く）
  part: {},
  group: { description: 1 },
  state: { description: 1 },
  condition: { description: 1, meaning: 1 },
  invariant: { description: 1, meaning: 1 },
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
  calls: { field: MANY },
  adds: { field: MANY },
  removes: {},
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
  otherwise: "otherwise", goTo: "goTo", set: "set", asks: "asks", calls: "呼ぶ部品のコマンド", part: "含む部品", adds: "部品を作る (add)", removes: "部品を消す (remove)", route: "経路 (route)", emits: "emits", responds: "responds", does: "does",
  initially: "initially", fresh: "fresh", increasing: "increasing", onlyWhen: "onlyWhen", meaning: "意味の関数", field: "フィールド",
  service: "部品 (service)", case: "場合", datum: "データ",
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
      if (node.kind === "badField") {
        report("unknown-field", node.at ? node : parent, `${LABEL[(node.value as { kind: string }).kind] ?? (node.value as { kind: string }).kind}に、"${node.name}" という席はありません`);
        continue;
      }
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

// 型の節 → 内部の形の型
function schemaOf(node: Node, into: Collected): unknown {
  switch (node.kind) {
    case "enum":
      return node.value;
    case "type": {
      const given = Object.fromEntries(node.children.map((setting) => [setting.name!, setting.value]));
      return Object.keys(given).length === 0 ? node.value : { type: node.value, ...given };
    }
    case "list":
      return { list: schemaOf(node.children[0], into) };
    case "optional":
      return { optional: schemaOf(node.children[0], into) };
    case "record": {
      // フィールドを optional(...) にすると、無いことがあるフィールドになる
      const optional = node.children.filter((item) => item.children[0]?.kind === "optional").map((item) => item.name!);
      const fields = Object.fromEntries(
        node.children.map((item) => [item.name!, schemaOf(item.children[0].kind === "optional" ? item.children[0].children[0] : item.children[0], into)]),
      );
      return { record: fields, ...(optional.length > 0 ? { optional } : {}) };
    }
    default:
      later(into, node, `型 ${node.kind} `);
      return "string";
  }
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
  Object.fromEntries(node.children.filter((item) => item.kind === "field").map((item) => [item.name!, valueOf(item.children[0]?.value)]));
const join = (a: unknown, b: string) => (a === undefined ? b : `${String(a)} ${b}`);

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
    case "adds":
      target.adds = [...((target.adds as unknown[] | undefined) ?? []), { part: node.name, key: valueOf(node.value), data: valuesOf(node) }];
      return true;
    case "removes":
      target.removes = [...((target.removes as unknown[] | undefined) ?? []), { part: node.name, key: valueOf(node.value) }];
      return true;
    case "emits": {
      const condition = node.children.find((item) => item.kind === "onlyWhen");
      target.effects = [...((target.effects as unknown[] | undefined) ?? []), { [String(node.value)]: valuesOf(node), ...(condition ? { when: valueOf(condition.value) } : {}) }];
      return true;
    }
    case "responds": {
      // 値1つか、フィールドの組
      const [only] = node.children;
      target.responds = node.children.length === 1 && only.kind === "value" ? valueOf(only.value) : valuesOf(node);
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
        shape.output = schemaOf(item.children[0], into);
        break;
      case "route":
        shape.route = item.value;
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
      case "calls": {
        const { part, command, key } = item.value as { part: string; command: string; key?: unknown };
        shape.calls = { ...(shape.calls as Shape | undefined), [item.name!]: { part, command, input: valuesOf(item), ...(key === undefined ? {} : { key }) } };
        break;
      }
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
        shape.initially = { value: item.value };
        break;
      case "fresh":
      case "increasing":
        shape.promise = item.kind;
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
      case "part":
        layer1.parts = { ...(layer1.parts as Shape | undefined), [node.name!]: node.value };
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
          for (const key of ["set", "effects", "adds", "removes"]) {
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
type Meanings = {
  conditions: Record<string, (state: any) => boolean>;
  calculations: Record<string, (state: any) => unknown>;
  invariants: Record<string, (state: any) => boolean>;
};
const TREES = new WeakMap<object, { tree: Node; problems: Diagnostic[] }>();

/**
 * 解釈: Layer 1 と同じ語で、構造を足したもの。意味の関数は、条件・計算・不変条件の取っ手に付けて、meanings に並べる
 * （`If.paid.means((state) => ...)`）
 */
export function interpretation(target: Node, given: readonly unknown[]): BoundSpecification {
  // §16.0 の形: 足すものを、名前を持つノードとして並べる
  const written = interpretationFromList(target, Array.isArray(given) ? given : [make("unknown", { name: "解釈は並び ([...]) で書きます", value: given })]);
  const tree = make("interpretation", { children: fromShape(written) });
  const into: Collected = { problems: [] };
  const structure: Shape = {};
  const meanings: Meanings = { conditions: {}, calculations: {}, invariants: {} };
  for (const given of written.meanings ?? []) (meanings[given.$meaning] as Record<string, unknown>)[given.name] = given.fn;
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


// --- 1.0 の書き方 (DSL.md §16.0): 種類と、席・項目・並び、略記 ---
//
// ノードは「種類 + 名前つきの子」。種類は、決まった名前の子（席）か、自由な名前の子（項目）の、どちらか一方を持つ。
// 名前が生まれるのは、項目を持つ種類（まとまり）の宣言のキーだけ。ほかの `{}` のキーは、すべて席。
// `[]` は、名前を持つノードの並び（取っ手から作ったノードは、名前を自分で持つ）。
// 書いた値は、その位置の種類に変換する（略記）。
//
// 書かれた木は、ここで、これまでの節の木（component / command / when ...）に変換する。内部の形と IR は、そこから作る。


const KIND = Symbol.for("clp.kind");
type KindInstance = { readonly [KIND]: string; readonly fields: Record<string, unknown> };
const kindOf = (value: unknown): KindInstance | undefined =>
  typeof value === "object" && value !== null && KIND in value ? (value as KindInstance) : undefined;

/**
 * 利用者の語（L2）: 種類を定義する。席（fields）の決まりと、中身をコアの語に展開する関数（expand）を持つ。
 * expand が走るのは仕様を読み込むときだけで、IR と正解に入るのは、展開した結果のデータだけ
 */
export function kind<F extends Record<string, unknown> = Record<string, unknown>>(name: string, definition: KindDefinition): (fields: F) => KindInstance {
  if (name in KINDS && !KINDS[name].expand) throw new Error(`種類 "${name}" は、組み込みの種類と同じ名前です`);
  KINDS[name] = definition;
  return (fields: F) => ({ [KIND]: name, fields });
}

// 利用者の語を、コアの語になるまで展開する。展開は決定的でなければならない（2回展開して比べる）
function expanded(value: unknown): unknown {
  let current = value;
  for (let depth = 0; depth < 20; depth++) {
    const instance = kindOf(current);
    if (!instance) return current;
    const definition = KINDS[instance[KIND]];
    const once = definition.expand!(instance.fields);
    const twice = definition.expand!(instance.fields);
    if (JSON.stringify(plainValue(once)) !== JSON.stringify(plainValue(twice))) {
      return make("unknown", { name: `${instance[KIND]} (展開が決定的でない)`, value: instance.fields });
    }
    current = once;
  }
  return current;
}
const plainValue = (value: unknown): unknown =>
  isNode(value) ? plain(value) : Array.isArray(value) ? value.map(plainValue) : isDict(value) ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainValue(v)])) : typeof value === "function" ? "(function)" : value;

// 席の誤り: その種類に無い席
const badField = (kind: string, name: string, value: unknown) => make("badField", { name, value: { kind } });
const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

// 起きることの席 → 節
function outcomeNodes(kind: string, given: Record<string, unknown>): Node[] {
  const out: Node[] = [];
  for (const [key, value] of Object.entries(given)) {
    if (value === undefined || key in (KINDS[kind].fields ?? {}) === false) continue;
    switch (key) {
      case "goTo":
        out.push(isNode(value) ? value : goTo(value as StateHandle));
        break;
      case "does":
        out.push(does(String(value)));
        break;
      case "responds":
        out.push(responds(value));
        break;
      case "emits":
        // 取っ手をそのまま置いたら、入力のまだ無い副作用
        out.push(...asList(value).map((item) => (typeof item === "function" && EFFECT in item ? (item as unknown as EffectHandle)() : (item as Node))));
        break;
      case "set":
      case "adds":
      case "removes":
        out.push(...(asList(value) as Node[]));
        break;
    }
  }
  return out;
}

// 席の名前を確かめる
function checkFields(kind: string, given: Record<string, unknown>): Node[] {
  const fields = KINDS[kind].fields ?? {};
  return Object.keys(given).filter((key) => !(key in fields)).map((key) => badField(kind, key, given[key]));
}

// 場合の並びの要素 → when / otherwise の節
function caseNode(item: unknown): Node {
  if (item === otherwise) return make("otherwise");
  const then = thenOf(item);
  if (then) {
    const children = [...checkFields("case", then.fields), ...outcomeNodes("case", then.fields)];
    return then.condition === undefined ? make("otherwise", { children }) : make("when", { name: then.condition, children });
  }
  // otherwise({ 席 })
  if (isNode(item) && item.kind === "otherwise" && item.children.length === 1 && item.children[0].kind === "unknown" && isDict(item.children[0].value)) {
    const fields = item.children[0].value as Record<string, unknown>;
    return make("otherwise", { children: [...checkFields("case", fields), ...outcomeNodes("case", fields)] });
  }
  return isNode(item) ? item : make("unknown", { value: item });
}

// コマンドの中身: 席の {}、文だけ（生の文字列）、利用者の語。これまでの書き方の節も、そのまま受け取る
function commandBody(given: unknown): Node {
  const value = expanded(given);
  if (typeof value === "string") return make("component", { children: [description(value)] });
  if (isNode(value)) return value;
  if (!isDict(value)) return make("component", { children: [make("unknown", { value })] });
  const children: Node[] = [...checkFields("command", value)];
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || !(key in KINDS.command.fields!)) continue;
    switch (key) {
      case "description":
        children.push(description(String(item)));
        break;
      case "input":
        children.push(nodeOf(item) ?? inputNode(item as Record<string, TypeLike>));
        break;
      case "output":
        children.push(output(item as TypeLike));
        break;
      case "route":
        children.push(route(String(item)));
        break;
      case "from":
        children.push(from(...(asList(item) as StateHandle[])));
        break;
      case "onlyIf":
        children.push(onlyIf(...(asList(item) as ConditionHandle[])));
        break;
      case "asks":
      case "calls":
        children.push(...(asList(item) as Node[]));
        break;
      case "cases":
        children.push(...asList(item).map(caseNode));
        break;
    }
  }
  children.push(...outcomeNodes("command", value));
  return make("component", { children });
}

// 項目（データ・問い合わせ・副作用・計算）の、席の {} → これまでの子の並び
function entryBody(kind: string, given: Record<string, unknown>): Node {
  const children: Node[] = [...checkFields(kind, given)];
  for (const [key, item] of Object.entries(given)) {
    if (item === undefined || !(key in (KINDS[kind].fields ?? {}))) continue;
    switch (key) {
      case "description":
        children.push(description(String(item)));
        break;
      case "type":
        children.push(type(item));
        break;
      case "initially":
        children.push(initially(item));
        break;
      case "input":
        children.push(nodeOf(item) ?? inputNode(item as Record<string, TypeLike>));
        break;
      case "output":
        children.push(output(item as TypeLike));
        break;
      case "fresh":
        if (item === true) children.push(fresh());
        break;
      case "increasing":
        if (item === true) children.push(increasing());
        break;
    }
  }
  return make("component", { children });
}
const ENTRY_KIND: Record<string, string> = { data: "datum", query: "query", effect: "effect", calculation: "calculation" };

// 場合・決定表の行: 条件の取っ手から作る（If.paid.then({...})）。名前は条件の名前
const THEN = Symbol.for("clp.then");
type Then = { readonly [THEN]: true; readonly condition?: string; readonly fields: Record<string, unknown> };
const thenOf = (value: unknown): Then | undefined => (typeof value === "object" && value !== null && THEN in value ? (value as Then) : undefined);
const makeThen = (condition: string | undefined, fields: Record<string, unknown>): Then => ({ [THEN]: true, ...(condition === undefined ? {} : { condition }), fields });

// 副作用の取っ手の印（emits の並びに、取っ手をそのまま置けるように）
const EFFECT = Symbol.for("clp.effect");

/** 共有する型のまとまり。`Type.Todo` で、その型を指す */
export function types<const S extends Record<string, TypeLike>>(shape: S): { readonly [K in keyof S]: S[K] } & Group<"types"> {
  return groupOf({ ...shape }, "types", shape) as never;
}

/** 決定表のまとまり: decisions({ campaign: [If.gold.then({ discount: 20 }), otherwise({ discount: 0 })] })。列は `Decision.campaign.discount` */
export function decisions<const S extends Record<string, readonly unknown[]>>(
  shape: S,
): { readonly [K in keyof S]: Table & { readonly [column: string]: Ref } & { of(state: object): Record<string, any> } } & Group<"decisions"> {
  const tables = Object.fromEntries(
    Object.entries(shape).map(([name, rows]) => {
      const nodes = rows.map((row) => {
        const then = thenOf(row);
        if (then) return then.condition === undefined ? otherwise(then.fields) : whenNode(then.condition, then.fields);
        if (row === otherwise) return otherwise({});
        return row as Node;
      });
      const table = decisionTable(...nodes);
      TABLE_NAMES.set(table, name);
      return [name, table];
    }),
  );
  return groupOf(tables, "decisions", tables) as never;
}

// コマンドの取っ手: 解釈で、そのコマンドに席を足す（Command.Checkout.with({ cases: [...] })）
const WITH = Symbol.for("clp.with");
type With = { readonly [WITH]: "command" | "service"; readonly name?: string; readonly fields: Record<string, unknown> };
const withOf = (value: unknown): With | undefined => (typeof value === "object" && value !== null && WITH in value ? (value as With) : undefined);
export type CommandHandle = { with(fields: Record<string, unknown>): With };

/** コマンドのまとまり。名前が生まれるのは、ここのキー。中身は席の {}（または、文だけの文字列、利用者の語） */
export function commands(prose: string): Group<"commands">;
export function commands<const S extends Record<string, unknown>>(shape: S): { readonly [K in keyof S]: CommandHandle } & Group<"commands">;
export function commands(shape: Record<string, unknown> | string): unknown {
  // 文だけのまとまり: コマンドは解釈が決める
  if (typeof shape === "string") return groupOf({}, "commands", description(shape));
  const handles = Object.fromEntries(
    Object.keys(shape).map((name) => [name, { with: (fields: Record<string, unknown>): With => ({ [WITH]: "command", name, fields }) }]),
  );
  return groupOf(handles, "commands", Object.fromEntries(Object.entries(shape).map(([name, body]) => [name, commandBody(body)]))) as never;
}

type CommandNamesIn<U> = U extends readonly (infer E)[] ? (E extends Group<"commands"> ? Exclude<keyof E, symbol> & string : never) : never;
export type ServiceShape = {
  description?: string;
  init?: StateHandle;
  uses?: readonly unknown[];
  assets?: readonly unknown[];
};
// まとまりの種類 → これまでの dict 形式のキー
const USES_KEY: Record<string, keyof ComponentShape> = {
  states: "states", data: "data", queries: "queries", effects: "effects", calculations: "calculations", conditions: "conditions",
  invariants: "invariants", commands: "commands", decisions: "decisions", parts: "parts",
};

// まとまりを、これまでの dict 形式に重ねる（同じ種類のまとまりが2つあれば、項目を合わせる）
function legacyOf(shape: Record<string, unknown>, into: ComponentShape & Record<string, unknown>, extra: Node[]) {
  for (const used of asList(shape.uses ?? [])) {
    const group = groupIn(used);
    if (!group) {
      extra.push(make("unknown", { name: "uses", value: used }));
      continue;
    }
    // 型と条件のまとまりは、構造を何も足さない（条件は、使う所から集まる）。いくつ並べてもよい
    if (group.kind === "types" || group.kind === "conditions") continue;
    const key = USES_KEY[group.kind];
    if (key === undefined) continue;
    const content = group.kind === "decisions" || group.kind === "parts" ? used : group.shape;
    const previous = into[key];
    if (previous === undefined) into[key] = content as never;
    else if (isDict(previous) && isDict(content)) into[key] = { ...previous, ...content } as never;
    else if (groupIn(previous) && isDict(content)) into[key] = { ...(groupIn(previous)!.shape as object), ...content } as never;
    else extra.push(make("unknown", { name: `uses (${group.kind} が2つ)`, value: used }));
  }
}

/**
 * いちばん外側の部品（§16.0）。席は description、init、uses（まとまりの並び）、assets。
 * 返すのは、これまでの部品の木と同じもの（検証の単位）
 */
export function service<const S extends ServiceShape>(
  shape: S,
): Component<[CommandNamesIn<S["uses"]>] extends [never] ? string : CommandNamesIn<S["uses"]>> & { with(fields: Record<string, unknown>): With } {
  const legacy: ComponentShape & Record<string, unknown> = {};
  const extra: Node[] = checkFields("service", shape as Record<string, unknown>);
  if (shape.description !== undefined) legacy.description = shape.description;
  if (shape.init !== undefined) legacy.init = shape.init;
  if (shape.assets !== undefined) legacy.assets = shape.assets;
  legacyOf(shape as Record<string, unknown>, legacy, extra);
  const node = make("component", { children: [...fromShape(legacy), ...extra] });
  return hidden(node, { with: (fields: Record<string, unknown>): With => ({ [WITH]: "service", fields }) }) as never;
}

// 解釈（§16.0）: 足すものを、名前を持つノードとして並べる。Layer 1 と同じ名前の所に重ねる
function interpretationFromList(target: Node, items: readonly unknown[]): ComponentShape & { meanings: Meaning[] } {
  const legacy: ComponentShape & Record<string, unknown> & { meanings: Meaning[] } = { meanings: [] };
  const groups: unknown[] = [];
  const refined: Record<string, Node> = {};
  for (const item of items) {
    const refinement = withOf(item);
    if (refinement?.[WITH] === "command") {
      refined[refinement.name!] = commandBody(refinement.fields);
      continue;
    }
    if (refinement?.[WITH] === "service") {
      const fields = refinement.fields as ServiceShape;
      if (fields.init !== undefined) legacy.init = fields.init;
      if (fields.description !== undefined) legacy.description = fields.description;
      if (fields.uses !== undefined) groups.push(...fields.uses);
      continue;
    }
    if (typeof item === "object" && item !== null && "$meaning" in item) {
      legacy.meanings.push(item as Meaning);
      continue;
    }
    groups.push(item);
  }
  const extra: Node[] = [];
  legacyOf({ uses: groups }, legacy, extra);
  // Layer 1 が並べたコマンドと場合のうち、解釈が触れなかったものは、何も足さない（単一化: 無いものは足さない）
  const layer1 = layer1Of(target) as { commands?: Record<string, { $fragment?: { when?: Record<string, unknown> } }> };
  const declared = legacy.commands as Record<string, Node> | undefined;
  if (layer1.commands !== undefined && !("$description" in layer1.commands)) {
    const commandsShape: Record<string, Node> = { ...(declared ?? {}) };
    for (const [name, written] of Object.entries(layer1.commands)) {
      const body = refined[name] ?? commandsShape[name] ?? make("component");
      const cases = Object.keys(written?.$fragment?.when ?? {});
      const mentioned = new Set(body.children.filter((node) => node.kind === "when" || node.kind === "otherwise").map((node) => (node.kind === "when" ? node.name : "otherwise")));
      const missing = cases.filter((sentence) => !mentioned.has(sentence)).map((sentence) => (sentence === "otherwise" ? make("otherwise") : make("when", { name: sentence })));
      commandsShape[name] = missing.length === 0 ? body : make("component", { children: [...body.children, ...missing] });
    }
    for (const [name, body] of Object.entries(refined)) if (!(name in commandsShape)) commandsShape[name] = body;
    legacy.commands = commandsShape;
  } else if (Object.keys(refined).length > 0) {
    legacy.commands = { ...(declared ?? {}), ...refined };
  }
  if (extra.length > 0) (legacy as Record<string, unknown>).unknown = extra;
  return legacy;
}
