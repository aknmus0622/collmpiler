import type { BoundSpecification, Constant, Declaration, FieldSchema, Fields, Table } from "@clp/core";
import type { Asset } from "./assets.ts";
import { compatible, conforms, describe, isEnum, isNumberSchema } from "./schema.ts";

// 仕様 (Layer 1 のコンポーネント + 決定表 + 解釈の構造) から IR を作る。
// どれにも関数は無いので、IR は宣言をほぼそのまま並べ直したものになる。
// 解釈の意味 (条件・計算・不変条件の関数) は IR に含めない。採点の正解だからである。
//
// IR のキーは、仕様を書くときの語と同じにしている。
// あわせて、型チェックをすり抜けた誤りを、分かりやすい文面で報告する。

export const IR_VERSION = 5;

// --- 読み込んだ仕様を、扱いやすい形に正規化したもの (loader が作る) ---
export type SpecModel = {
  init: string;
  states: readonly string[];
  data: Fields;
  // コマンド名 → 入力
  commands: Record<string, Fields>;
  // 問い合わせの名前 → 引数と、答えの型。引数の無い問い合わせは、名前でそのまま読める
  queries: Record<string, { input: Fields; output: FieldSchema }>;
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
// 尋ねること: どの問い合わせを、どの引数で。答えは、付けた名前で読む
export type SpecAsk = { query: string; input: Record<string, SpecValue> };
export type SpecOutcome = { goTo?: string; does?: string; effects: SpecEffect[]; set: Record<string, SpecValue> };

export type SpecInput = {
  // コンポーネントの名前 (order など)
  name?: string;
  model?: SpecModel;
  // コマンド名 → 実行できる状態、事前条件、条件ごとの結果（分かれないコマンドは otherwise だけ）
  behaviors: Record<
    string,
    { description?: string; from?: readonly string[]; onlyIf?: readonly string[]; asks?: Record<string, SpecAsk>; when: Record<string, SpecOutcome> }
  >;
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
    case "query": {
      // そのコマンドが尋ねたことに付けた名前か、引数の無い問い合わせの名前
      const asked = input.behaviors[command]?.asks?.[name];
      if (asked) return model.queries[asked.query] ? { schema: model.queries[asked.query].output } : { problem: `問い合わせ "${asked.query}" は、queries にありません` };
      const query = model.queries[name];
      if (!query) return { problem: `"${name}" は、queries にも、コマンド ${command} の asks にもありません` };
      if (Object.keys(query.input).length > 0) return { problem: `問い合わせ "${name}" には引数があります。asks で尋ねて、付けた名前で読んでください` };
      return { schema: query.output };
    }
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

// --- 値の直列化（仕様に書かれた値を、IR の形にする） ---
// Stage 0: 手書き。定数はそのまま、参照は短い文字列にする。
// これも、フレームワーク自身の仕様 (packages/cli/self/specs/value-writer.*) から生成したコード (Stage 1) で置き換えられる
export function serialize(value: SpecValue): unknown {
  if (!isReference(value)) return value;
  if (value.$ref === "was") return { $was: value.path };
  return { $ref: `${value.$ref}:${Array.isArray(value.path) ? value.path.join(".") : value.path}` };
}

// 値1つを、直列化に渡すコマンドの列にする。コマンドの名前と入力は、value-writer の仕様のもの
export type WriteEvent =
  | { name: "Constant"; input: { kind: "string" | "number" | "boolean"; text: string; number: number; flag: boolean } }
  | { name: "Reference"; input: { target: "input" | "data" | "query" | "calculation" | "decision"; name: string; table: string; column: string } }
  | { name: "WasState"; input: { state: string } };
export function* writeEvents(value: SpecValue): Generator<WriteEvent> {
  if (!isReference(value)) {
    yield {
      name: "Constant",
      input: {
        kind: typeof value as "string" | "number" | "boolean",
        text: typeof value === "string" ? value : "",
        number: typeof value === "number" ? value : 0,
        flag: value === true,
      },
    };
  } else if (value.$ref === "was") {
    for (const state of value.path as string[]) yield { name: "WasState", input: { state } };
  } else if (value.$ref === "decision") {
    const [table, column] = value.path as [string, string];
    yield { name: "Reference", input: { target: "decision", name: "", table, column } };
  } else {
    yield { name: "Reference", input: { target: value.$ref, name: String(value.path), table: "", column: "" } };
  }
}

// IR に書く値を、置き場所の名前と一緒に並べる（尋ねることの引数、副作用のペイロードと when、覚えるデータ）
const SLOT = {
  ask: (command: string, alias: string, field: string) => `${command}|asks|${alias}|${field}`,
  payload: (command: string, caseName: string, index: number, field: string) => `${command}|${caseName}|effects|${index}|${field}`,
  when: (command: string, caseName: string, index: number) => `${command}|${caseName}|effects|${index}|when`,
  set: (command: string, caseName: string, field: string) => `${command}|${caseName}|set|${field}`,
};
export function* valuesToWrite(input: SpecInput): Generator<[slot: string, value: SpecValue]> {
  for (const [command, behavior] of Object.entries(input.behaviors)) {
    for (const [alias, asked] of Object.entries(behavior.asks ?? {})) {
      for (const [field, value] of Object.entries(asked.input)) yield [SLOT.ask(command, alias, field), value];
    }
    for (const [caseName, outcome] of Object.entries(behavior.when)) {
      for (const [index, effect] of outcome.effects.entries()) {
        for (const [field, value] of Object.entries(effect.payload)) yield [SLOT.payload(command, caseName, index, field), value];
        if (effect.when !== undefined && typeof effect.when !== "string") yield [SLOT.when(command, caseName, index), effect.when];
      }
      for (const [field, value] of Object.entries(outcome.set)) yield [SLOT.set(command, caseName, field), value];
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
export function* referenceEvents(input: SpecInput): Generator<ReferenceEvent> {
  yield { name: "Begin", input: {} };
  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    yield { name: "EnterCommand", input: { name } };
    for (const state of behavior.from ?? []) yield { name: "AllowFrom", input: { state } };
    for (const caseName of Object.keys(behavior.when).sort()) {
      const outcome = behavior.when[caseName];
      yield { name: "EnterCase", input: { name: caseName } };
      if (outcome.goTo !== undefined) yield { name: "GoTo", input: { state: outcome.goTo } };
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

// --- 副作用のペイロードの検査（与えられていないフィールド、宣言されていないフィールド、合わない値） ---
// これも、フレームワーク自身の仕様 (packages/cli/self/specs/payload-check.*) から生成したコード (Stage 1) で置き換えられる。
// occurrence は、仕様の中で副作用が現れる順番（0 から）。同じ副作用が何度も現れるので、名前では区別できない
export type PayloadDiagnostic = { code: "missing-field" | "bad-value"; occurrence: number; field: string };

// 副作用が現れる順に、場所と一緒に並べる（コマンド名順、場合の名前順、書かれた順）
export function* effectOccurrences(input: SpecInput): Generator<{ occurrence: number; command: string; caseName: string; effect: SpecEffect }> {
  let occurrence = 0;
  for (const command of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[command];
    for (const caseName of Object.keys(behavior.when).sort()) {
      for (const effect of behavior.when[caseName].effects) yield { occurrence: occurrence++, command, caseName, effect };
    }
  }
}

// 値について分かっていることを、検査に渡すコマンドの列にする。
//   Constant   … 具体的な値（書かれた定数、決定表の列のセル1つ、列挙の要素1つ）
//   Typed      … 型だけが分かっている値（入力、覚えているデータ、問い合わせの答えなどへの参照）
//   Unresolved … どこも指していない参照
export type ValueEvent =
  | { name: "Constant"; input: { kind: "boolean" | "integer" | "number" | "string"; text: string; number: number } }
  | { name: "Typed"; input: { type: "boolean" | "integer" | "number" | "string" } }
  | { name: "Unresolved"; input: {} };
export type PayloadEvent =
  | { name: "EnterEffect" | "DeclaredField" | "GivenField"; input: { name: string } }
  | { name: "LeaveEffect"; input: {} }
  | ValueEvent;

const constantEvent = (value: Constant): ValueEvent =>
  typeof value === "string"
    ? { name: "Constant", input: { kind: "string", text: value, number: 0 } }
    : typeof value === "boolean"
      ? { name: "Constant", input: { kind: "boolean", text: "", number: 0 } }
      : // 数でない数値 (NaN、無限大) は、値として扱わない
        Number.isFinite(value)
        ? { name: "Constant", input: { kind: Number.isInteger(value) ? "integer" : "number", text: "", number: value } }
        : { name: "Unresolved", input: {} };
// フィールドの型の種類。"enum" は、決まった文字列のどれか
export const kindOf = (schema: FieldSchema): "boolean" | "integer" | "number" | "string" | "enum" =>
  isEnum(schema) ? "enum" : isNumberSchema(schema) ? schema.type : schema;

export function* valueEvents(input: SpecInput, command: string, value: SpecValue): Generator<ValueEvent> {
  if (!isReference(value)) return void (yield constantEvent(value));
  const found = typeOf(input, command, value);
  if (found.problem) yield { name: "Unresolved", input: {} };
  // was(...) は真偽値
  else if (found.boolean) yield { name: "Typed", input: { type: "boolean" } };
  // 決定表の列: 値のあるセルを1つずつ（null は「この行では値が無い」）
  else if (found.values) for (const cell of found.values) cell === null || (yield constantEvent(cell));
  // 列挙の型の値: 取り得る要素を1つずつ
  else if (isEnum(found.schema!)) for (const member of found.schema) yield constantEvent(member);
  else yield { name: "Typed", input: { type: kindOf(found.schema!) as "boolean" | "integer" | "number" | "string" } };
}

// 副作用1つをたどって、検査に渡すコマンドの列にする。コマンドの名前と入力は、payload-check の仕様のもの。
// 宣言されたフィールドを先に、続けて、与えられたフィールドと、その値について分かっていること
export function* payloadEvents(input: SpecInput, command: string, effect: SpecEffect): Generator<PayloadEvent> {
  yield { name: "EnterEffect", input: { name: effect.name } };
  for (const field of Object.keys(input.model?.effects[effect.name] ?? {})) yield { name: "DeclaredField", input: { name: field } };
  for (const [field, value] of Object.entries(effect.payload)) {
    yield { name: "GivenField", input: { name: field } };
    yield* valueEvents(input, command, value);
  }
  yield { name: "LeaveEffect", input: {} };
}

// Stage 0: 手書きの判断。フィールド1つにつき、報告は1つまで
export function payloadDiagnostics(input: SpecInput): PayloadDiagnostic[] {
  const model = input.model;
  if (!model) return [];
  const found: PayloadDiagnostic[] = [];
  for (const { occurrence, command, effect } of effectOccurrences(input)) {
    const fields = model.effects[effect.name];
    // 宣言されていない副作用は、名前の検査が報告する。フィールドは見ない
    if (!fields) continue;
    for (const field of Object.keys(fields)) {
      if (!(field in effect.payload)) found.push({ code: "missing-field", occurrence, field });
    }
    for (const [field, value] of Object.entries(effect.payload)) {
      if (!fields[field] || mismatch(input, command, value, fields[field]) !== undefined) found.push({ code: "bad-value", occurrence, field });
    }
  }
  return found;
}

// references / payloads: 名前の検査と、ペイロードの検査の結果。values: 直列化した値（置き場所の名前 → IR の形）。
// 省略時は Stage 0 で判断する。入口 (compile / implement) は、Stage 1 の結果を渡す (stage1.ts)
export function extract(
  input: SpecInput,
  options: { references?: ReferenceDiagnostic[]; payloads?: PayloadDiagnostic[]; values?: Map<string, unknown> } = {},
) {
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, behavior: string, caseName: string, message: string) =>
    diagnostics.push({ severity: "error", code, behavior, case: caseName, message });
  const model = input.model;
  const binding = input.binding;
  // 解釈が無い、または Layer 1 と合わない: 語彙が定まらないので、IR は作れない
  if (input.layer1 && !binding) report("unbound-specification", "", "", "このコンポーネントの解釈 (interpretation) がありません");
  for (const problem of input.problems ?? []) report("bad-interpretation", "", "", problem);
  if (input.stale) {
    report("stale-interpretation", "", "", "解釈を導いたあとで、Layer 1 が変わっています。clp interpret で導き直すか、解釈がいまも正しいことを確かめて clp interpret --accept を実行してください");
  }
  if (!model) return { ir: { irVersion: IR_VERSION, behaviors: [], decisions: {} }, diagnostics };

  const condition = (behavior: string, caseName: string, name: string) => {
    if (binding && name !== "otherwise" && typeof binding.conditions?.[name] !== "function") {
      report("unbound-condition", behavior, caseName, `条件 "${name}" の意味が、解釈の conditions に書かれていません`);
    }
  };

  // 名前の検査は、判断を受け取るだけ。文面（利用者向け）は、ここで付ける
  const references = options.references ?? referenceDiagnostics(input);
  const reported = (code: ReferenceDiagnostic["code"], command: string, caseName: string, subject: string) =>
    references.some((found) => found.code === code && found.command === command && found.caseName === caseName && found.subject === subject);

  // 値の直列化: Stage 1 が書いたものがあれば、それを置く。無ければ手書きで直列化する
  const write = (slot: string, value: SpecValue) => (options.values?.has(slot) ? options.values.get(slot) : serialize(value));

  // ペイロードの検査も、判断を受け取るだけ。「なぜ合わないか」の文面は、ここで付ける
  const payloads = options.payloads ?? payloadDiagnostics(input);
  const flagged = (code: PayloadDiagnostic["code"], occurrence: number, field: string) =>
    payloads.some((found) => found.code === code && found.occurrence === occurrence && found.field === field);
  let occurrence = 0;

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
      if (!query) {
        report("unknown-query", name, "", `asks.${alias}: 問い合わせ "${asked.query}" は queries にありません`);
        continue;
      }
      for (const field of Object.keys(query.input)) {
        if (!(field in asked.input)) report("missing-field", name, "", `asks.${alias}: 問い合わせ ${asked.query} に、引数 "${field}" がありません`);
      }
      for (const [field, value] of Object.entries(asked.input)) {
        const problem = !query.input[field]
          ? `問い合わせ ${asked.query} に、引数 "${field}" はありません`
          : isReference(value) && value.$ref !== "input" && value.$ref !== "data"
            ? "引数に書けるのは、定数か、ref.input / ref.data です"
            : mismatch(input, name, value, query.input[field]);
        if (problem) report("bad-value", name, "", `asks.${alias}.${field}: ${problem}`);
      }
      asks[alias] = { query: asked.query, input: Object.fromEntries(Object.entries(asked.input).map(([field, value]) => [field, write(SLOT.ask(name, alias, field), value)])) };
    }

    const when: Record<string, unknown> = {};
    for (const caseName of Object.keys(behavior.when).sort()) {
      const outcome = behavior.when[caseName];
      condition(name, caseName, caseName);
      if (outcome.goTo !== undefined && reported("unknown-state", name, caseName, outcome.goTo)) {
        report("unknown-state", name, caseName, `goTo の "${outcome.goTo}" は states にありません`);
      }

      const effects = outcome.effects.map((effect, index) => {
        const fields = model.effects[effect.name];
        if (reported("unknown-effect", name, caseName, effect.name)) report("unknown-effect", name, caseName, `副作用 "${effect.name}" は effects にありません`);
        const at = occurrence++;
        for (const field of Object.keys(fields ?? {})) {
          if (flagged("missing-field", at, field)) report("missing-field", name, caseName, `副作用 ${effect.name} に、フィールド "${field}" がありません`);
        }
        for (const [field, value] of Object.entries(effect.payload)) {
          if (!flagged("bad-value", at, field)) continue;
          // 合わないと判断したのは検査。ここでは、その理由を言葉にするだけ
          const why = fields?.[field]
            ? (mismatch(input, name, value, fields[field]) ?? `この値は ${describe(fields[field])} に入りません`)
            : `副作用 ${effect.name} に、フィールド "${field}" はありません`;
          report("bad-value", name, caseName, `${effect.name}.${field}: ${why}`);
        }
        if (typeof effect.when === "string") condition(name, caseName, effect.when);
        else if (effect.when) {
          const problem = mismatch(input, name, effect.when, "boolean");
          if (problem) report("bad-value", name, caseName, `${effect.name} の when: ${problem}`);
        }
        return {
          name: effect.name,
          payload: Object.fromEntries(Object.entries(effect.payload).map(([field, value]) => [field, write(SLOT.payload(name, caseName, index, field), value)])),
          ...(effect.when === undefined ? {} : { when: typeof effect.when === "string" ? effect.when : write(SLOT.when(name, caseName, index), effect.when) }),
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
          ? { set: Object.fromEntries(Object.entries(outcome.set).map(([field, value]) => [field, write(SLOT.set(name, caseName, field), value)])) }
          : {}),
      };
    }
    behaviors.push({
      name,
      ...(behavior.description === undefined ? {} : { description: behavior.description }),
      from: [...(behavior.from ?? model.states)],
      onlyIf: [...(behavior.onlyIf ?? [])],
      ...(Object.keys(asks).length > 0 ? { asks } : {}),
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
