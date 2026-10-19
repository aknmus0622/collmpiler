import { compositionOf, partsOfComposition } from "@clp/core";
import { declaredEvents, declaredMessage, declaredReportsStage0, failureEventFor, failureKey } from "./declared.ts";
import { SLOT_KEY, slotReportsStage0, slotsOf } from "./slots.ts";
import type { SlotCode, SlotReport } from "./slots.ts";
import type { DeclaredReport } from "./declared.ts";
import type { BoundSpecification, Composition, Constant, Declaration, FieldSchema, Fields, GoTo, OutputSchema, Table } from "@clp/core";
import { relative } from "node:path";
import type { Asset } from "./assets.ts";
import { compatible, conforms, describe, isEnum, isNumberSchema, isOneOf, isRecord, isStructured } from "./schema.ts";

// 仕様 (Layer 1 のコンポーネント + 決定表 + 解釈の構造) から IR を作る。
// どれにも関数は無いので、IR は宣言をほぼそのまま並べ直したものになる。
// 解釈の意味 (条件・計算・不変条件の関数) は IR に含めない。採点の正解だからである。
//
// IR のキーは、仕様を書くときの語と同じにしている。
// あわせて、型チェックをすり抜けた誤りを、分かりやすい文面で報告する。

// 6: キーを、仕様を書くときの語にそろえた（計算の { description, output }、場合の emits: [{ effect, input, onlyWhen }]）
export const IR_VERSION = 7;

// --- 読み込んだ仕様を、扱いやすい形に正規化したもの (loader が作る) ---
export type SpecModel = {
  init: string;
  states: readonly string[];
  // 終わりの状態（宣言したときだけ）
  final?: readonly string[];
  data: Fields;
  // コマンド名 → 入力
  commands: Record<string, Fields>;
  // 問い合わせの名前 → 引数と、答えの型。引数の無い問い合わせは、名前でそのまま読める
  queries: Record<string, { input: Fields; output: FieldSchema; promise?: "fresh" | "increasing"; mayFail?: true }>;
  // 副作用の名前 → フィールド
  effects: Record<string, Fields>;
  // コマンドの名前 → 返すものの形。返すコマンドがあるときだけ持つ
  outputs?: Record<string, OutputSchema>;
  // 覚えるデータの、はじめの値。宣言したものがあるときだけ持つ
  initial?: Record<string, unknown>;
  // 計算の名前 → 式を述べる文と、結果の型
  calculations?: Record<string, { is: string; type: FieldSchema }>;
  invariants?: readonly string[];
  // コマンドの名前 → 経路（"POST /todos"）。書いたコマンドがあるときだけ持つ
  routes?: Record<string, string>;
  // 再起動を越えて残る (W7): 自分で (true) か、保存先の部品 (store はその名前) を通して
  durable?: true | { store: string };
  // 含む部品の名前 → その部品の名前と、外から見た境界（呼べるコマンド、依存。依存の名前は部品の名前で修飾したもの）
  parts?: Record<
    string,
    {
      component: string;
      // 多数あるときの、キーの名前
      by?: string;
      commands: Record<string, Fields>;
      outputs?: Record<string, OutputSchema>;
      queries: Record<string, { input: Fields; output: FieldSchema; promise?: "fresh" | "increasing"; mayFail?: true }>;
      effects: Record<string, Fields>;
      // その部品か、その中の部品が、再起動を越えて残る
      durable?: true;
    }
  >;
};

// 構造の中の値: 定数か、参照
export type Reference = { $ref: "decision" | "calculation" | "input" | "data" | "query" | "was" | "call"; path: unknown };
export type SpecValue = Constant | Reference;
export type SpecEffect = { name: string; payload: Record<string, SpecValue>; when?: string | Reference };
// goTo が無ければ、状態は変わらない
// 尋ねること: どの問い合わせを、どの引数で。答えは、付けた名前で読む
export type SpecAsk = { query: string; input: Record<string, SpecValue> };
// 含む部品のコマンドを呼ぶこと: どの部品の、どのコマンドを、どの入力で。答えは、付けた名前で読む
export type SpecCall = { part: string; command: string; input: Record<string, SpecValue>; key?: SpecValue };
// responds: コマンドが返す値。値1つか、{ フィールド: 値 }
export type SpecOutcome = {
  // 状態の名前か、決定表の列の参照（その行の値が、状態の名前） (W2)
  goTo?: GoTo;
  does?: string;
  responds?: SpecValue | Record<string, SpecValue>;
  effects: SpecEffect[];
  set: Record<string, SpecValue>;
  // 多数ある部品を作る、消す
  adds?: { part: string; key: SpecValue; data: Record<string, SpecValue> }[];
  removes?: { part: string; key: SpecValue }[];
};

export type SpecInput = {
  // コンポーネントの名前 (order など)
  name?: string;
  model?: SpecModel;
  // コマンド名 → 実行できる状態、事前条件、条件ごとの結果（分かれないコマンドは otherwise だけ）
  behaviors: Record<
    string,
    {
      description?: string;
      from?: readonly string[];
      onlyIf?: readonly string[];
      asks?: Record<string, SpecAsk>;
      calls?: Record<string, SpecCall>;
      when: Record<string, SpecOutcome>;
    }
  >;
  decisions: Record<string, Table>;
  // Layer 1 のコンポーネント（書かれたまま）、解釈を重ねたもの、解釈（意味の関数を含む）
  layer1?: object;
  component?: Declaration;
  binding?: BoundSpecification;
  // Layer 1 と解釈が合わない点
  problems?: string[];
  // 含む部品（それぞれ、その部品の解釈と一緒に読んだもの）
  parts?: Record<string, SpecInput>;
  // 多数ある部品として含まれるときの、キーの名前（含む側が読んだとき）
  by?: string;
  // 木の検査で見つかったこと（次の書き方で書かれた仕様）。at は、その節を書いた場所
  grammar?: { code: string; message: string; at?: { file: string; line: number } }[];
  // 解釈を導いたあとで、Layer 1 が変わっている
  stale?: boolean;
  // 確定版の解釈に、人が確かめていない印 (// REVIEW:) が残っている場所
  unreviewed?: string[];
  // 葉の検査で見つかった書き残し（道筋つき。DSL.md §16.7）
  incomplete?: string[];
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

// 診断の場所の表示: コマンド、またはコマンドと場合。仕様の全体についての診断には、場所が無い
export const whereOf = (diagnostic: { behavior: string; case: string }) => {
  const where = [diagnostic.behavior, diagnostic.case].filter((part) => part !== "").join(".");
  return where === "" ? "" : `${where}: `;
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
      // 取っ手の名前は、部品に置いたキーで決まる。置いていない表の列は、名前が決まらない ("?")
      if (decision === "?") return { problem: "参照している決定表が、コンポーネントの decisions に置かれていません" };
      if (!table) return { problem: `決定表 "${decision}" は、コンポーネントの decisions にありません` };
      if (!(column in table.otherwise)) return { problem: `決定表 "${decision}" に、列 "${column}" はありません` };
      return { values: Object.values(table).map((row) => row[column]) };
    }
    case "calculation":
      return model.calculations?.[name] ? { schema: model.calculations[name].type } : { problem: `計算 "${name}" は、calculations にありません` };
    case "input": {
      // フィールドの組のフィールドは、点でつないだ名前（body.title）
      const [field, ...inner] = name.split(".");
      let schema: FieldSchema | undefined = model.commands[command]?.[field];
      if (schema === undefined) return { problem: `"${field}" は、コマンド ${command} の input にありません` };
      for (const key of inner) {
        const record = fieldsOfSchema(schema);
        if (!record || !(key in record)) return { problem: `"${name}": ${field} に、フィールド "${key}" はありません` };
        schema = record[key];
      }
      return { schema };
    }
    case "data": {
      // フィールドの組のフィールドは、点でつないだ名前（last.status。W12）
      const [field, ...inner] = model.data[name] ? [name] : name.split(".");
      if (!model.data[field]) return { problem: `"${field}" は、data にありません` };
      return fieldIn(model.data[field], inner, field);
    }
    case "query": {
      // そのコマンドが尋ねたことに付けた名前か、引数の無い問い合わせの名前。答えのフィールドは、点でつないで続ける (W12)
      const asks = input.behaviors[command]?.asks ?? {};
      const [head, ...inner] = asks[name] || model.queries[name] ? [name] : name.split(".");
      const asked = asks[head];
      if (asked) return model.queries[asked.query] ? fieldIn(model.queries[asked.query].output, inner, head) : { problem: `問い合わせ "${asked.query}" は、queries にありません` };
      const query = model.queries[head];
      if (!query) return { problem: `"${head}" は、queries にも、コマンド ${command} の asks にもありません` };
      if (Object.keys(query.input).length > 0) return { problem: `問い合わせ "${head}" には引数があります。asks で尋ねて、付けた名前で読んでください` };
      return fieldIn(query.output, inner, head);
    }
    case "was": {
      const unknown = (ref.path as string[]).find((state) => !model.states.includes(state));
      return unknown === undefined ? { boolean: true } : { problem: `was: "${unknown}" は states にありません` };
    }
    case "call": {
      // 含む部品のコマンドの答え。フィールドを続けて指せば、そのフィールド
      const [alias, ...fields] = ref.path as string[];
      const call = input.behaviors[command]?.calls?.[alias];
      if (!call) return { problem: `"${alias}" は、コマンド ${command} が呼んだ部品のコマンドではありません` };
      const returned = model.parts?.[call.part]?.outputs?.[call.command] as FieldSchema | undefined;
      if (returned === undefined) return { problem: `部品 "${call.part}" のコマンド ${call.command} は、何も返しません (output がありません)` };
      let schema: FieldSchema = returned;
      for (const field of fields) {
        const record: Fields | undefined = isRecord(schema) ? (schema as unknown as { record: Fields }).record : undefined;
        if (!record || !(field in record)) return { problem: `${alias} の答えに、フィールド "${field}" はありません` };
        schema = record[field];
      }
      return { schema };
    }
  }
}

// フィールドの組の中を、名前の並びでたどった型 (W12)
// フィールドの組のフィールドか、どれか1つの形 (oneOf) の形
const fieldsOfSchema = (schema: FieldSchema): Fields | undefined =>
  isRecord(schema) ? (schema as unknown as { record: Fields }).record : isOneOf(schema) ? schema.oneOf : undefined;
function fieldIn(schema: FieldSchema, fields: string[], owner: string): { schema?: FieldSchema; problem?: string } {
  let current = schema;
  for (const field of fields) {
    const record = fieldsOfSchema(current);
    if (!record || !(field in record)) return { problem: `${owner} に、フィールド "${field}" はありません` };
    current = record[field];
  }
  return { schema: current };
}

// スロットの検査 (slots.ts) が使う: 参照の型と、値が合わない理由
export const typeOfValue = (input: SpecInput, command: string, ref: Reference) => typeOf(input, command, ref);
export const mismatchOf = (input: SpecInput, command: string, value: SpecValue, target: FieldSchema) => mismatch(input, command, value, target);

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

// --- 値の直列化（仕様に書かれた値を、IR の形にする） ---
// Stage 0: 手書き。定数はそのまま、参照は短い文字列にする。
// これも、フレームワーク自身の仕様 (packages/cli/self/specs/value-writer.*) から生成したコード (Stage 1) で置き換えられる
export function serialize(value: SpecValue): unknown {
  if (!isReference(value)) return value;
  if (value.$ref === "was") return { $was: value.path };
  return { $ref: `${value.$ref}:${Array.isArray(value.path) ? value.path.join(".") : value.path}` };
}

// 値1つを、直列化に渡すコマンドの列にする。コマンドの名前と入力は、value-writer の仕様のもの
// value-writer に渡すコマンド: 値1つを、どれか1つの形 (oneOf) で渡す。答えが、IR に書く値
export type WriteEvent = {
  name: "Write";
  input: {
    value:
      | { constant: string | number | boolean }
      | { reference: { target: "input" | "data" | "query" | "calculation" | "call"; name: string } }
      | { column: { table: string; column: string } }
      | { was: string[] };
  };
};
export function writeEvent(value: SpecValue): WriteEvent {
  if (!isReference(value)) return { name: "Write", input: { value: { constant: value as string | number | boolean } } };
  if (value.$ref === "was") return { name: "Write", input: { value: { was: [...(value.path as string[])] } } };
  if (value.$ref === "decision") {
    const [table, column] = value.path as [string, string];
    return { name: "Write", input: { value: { column: { table, column } } } };
  }
  return { name: "Write", input: { value: { reference: { target: value.$ref as "input", name: String(value.path) } } } };
}

// IR に書く値を、置き場所の名前と一緒に並べる（尋ねることの引数、副作用のペイロードと when、覚えるデータ）
const SLOT = {
  ask: (command: string, alias: string, field: string) => `${command}|asks|${alias}|${field}`,
  // field が "" なら、値1つの結果
  responds: (command: string, caseName: string, field: string) => `${command}|${caseName}|responds|${field}`,
  payload: (command: string, caseName: string, index: number, field: string) => `${command}|${caseName}|effects|${index}|${field}`,
  when: (command: string, caseName: string, index: number) => `${command}|${caseName}|effects|${index}|when`,
  set: (command: string, caseName: string, field: string) => `${command}|${caseName}|set|${field}`,
};
// 返す値を、[フィールド, 値] の並びにする。返すものがフィールドの組なら、フィールドごと。そうでなければ、値1つ（フィールドは ""）
export const isRecordOutput = (schema: OutputSchema | undefined): schema is { record: Fields; optional?: readonly string[] } =>
  schema !== undefined && isRecord(schema);
export function respondedValues(responds: SpecOutcome["responds"], output: OutputSchema | undefined): [string, SpecValue][] {
  if (responds === undefined) return [];
  const fields = (isRecordOutput(output) || (output !== undefined && isOneOf(output))) && typeof responds === "object" && responds !== null && !Array.isArray(responds) && !("$ref" in responds);
  return fields ? Object.entries(responds as Record<string, SpecValue>) : [["", responds as SpecValue]];
}
// 定数のうち、平らな値（真偽値・数値・文字列）と参照。並びやフィールドの組の定数と、含む部品の答えの参照は、
// セルフホストした部品には渡さない（value-writer の仕様の範囲の外。手書きの版が書く）
const isFlat = (value: unknown) =>
  typeof value !== "object" || (value !== null && "$ref" in (value as object) && (value as Reference).$ref !== "call");
// 語彙に、構造を持つ型があるか。あれば、ペイロードの検査は手書きの版 (Stage 0) が行う
// （セルフホストした payload-check の仕様は、平らな値だけを扱う）
export function structuredVocabulary(model: SpecModel): boolean {
  const schemas = [
    ...Object.values(model.data),
    ...Object.values(model.commands).flatMap((fields) => Object.values(fields)),
    ...Object.values(model.effects).flatMap((fields) => Object.values(fields)),
    ...Object.values(model.queries).flatMap((query) => [query.output, ...Object.values(query.input)]),
    ...Object.values(model.calculations ?? {}).map((calculation) => calculation.type),
  ];
  return schemas.some(isStructured);
}

export function* valuesToWrite(input: SpecInput): Generator<[slot: string, value: SpecValue]> {
  for (const [command, behavior] of Object.entries(input.behaviors)) {
    for (const [alias, asked] of Object.entries(behavior.asks ?? {})) {
      for (const [field, value] of Object.entries(asked.input)) if (isFlat(value)) yield [SLOT.ask(command, alias, field), value];
    }
    for (const [caseName, outcome] of Object.entries(behavior.when)) {
      for (const [index, effect] of outcome.effects.entries()) {
        for (const [field, value] of Object.entries(effect.payload)) if (isFlat(value)) yield [SLOT.payload(command, caseName, index, field), value];
        if (effect.when !== undefined && typeof effect.when !== "string" && isFlat(effect.when)) yield [SLOT.when(command, caseName, index), effect.when];
      }
      for (const [field, value] of Object.entries(outcome.set)) if (isFlat(value)) yield [SLOT.set(command, caseName, field), value];
      for (const [field, value] of respondedValues(outcome.responds, input.model?.outputs?.[command])) if (isFlat(value)) yield [SLOT.responds(command, caseName, field), value];
    }
  }
}

// --- 名前の検査（宣言されていない状態・副作用への参照） ---
// この検査は、フレームワーク自身の仕様 (packages/cli/self/specs/reference-check.*) にも書いてあり、
// そこから生成したコード (Stage 1) で置き換えられる。判断の結果は、だれが判断しても同じ形で受け取る。
export type ReferenceDiagnostic = { code: "unknown-state" | "unknown-effect"; command: string; caseName: string; subject: string };

// 仕様の木をたどって、検査に渡すコマンドの列にする。コマンドの名前と入力は、reference-check の仕様のもの。
// Stage 0 も Stage 1 も、同じ列を受け取る（たどり方は、どちらにも共通の、判断を持たない糊）
export type ReferenceEvent =
  | { name: "Begin" | "LeaveCommand" | "Finish"; input: {} }
  | { name: "EnterCommand" | "EnterCase" | "UseEffect"; input: { name: string } }
  | { name: "AllowFrom" | "GoTo"; input: { state: string } };
// 遷移先になりうる状態: 名前なら、その1つ。決定表の列なら、その列の値（null を除く） (W2)
export function goToTargets(input: SpecInput, goTo: GoTo): string[] {
  if (typeof goTo === "string") return [goTo];
  if (goTo.$ref !== "decision") return [];
  const [table, column] = goTo.path as [string, string];
  return [...new Set(Object.values(input.decisions[table] ?? {}).map((row) => row[column]).filter((cell): cell is string => typeof cell === "string"))];
}

export function* referenceEvents(input: SpecInput): Generator<ReferenceEvent> {
  yield { name: "Begin", input: {} };
  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    yield { name: "EnterCommand", input: { name } };
    for (const state of behavior.from ?? []) yield { name: "AllowFrom", input: { state } };
    for (const caseName of Object.keys(behavior.when).sort()) {
      const outcome = behavior.when[caseName];
      yield { name: "EnterCase", input: { name: caseName } };
      if (outcome.goTo !== undefined) for (const state of goToTargets(input, outcome.goTo)) yield { name: "GoTo", input: { state } };
      for (const effect of outcome.effects) yield { name: "UseEffect", input: { name: effect.name } };
    }
    yield { name: "LeaveCommand", input: {} };
  }
  yield { name: "Finish", input: {} };
}

// Stage 0: 手書きの判断。Stage 1 を読み込めないときの備えであり、Stage 1 と結果が一致することを確かめる相手でもある
export function referenceDiagnostics(input: SpecInput): ReferenceDiagnostic[] {
  const model = input.model;
  if (!model) return [];
  const found: ReferenceDiagnostic[] = [];
  let command = "";
  let caseName = "";
  for (const event of referenceEvents(input)) {
    if (event.name === "EnterCommand") [command, caseName] = [event.input.name, ""];
    else if (event.name === "EnterCase") caseName = event.input.name;
    else if ((event.name === "AllowFrom" || event.name === "GoTo") && !model.states.includes(event.input.state)) {
      found.push({ code: "unknown-state", command, caseName, subject: event.input.state });
    } else if (event.name === "UseEffect" && !(event.input.name in model.effects)) {
      found.push({ code: "unknown-effect", command, caseName, subject: event.input.name });
    }
  }
  return found;
}

// フィールドの型の種類。"enum" は、決まった文字列のどれか
export const kindOf = (schema: FieldSchema): "boolean" | "integer" | "number" | "string" | "enum" =>
  isEnum(schema) ? "enum" : isNumberSchema(schema) ? schema.type : typeof schema === "string" && schema !== "value" ? schema : "string";

// references / slots: 名前の検査と、値の置き場所の検査 (slots.ts) の結果。values: 直列化した値（置き場所の名前 → IR の形）。
// 省略時は Stage 0 で判断する。入口 (compile / implement) は、Stage 1 の結果を渡す (stage1.ts)
export function extract(
  input: SpecInput,
  // declared: 宣言の検査の判断（型・列・約束 = reports、失敗の条件 = failures。鍵は failureKey）
  // slots: 値の置き場所の検査の判断 (slots.ts)
  options: { references?: ReferenceDiagnostic[]; slots?: SlotReport[]; values?: Map<string, unknown>; declared?: { reports: DeclaredReport[]; failures: Map<string, DeclaredReport[]> } } = {},
) {
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, behavior: string, caseName: string, message: string) =>
    diagnostics.push({ severity: "error", code, behavior, case: caseName, message });
  const model = input.model;
  const binding = input.binding;
  // 解釈が無い、または Layer 1 と合わない: 語彙が定まらないので、IR は作れない
  if (input.layer1 && !binding && !input.sources?.binding) report("unbound-specification", "", "", "このコンポーネントの解釈 (interpretation) がありません。clp interpret で導いて、確定してください");
  for (const found of input.grammar ?? []) {
    report(found.code, "", "", `${found.at ? `${relative(process.cwd(), found.at.file)}:${found.at.line}: ` : ""}${found.message}`);
  }
  for (const problem of input.problems ?? []) report("bad-interpretation", "", "", problem);
  for (const found of input.incomplete ?? []) report("incomplete", "", "", found);
  if (input.stale) {
    report("stale-interpretation", "", "", "解釈を導いたあとで、Layer 1 が変わっています。clp interpret で導き直すか、解釈がいまも正しいことを確かめて clp interpret --accept を実行してください");
  }
  if (input.unreviewed) {
    report("unreviewed-interpretation", "", "", `確定した解釈に、確かめていない疑問点・食い違いが残っています (${input.unreviewed.join(", ")})。Layer 1 を詳しくして clp interpret で導き直すか、その読み方でよければ、その行の REVIEW を REVIEWED に書き換えてください`);
  }
  if (!model) return { ir: { irVersion: IR_VERSION, behaviors: [], decisions: {} }, diagnostics };

  // 使われた条件の組み合わせ (W3)。IR に、その中身を出す
  const compositions: Record<string, Composition> = {};
  const condition = (behavior: string, caseName: string, name: string) => {
    const composition = compositionOf(name);
    if (composition) {
      compositions[name] = composition;
      // 失敗の条件 (W8): 失敗することがある (mayFail) 問い合わせで、そのコマンドが読めるもの
      const failure = failureEventFor(input, behavior, caseName, name);
      if (failure) {
        const decided = options.declared?.failures.get(failureKey(behavior, caseName, name)) ?? declaredReportsStage0([failure]);
        for (const found of decided) {
          const worded = declaredMessage({ ...found, event: failure });
          report(worded.code, worded.behavior, worded.caseName, worded.message);
        }
      }
      // 組み合わせの意味は自動で決まるので、組み合わせる前の条件を確かめる
      for (const part of partsOfComposition(composition)) condition(behavior, caseName, part);
      return;
    }
    // 意味の関数が無いことは、葉の検査 (incomplete) が報告する
    void behavior;
    void caseName;
  };

  // 名前の検査は、判断を受け取るだけ。文面（利用者向け）は、ここで付ける
  const references = options.references ?? referenceDiagnostics(input);
  const reported = (code: ReferenceDiagnostic["code"], command: string, caseName: string, subject: string) =>
    references.some((found) => found.code === code && found.command === command && found.caseName === caseName && found.subject === subject);

  // 値の直列化: Stage 1 が書いたものがあれば、それを置く。無ければ手書きで直列化する
  const write = (slot: string, value: SpecValue) => (options.values?.has(slot) ? options.values.get(slot) : serialize(value));

  // 値の置き場所の検査も、判断を受け取るだけ（Stage 1 か Stage 0）。「なぜ合わないか」の文面は、ここで付ける
  const slotReports = options.slots ?? slotsOf(input).flatMap(slotReportsStage0);
  const flagged = (key: string, code: SlotCode, field = "") => slotReports.some((found) => found.key === key && found.code === code && found.field === field);
  // 合わない理由: Stage 0 の言葉で。言えなければ、型だけを言う
  const why = (command: string, value: SpecValue, target: FieldSchema) => mismatch(input, command, value, target) ?? `この値は ${describe(target)} に入りません`;

  const behaviors = [];
  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    for (const state of behavior.from ?? []) {
      if (reported("unknown-state", name, "", state)) report("unknown-state", name, "", `from の "${state}" は states にありません`);
    }
    for (const precondition of behavior.onlyIf ?? []) condition(name, "", precondition);

    // 尋ねること: 問い合わせがあること、引数がそろっていること、引数の型が合うこと
    const asks: Record<string, unknown> = {};
    for (const [alias, asked] of Object.entries(behavior.asks ?? {})) {
      const query = model.queries[asked.query];
      const key = SLOT_KEY.asks(name, alias);
      if (flagged(key, "unknown-target")) report("unknown-query", name, "", `asks.${alias}: 問い合わせ "${asked.query}" は queries にありません`);
      if (!query) continue;
      for (const field of Object.keys(query.input)) {
        if (flagged(key, "missing-field", field)) report("missing-field", name, "", `asks.${alias}: 問い合わせ ${asked.query} に、引数 "${field}" がありません`);
      }
      for (const [field, value] of Object.entries(asked.input)) {
        const problem = flagged(key, "unknown-field", field)
          ? `問い合わせ ${asked.query} に、引数 "${field}" はありません`
          : flagged(key, "bad-source", field)
            ? "引数に書けるのは、定数か、ref.input / ref.data です"
            : flagged(key, "mismatch", field)
              ? why(name, value, query.input[field])
              : undefined;
        if (problem) report("bad-value", name, "", `asks.${alias}.${field}: ${problem}`);
      }
      asks[alias] = { query: asked.query, input: Object.fromEntries(Object.entries(asked.input).map(([field, value]) => [field, write(SLOT.ask(name, alias, field), value)])) };
    }

    // 含む部品のコマンドを呼ぶこと: 部品とコマンドがあること、入力がそろっていること、入力の型が合うこと
    const calls: Record<string, unknown> = {};
    for (const [alias, call] of Object.entries(behavior.calls ?? {})) {
      const part = model.parts?.[call.part];
      const fields = part?.commands[call.command] ?? {};
      const key = SLOT_KEY.calls(name, alias);
      if (flagged(key, "unknown-target")) report("unknown-part", name, "", `${alias}: 部品 "${call.part}" は parts にありません`);
      else if (flagged(key, "keyed-mismatch")) {
        report("bad-value", name, "", `${alias}: 部品 "${call.part}" は${part?.by === undefined ? "1つだけなので、at(...) は要りません" : "多数あるので、at(キー) でどれかを選んでください"}`);
      } else if (flagged(key, "unknown-command")) report("unknown-command", name, "", `${alias}: 部品 "${call.part}" (${part?.component}) に、コマンド ${call.command} はありません`);
      else {
        for (const field of Object.keys(fields)) {
          if (flagged(key, "missing-field", field)) report("missing-field", name, "", `${alias}: コマンド ${call.command} に、入力 "${field}" がありません`);
        }
        for (const [field, value] of Object.entries(call.input)) {
          const problem = flagged(key, "unknown-field", field) ? `コマンド ${call.command} に、入力 "${field}" はありません` : flagged(key, "mismatch", field) ? why(name, value, fields[field]) : undefined;
          if (problem) report("bad-value", name, "", `${alias}.${field}: ${problem}`);
        }
      }
      calls[alias] = {
        part: call.part,
        command: call.command,
        ...(call.key === undefined ? {} : { at: serialize(call.key) }),
        input: Object.fromEntries(Object.entries(call.input).map(([field, value]) => [field, serialize(value)])),
      };
    }

    const when: Record<string, unknown> = {};
    for (const caseName of Object.keys(behavior.when).sort()) {
      const outcome = behavior.when[caseName];
      condition(name, caseName, caseName);
      if (outcome.goTo !== undefined) {
        const targets = goToTargets(input, outcome.goTo);
        for (const state of targets) if (reported("unknown-state", name, caseName, state)) report("unknown-state", name, caseName, `goTo の "${state}" は states にありません`);
        if (typeof outcome.goTo !== "string") {
          const found = isReference(outcome.goTo) ? typeOf(input, name, outcome.goTo as Reference) : { problem: "参照ではありません" };
          if (outcome.goTo.$ref !== "decision") report("bad-value", name, caseName, "goTo に書けるのは、状態か、状態の名前を値に持つ決定表の列です");
          else if (found.problem) report("bad-value", name, caseName, `goTo: ${found.problem}`);
          else if (targets.length === 0) report("bad-value", name, caseName, "goTo に書いた決定表の列に、状態がありません");
        }
      }

      const effects = outcome.effects.map((effect, index) => {
        const fields = model.effects[effect.name];
        if (reported("unknown-effect", name, caseName, effect.name)) report("unknown-effect", name, caseName, `副作用 "${effect.name}" は effects にありません`);
        const at = SLOT_KEY.effect(name, caseName, index);
        for (const field of Object.keys(fields ?? {})) {
          if (flagged(at, "missing-field", field)) report("missing-field", name, caseName, `副作用 ${effect.name} に、フィールド "${field}" がありません`);
        }
        for (const [field, value] of Object.entries(effect.payload)) {
          // 合わないと判断したのは検査。ここでは、その理由を言葉にするだけ
          if (flagged(at, "unknown-field", field)) report("bad-value", name, caseName, `${effect.name}.${field}: 副作用 ${effect.name} に、フィールド "${field}" はありません`);
          else if (flagged(at, "mismatch", field)) report("bad-value", name, caseName, `${effect.name}.${field}: ${why(name, value, fields![field])}`);
        }
        if (typeof effect.when === "string") condition(name, caseName, effect.when);
        else if (effect.when && flagged(SLOT_KEY.onlyWhen(name, caseName, index), "mismatch")) {
          report("bad-value", name, caseName, `${effect.name} の onlyWhen: ${why(name, effect.when, "boolean")}`);
        }
        // IR の語は、仕様を書くときの語と同じ: emits("副作用", { 値 }, onlyWhen(条件))
        return {
          effect: effect.name,
          input: Object.fromEntries(Object.entries(effect.payload).map(([field, value]) => [field, write(SLOT.payload(name, caseName, index, field), value)])),
          ...(effect.when === undefined ? {} : { onlyWhen: typeof effect.when === "string" ? effect.when : write(SLOT.when(name, caseName, index), effect.when) }),
        };
      });

      const setKey = SLOT_KEY.set(name, caseName);
      for (const [field, value] of Object.entries(outcome.set)) {
        if (flagged(setKey, "unknown-field", field)) report("bad-value", name, caseName, `set.${field}: "${field}" は data にありません`);
        else if (flagged(setKey, "mismatch", field)) report("bad-value", name, caseName, `set.${field}: ${why(name, value, model.data[field])}`);
      }

      // 返す値: 返すものの形を宣言したコマンドは、どの場合にも返す値が要る
      const output = model.outputs?.[name];
      const responded = respondedValues(outcome.responds, output);
      const respondsKey = SLOT_KEY.responds(name, caseName);
      if (output === undefined) {
        if (flagged(respondsKey, "no-output")) report("bad-response", name, caseName, `コマンド ${name} は、返すものの形 (output) を宣言していないので、responds は書けません`);
      } else if (outcome.responds === undefined) {
        if (flagged(respondsKey, "missing-response")) report("missing-response", name, caseName, `コマンド ${name} は output を宣言していますが、この場合に返す値 (responds) がありません`);
      } else if (isRecordOutput(output)) {
        const given = new Map(responded);
        if (flagged(respondsKey, "wrong-shape")) report("bad-response", name, caseName, "responds: 返すものはフィールドの組です。responds({ フィールド: 値 }) と書いてください");
        for (const [field, schema] of Object.entries(output.record)) {
          if (flagged(respondsKey, "missing-field", field)) report("missing-field", name, caseName, `responds に、フィールド "${field}" がありません`);
          else if (flagged(respondsKey, "mismatch", field)) {
            // 何でも入る値 (value) と、optional(...) のフィールドには、null も入る
            const value = given.get(field)!;
            report("bad-value", name, caseName, (value as unknown) === null ? `responds.${field}: null を返せるのは、optional(...) と宣言したフィールドだけです` : `responds.${field}: ${why(name, value, schema)}`);
          }
        }
        for (const field of given.keys()) {
          if (flagged(respondsKey, "unknown-field", field)) report("bad-value", name, caseName, `responds.${field}: "${field}" は、output のフィールドにありません`);
        }
      } else if (isOneOf(output)) {
        // どれか1つの形: 形の名前を1つだけキーにする（{ constant: 値 }）
        if (flagged(respondsKey, "wrong-shape")) {
          report("bad-response", name, caseName, `responds: 返すものは、${Object.keys(output.oneOf).join(" / ")} のどれか1つの形です。responds: { 形: 値 } と書いてください`);
        } else {
          for (const [variant, given] of responded) {
            if (flagged(respondsKey, "mismatch", variant)) report("bad-value", name, caseName, `responds.${variant}: ${why(name, given, output.oneOf[variant])}`);
          }
        }
      } else if (flagged(respondsKey, "wrong-shape")) {
        report("bad-response", name, caseName, "responds: 返すものは値1つです。responds(値) と書いてください");
      } else if (flagged(respondsKey, "mismatch")) {
        report("bad-value", name, caseName, `responds: ${why(name, responded[0][1], output as FieldSchema)}`);
      }
      const written = responded.map(([field, value]) => [field, isFlat(value) ? write(SLOT.responds(name, caseName, field), value) : value] as const);

      // 多数ある部品を作る、消す: 多数ある部品であること、作るときのデータが、その部品のデータにあって型が合うこと
      for (const [index, { part }] of [...(outcome.adds ?? []), ...(outcome.removes ?? [])].entries()) {
        if (flagged(SLOT_KEY.change(name, caseName, index), "unknown-target")) report("unknown-part", name, caseName, `部品 "${part}" は、多数ある部品 (many) として parts にありません`);
      }
      for (const [index, added] of (outcome.adds ?? []).entries()) {
        const data = input.parts?.[added.part]?.model?.data ?? {};
        const key = SLOT_KEY.adds(name, caseName, index);
        for (const [field, value] of Object.entries(added.data)) {
          if (flagged(key, "unknown-field", field)) report("bad-value", name, caseName, `${added.part}.add.${field}: 部品 "${added.part}" の data に、"${field}" はありません`);
          else if (flagged(key, "mismatch", field)) report("bad-value", name, caseName, `${added.part}.add.${field}: ${why(name, value, data[field])}`);
        }
      }

      when[caseName] = {
        ...(outcome.goTo === undefined ? {} : { goTo: typeof outcome.goTo === "string" ? outcome.goTo : serialize(outcome.goTo as SpecValue) }),
        ...(outcome.does === undefined ? {} : { does: outcome.does }),
        ...(outcome.responds === undefined ? {} : { responds: written.length === 1 && written[0][0] === "" ? written[0][1] : Object.fromEntries(written) }),
        ...(effects.length > 0 ? { emits: effects } : {}),
        ...(Object.keys(outcome.set).length > 0
          ? { set: Object.fromEntries(Object.entries(outcome.set).map(([field, value]) => [field, write(SLOT.set(name, caseName, field), value)])) }
          : {}),
        ...(outcome.adds?.length
          ? {
              adds: outcome.adds.map((added) => ({
                part: added.part,
                key: serialize(added.key),
                data: Object.fromEntries(Object.entries(added.data).map(([field, value]) => [field, serialize(value)])),
              })),
            }
          : {}),
        ...(outcome.removes?.length ? { removes: outcome.removes.map((removed) => ({ part: removed.part, key: serialize(removed.key) })) } : {}),
      };
    }
    behaviors.push({
      name,
      ...(behavior.description === undefined ? {} : { description: behavior.description }),
      from: [...(behavior.from ?? model.states)],
      onlyIf: [...(behavior.onlyIf ?? [])],
      ...(Object.keys(asks).length > 0 ? { asks } : {}),
      ...(Object.keys(calls).length > 0 ? { calls } : {}),
      when,
    });
  }

  // 宣言そのものの誤り: 型（範囲の矛盾、空の列挙、範囲の外のしきい値）、決定表の列の種類、約束（判断は Stage 1 か Stage 0。declared.ts）
  const declared = options.declared?.reports ?? declaredReportsStage0(declaredEvents(input));
  const say = (found: DeclaredReport) => {
    const worded = declaredMessage(found);
    report(worded.code, worded.behavior, worded.caseName, worded.message);
  };
  for (const found of declared) if (found.event.name !== "Promise") say(found);

  // 覚えるデータの、はじめの値は、その型に合う
  for (const [field, value] of Object.entries(model.initial ?? {})) {
    if (flagged(SLOT_KEY.initially(field), "mismatch", field)) report("bad-value", "", "", `data.${field} の initially: ${JSON.stringify(value)} は ${describe(model.data[field])} に入りません`);
  }
  // 問い合わせの約束: fresh は文字列か整数、increasing は数に付けられる。引数つきの問い合わせには、まだ付けられない
  for (const found of declared) if (found.event.name === "Promise") say(found);

  const decisions: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(input.decisions)) {
    for (const row of Object.keys(table)) condition("", "", row);
    decisions[name] = { rows: table };
  }

  // Layer 1 が文で書いた説明（全体と、項目ごと）。構造が正確な形で、こちらは意図を伝える
  const descriptions = input.component?.descriptions ?? {};
  return {
    ir: {
      irVersion: IR_VERSION,
      ...(Object.keys(descriptions).length > 0 ? { descriptions } : {}),
      model: irModel(model),
      decisions,
      behaviors,
      // 組み合わせた条件の中身（使われたものだけ）
      ...(Object.keys(compositions).length > 0 ? { conditions: compositions } : {}),
    },
    diagnostics,
  };
}

// IR に出す語彙。内部の形と違うのは、計算の書き方だけ（仕様を書くときの語: description と output）
function irModel(model: SpecModel): unknown {
  const { calculations, ...rest } = model;
  return {
    ...rest,
    ...(calculations
      ? { calculations: Object.fromEntries(Object.entries(calculations).map(([name, { is, type }]) => [name, { description: is, output: type }])) }
      : {}),
  };
}

// 境界: アダプターの契約を決める部分（状態・コマンドと入力・問い合わせ・副作用）
export const boundaryOf = (ir: { model?: Partial<Omit<SpecModel, "calculations">> }) => {
  const { init, states, commands, queries, effects, outputs, parts, routes, durable } = ir.model ?? {};
  return stableStringify({
    init, states, commands, queries, effects,
    ...(outputs ? { outputs } : {}), ...(parts ? { parts } : {}), ...(routes ? { routes } : {}), ...(durable !== undefined ? { durable } : {}),
  });
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
