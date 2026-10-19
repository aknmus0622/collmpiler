import { compositionOf, partsOfComposition } from "@clp/core";
import type { FieldSchema } from "@clp/core";
import { describe, isEnum, isStructured } from "./schema.ts";
import { kindOf } from "./extract.ts";
import type { SpecInput, SpecModel } from "./extract.ts";

// 宣言そのものの検査（型、決定表の列、約束、失敗の条件、名前の衝突）。
// 仕様をたどって事実の列を作る糊と、判断（Stage 0、手書き）と、文面に分けてある。
// 判断は、フレームワーク自身の仕様から生成した部品 (Stage 1、self/specs/type-check.*) でも下せる。
// どちらの判断も、同じ事実の列を受け取る（SELF_HOSTING.md §11）

// --- 事実の列 ---
export type DeclaredEvent =
  | { name: "Type"; input: { kind: "enum" | "one-of" | "number" | "other"; members: number; hasMin: boolean; min: number; hasMax: boolean; max: number }; where: { path: string } }
  | { name: "Around"; input: { value: number }; where: { path: string } }
  | { name: "BeginColumn"; input: {}; where: { table: string; column: string } }
  | { name: "Cell"; input: { kind: "number" | "string" | "boolean" | "null" }; where: {} }
  | { name: "EndColumn"; input: {}; where: { table: string; column: string; kinds: string[] } }
  | { name: "Promise"; input: { promise: "fresh" | "increasing"; output: "structured" | "enum" | "boolean" | "string" | "integer" | "number"; takesInput: boolean }; where: { query: string; described: string } }
  | { name: "BeginClaims"; input: {}; where: {} }
  | { name: "Claim"; input: { name: string; owner: "data" | "queries" | "asks" | "parts" | "input"; shared: boolean }; where: {} }
  | { name: "Failure"; input: { declared: boolean; mayFail: boolean; asked: boolean; takesInput: boolean }; where: { behavior: string; caseName: string; sentence: string; failed: string; query: string } };

// 型を書ける所すべて。入れ子の型は、外から順に（親の判断のあとに、中の型）
const typed = (model: SpecModel): [string, FieldSchema][] => [
  ...Object.entries(model.data).map(([name, schema]): [string, FieldSchema] => [`data.${name}`, schema]),
  ...Object.entries(model.commands).flatMap(([command, fields]) => Object.entries(fields).map(([field, schema]): [string, FieldSchema] => [`commands.${command}.input.${field}`, schema])),
  ...Object.entries(model.queries).flatMap(([query, { input: fields, output }]) => [
    ...Object.entries(fields).map(([field, schema]): [string, FieldSchema] => [`queries.${query}.input.${field}`, schema]),
    [`queries.${query}.output`, output] as [string, FieldSchema],
  ]),
  ...Object.entries(model.effects).flatMap(([effect, fields]) => Object.entries(fields).map(([field, schema]): [string, FieldSchema] => [`effects.${effect}.input.${field}`, schema])),
  ...Object.entries(model.calculations ?? {}).map(([name, calculation]): [string, FieldSchema] => [`calculations.${name}.output`, calculation.type]),
  ...Object.entries(model.outputs ?? {}).map(([command, schema]): [string, FieldSchema] => [`commands.${command}.output`, schema]),
];
function* typeEvents(schema: FieldSchema, path: string): Generator<DeclaredEvent> {
  const none = { members: 0, hasMin: false, min: 0, hasMax: false, max: 0 };
  if (isEnum(schema)) return void (yield { name: "Type", input: { ...none, kind: "enum", members: schema.length }, where: { path } });
  if (typeof schema !== "object") return;
  if ("oneOf" in schema) {
    const variants = Object.entries(schema.oneOf);
    yield { name: "Type", input: { ...none, kind: "one-of", members: variants.length }, where: { path } };
    for (const [variant, inner] of variants) yield* typeEvents(inner, `${path}${variant}: `);
    return;
  }
  if ("list" in schema) return void (yield* typeEvents(schema.list, path));
  if ("optional" in schema && !("record" in schema)) return void (yield* typeEvents(schema.optional as FieldSchema, path));
  if ("record" in schema) {
    for (const [field, inner] of Object.entries(schema.record)) yield* typeEvents(inner, `${path}${field}: `);
    return;
  }
  const { min, max, around } = schema as { min?: number; max?: number; around?: readonly number[] };
  yield { name: "Type", input: { kind: "number", members: 0, hasMin: min !== undefined, min: min ?? 0, hasMax: max !== undefined, max: max ?? 0 }, where: { path } };
  for (const value of around ?? []) yield { name: "Around", input: { value }, where: { path } };
}
const cellKind = (cell: unknown): "number" | "string" | "boolean" | "null" =>
  cell === null || cell === undefined ? "null" : typeof cell === "number" ? "number" : typeof cell === "boolean" ? "boolean" : "string";

// IR を作るときに見る宣言（型、決定表の列、約束）。extract の診断の順に並べる
export function* declaredEvents(input: SpecInput): Generator<DeclaredEvent> {
  const model = input.model!;
  for (const [where, schema] of typed(model)) yield* typeEvents(schema, `${where}: `);
  for (const [table, rows] of Object.entries(input.decisions)) {
    for (const column of Object.keys(rows.otherwise ?? {})) {
      const cells = Object.values(rows).map((row) => row[column]);
      yield { name: "BeginColumn", input: {}, where: { table, column } };
      for (const cell of cells) yield { name: "Cell", input: { kind: cellKind(cell) }, where: {} };
      yield { name: "EndColumn", input: {}, where: { table, column, kinds: [...new Set(cells.filter((cell) => cell !== null && cell !== undefined).map((cell) => typeof cell))] } };
    }
  }
  for (const [query, declared] of Object.entries(model.queries)) {
    if (declared.promise === undefined) continue;
    const output = isStructured(declared.output) ? "structured" : kindOf(declared.output);
    yield { name: "Promise", input: { promise: declared.promise, output, takesInput: Object.keys(declared.input).length > 0 }, where: { query, described: describe(declared.output) } };
  }
}

// 名前を主張するもの（loader の名前の衝突の検査）。条件と計算からは、同じ階層の名前に見えるもの
export function* claimEvents(model: SpecModel, asked: string[], parts: string[]): Generator<DeclaredEvent> {
  yield { name: "BeginClaims", input: {}, where: {} };
  for (const name of Object.keys(model.data)) yield { name: "Claim", input: { name, owner: "data", shared: false }, where: {} };
  for (const [name, query] of Object.entries(model.queries)) if (Object.keys(query.input).length === 0) yield { name: "Claim", input: { name, owner: "queries", shared: false }, where: {} };
  for (const name of asked) yield { name: "Claim", input: { name, owner: "asks", shared: true }, where: {} };
  for (const name of parts) yield { name: "Claim", input: { name, owner: "parts", shared: false }, where: {} };
  for (const fields of Object.values(model.commands)) for (const name of Object.keys(fields)) yield { name: "Claim", input: { name, owner: "input", shared: true }, where: {} };
}

// 失敗の条件 (W8) が使われる所すべて（コマンドの onlyIf と場合と副作用の条件、決定表の行。組み合わせの中も）
export function* failureEvents(input: SpecInput): Generator<DeclaredEvent> {
  const model = input.model!;
  function* visit(behavior: string, caseName: string, sentence: string): Generator<DeclaredEvent> {
    const composition = compositionOf(sentence);
    if (!composition) return;
    const failure = failureEventFor(input, behavior, caseName, sentence);
    if (failure) yield failure;
    for (const part of partsOfComposition(composition)) yield* visit(behavior, caseName, part);
  }
  void model;
  for (const name of Object.keys(input.behaviors).sort()) {
    const behavior = input.behaviors[name];
    for (const sentence of behavior.onlyIf ?? []) yield* visit(name, "", sentence);
    for (const caseName of Object.keys(behavior.when).sort()) {
      yield* visit(name, caseName, caseName);
      for (const effect of behavior.when[caseName].effects) if (typeof effect.when === "string") yield* visit(name, caseName, effect.when);
    }
  }
  for (const table of Object.values(input.decisions)) for (const row of Object.keys(table)) yield* visit("", "", row);
}

// 失敗の条件1つについての事実（失敗の条件でなければ undefined）
export function failureEventFor(input: SpecInput, behavior: string, caseName: string, sentence: string): DeclaredEvent | undefined {
  const composition = compositionOf(sentence);
  if (!composition || !("failed" in composition)) return undefined;
  const asked = input.behaviors[behavior]?.asks?.[composition.failed];
  const query = input.model!.queries[asked?.query ?? composition.failed];
  return {
    name: "Failure",
    input: { declared: query !== undefined, mayFail: query?.mayFail === true, asked: asked !== undefined, takesInput: Object.keys(query?.input ?? {}).length > 0 },
    where: { behavior, caseName, sentence, failed: composition.failed, query: asked?.query ?? composition.failed },
  };
}
// 失敗の条件の判断を引くための鍵（どのコマンドの、どの場合の、どの文か）
export const failureKey = (behavior: string, caseName: string, sentence: string) => `${behavior}\u0000${caseName}\u0000${sentence}`;

// --- 判断 (Stage 0、手書き) ---
export type DeclaredCode =
  | "empty-enum" | "empty-one-of" | "min-above-max" | "around-outside" | "mixed-column" | "promise-kind" | "promise-input"
  | "failure-unknown" | "failure-not-may-fail" | "failure-not-asked" | "name-collision";
export type DeclaredReport = { code: DeclaredCode; owner: string; event: DeclaredEvent };

export function declaredReportsStage0(events: Iterable<DeclaredEvent>): DeclaredReport[] {
  const found: DeclaredReport[] = [];
  const report = (code: DeclaredCode, event: DeclaredEvent, owner = "") => found.push({ code, owner, event });
  let bounds = { hasMin: false, min: 0, hasMax: false, max: 0 };
  let kinds: string[] = [];
  let claims = new Map<string, string>();
  for (const event of events) {
    switch (event.name) {
      case "Type": {
        const { kind, members, hasMin, min, hasMax, max } = event.input;
        if (kind === "enum" && members === 0) report("empty-enum", event);
        if (kind === "one-of" && members === 0) report("empty-one-of", event);
        if (kind === "number" && hasMin && hasMax && min > max) report("min-above-max", event);
        bounds = { hasMin, min, hasMax, max };
        break;
      }
      case "Around":
        if ((bounds.hasMin && event.input.value < bounds.min) || (bounds.hasMax && event.input.value > bounds.max)) report("around-outside", event);
        break;
      case "BeginColumn":
        kinds = [];
        break;
      case "Cell":
        if (event.input.kind !== "null" && !kinds.includes(event.input.kind)) kinds.push(event.input.kind);
        break;
      case "EndColumn":
        if (kinds.length > 1) report("mixed-column", event);
        break;
      case "Promise": {
        const { promise, output } = event.input;
        if (output === "structured" || output === "enum" || output === "boolean" || (promise === "increasing" && output === "string") || (promise === "fresh" && output === "number")) report("promise-kind", event);
        if (event.input.takesInput) report("promise-input", event);
        break;
      }
      case "Failure": {
        const { declared, mayFail, asked, takesInput } = event.input;
        if (!declared) report("failure-unknown", event);
        else if (!mayFail) report("failure-not-may-fail", event);
        else if (!asked && takesInput) report("failure-not-asked", event);
        break;
      }
      case "BeginClaims":
        claims = new Map([["status", "reserved"]]);
        break;
      case "Claim": {
        const { name, owner, shared } = event.input;
        const taken = claims.get(name);
        if (taken !== undefined && !(shared && taken === owner)) report("name-collision", event, taken);
        else claims.set(name, owner);
        break;
      }
    }
  }
  return found;
}

// --- 文面 ---
const OWNER: Record<string, string> = { reserved: "予約語", data: "data", queries: "queries", asks: "asks", parts: "parts", input: "input" };
export function declaredMessage({ code, owner, event }: DeclaredReport): { code: string; behavior: string; caseName: string; message: string } {
  const at = (diagnostic: string, message: string, behavior = "", caseName = "") => ({ code: diagnostic, behavior, caseName, message });
  switch (event.name) {
    case "Type":
      if (code === "empty-enum") return at("bad-type", `${event.where.path}列挙が空です。取り得る値を1つ以上書いてください`);
      if (code === "empty-one-of") return at("bad-type", `${event.where.path}oneOf に形がありません。形を1つ以上書いてください`);
      return at("bad-type", `${event.where.path}最小値 (min: ${event.input.min}) が、最大値 (max: ${event.input.max}) より大きいので、取り得る値がありません`);
    case "Around":
      return at("bad-type", `${event.where.path}しきい値 (around) の ${event.input.value} が、範囲の外です`);
    case "EndColumn":
      return at("bad-decision", `決定表 ${event.where.table} の列 ${event.where.column}: 行によって値の種類が違います (${event.where.kinds.join(" と ")})。どの行も同じ種類の値にしてください`);
    case "Promise":
      return code === "promise-kind"
        ? at("bad-promise", `問い合わせ ${event.where.query} の ${event.input.promise}(): ${event.where.described} には付けられません（fresh は文字列か整数、increasing は整数か数値）`)
        : at("bad-promise", `問い合わせ ${event.where.query} の ${event.input.promise}(): 引数つきの問い合わせには、まだ付けられません`);
    case "Failure": {
      const { behavior, caseName, sentence, failed, query } = event.where;
      if (code === "failure-unknown") return at("unknown-query", `${sentence}: "${failed}" は、queries にも、このコマンドの asks にもありません`, behavior, caseName);
      if (code === "failure-not-may-fail") return at("bad-failure", `${sentence}: 問い合わせ ${query} は失敗しません。失敗することがあるなら、mayFail: true と宣言してください`, behavior, caseName);
      return at("bad-failure", `${sentence}: 問い合わせ ${failed} には引数があります。asks で尋ねたもの (.as で付けた名前) の failed を使ってください`, behavior, caseName);
    }
    case "Claim":
      return at("name-collision", `"${event.input.name}" が重複しています (${OWNER[owner] ?? owner} と ${OWNER[event.input.owner]})。条件と計算からは同じ名前に見えるので、どちらかの名前を変えてください`);
    default:
      return at(code, "");
  }
}
