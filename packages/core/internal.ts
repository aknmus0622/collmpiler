// 内部の形: 仕様を読み込む側 (packages/cli) が扱う、Layer 1 の値と、解釈の structure / meanings。
//
// 仕様を書くための語彙は index.ts にある（節と、その木）。書かれた木は、ここで定める形に変換される。
// ここに残っているのは、その形の型、Layer 1 に解釈を重ねる処理 (resolveComponent)、決定表、参照、
// そして意味の関数を評価する処理である。
//
// 型は実行時に消えるため、すべて「値」として宣言する。値として残るので IR に出力でき、PBT の入力生成にも使える。

import { overlayCodesStage0 } from "./overlay.ts";
import type { OverlayCode, OverlayFact } from "./overlay.ts";

// --- フィールドの型 ---
// 数値の制約。around は、その前後を PBT が重点的に生成するしきい値
export type NumberSchema = {
  readonly type: "integer" | "number";
  readonly min?: number;
  readonly max?: number;
  readonly around?: readonly number[];
  readonly among?: Among;
};
// 文字列に、生成の手がかりを付けたもの。examples: 試す例（形式の決まった文字列）
export type StringSchema = { readonly type: "string"; readonly examples?: readonly string[]; readonly among?: Among };
// 入力の選び方: いま覚えているデータ（並び）の要素から選ぶ。field があれば、要素のそのフィールドから
export type Among = { readonly data: string; readonly field?: string };
// 構造を持つ値: 並び、フィールドの組（optional に挙げたフィールドは無いことがある）、無いことがある値。無いときの値は null
export type FieldSchema =
  | "boolean"
  | "number"
  | "integer"
  | "string"
  // 何でも入る値（null、真偽値、数、文字列、並び、フィールドの組）。中身では判断しない部品が運ぶ
  | "value"
  // 列挙: 取り得る値（文字列か数）
  | readonly (string | number)[]
  | NumberSchema
  | StringSchema
  | { readonly list: FieldSchema }
  | { readonly record: Fields; readonly optional?: readonly string[] }
  | { readonly optional: FieldSchema }
  // どれか1つの形。値は、キーが1つのフィールドの組（{ constant: ... }）
  | { readonly oneOf: Fields };
export type Fields = Record<string, FieldSchema>;

// --- 型エラーの説明 ---
// 文字列リテラルと交差させても never に潰れないよう、オブジェクト型にしている（文面がエラーに残る）
type Problem<Message extends string> = { readonly 誤り: Message };
type KnownKeys<T, Allowed> = {
  [K in keyof T]: K extends Allowed ? unknown : Problem<`"${K & string}" というキーはありません (書き間違い?)`>;
};

// --- 添付資料 ---
// 実装を LLM に依頼するときに添付する資料。file / dir / text で包んで assets に並べる。
//   file("docs/architecture.md")   … ファイル（コンポーネントのファイルからの相対パス）
//   dir("docs/conventions")        … ディレクトリの中のファイルすべて
//   text("Adapters are named *Gateway.")  … 短い文言。依頼文の中に直接載る
// 第2引数の phases で、渡す段階を指定できる。省略すると設計と実装の段階に渡る。
// 配線の段階 ("wiring") は仕様を見ないことに意味があるので、渡すときは明示する。
// 業務ルール（仕様の中身）を書いてはいけない
export type AssetPhase = "design" | "wiring" | "implementation";
export type AssetOptions = { readonly phases?: readonly AssetPhase[] };
export type AssetDeclaration =
  | { readonly kind: "file"; readonly path: string; readonly phases?: readonly AssetPhase[] }
  | { readonly kind: "dir"; readonly path: string; readonly phases?: readonly AssetPhase[] }
  | { readonly kind: "text"; readonly text: string; readonly phases?: readonly AssetPhase[] };

export const file = (path: string, options: AssetOptions = {}): AssetDeclaration => ({ kind: "file", path, ...options });
export const dir = (path: string, options: AssetOptions = {}): AssetDeclaration => ({ kind: "dir", path, ...options });
export const text = (content: string, options: AssetOptions = {}): AssetDeclaration => ({ kind: "text", text: content, ...options });

// --- 決定表 ---
// 条件（自然言語）から値を選ぶ表。どの条件にも当たらないときの otherwise が必須で、全行が同じ列を持つ。
// セルに書けるのは値だけ。副作用や計算は書かない（表が決めるのは率や区分といったパラメータ）。
// その行では使われない列には、null を書く
export type Constant = string | number | boolean;
// セルに null を書くと「この行では、この列の値は無い」という意味になる（使われない値を埋めずに済む）。
// 値の無いセルが実際に使われる仕様は誤りで、仕様の事前検査が見つける
export type Cell = Constant | null;
export type Table = Record<string, Record<string, Cell>>;
type Columns<T> = T extends { otherwise: infer Row } ? keyof Row : never;
type CheckTable<T> = T & { otherwise: unknown } & {
  [Row in keyof T]: { [C in Columns<T>]: Cell } & KnownKeys<T[Row], Columns<T>>;
};

export function decisionTable<const T extends Table>(table: CheckTable<T>): T {
  return table as T;
}

// --- 参照 ---
// 構造の中で、「どこから来る値か」を指す。関数だが、返すのは純粋なデータ
export type Ref<Kind extends string, Path> = { readonly $ref: Kind; readonly path: Path };

// 参照は ref.input("x") のように、ref からたどって書く。名前は、指す先の宣言の見出しと同じ
export const ref = {
  // そのコマンドの入力
  input: <const N extends string>(name: N): Ref<"input", N> => ({ $ref: "input", path: name }),
  // 覚えているデータ
  data: <const N extends string>(name: N): Ref<"data", N> => ({ $ref: "data", path: name }),
  // 問い合わせの答え
  query: <const N extends string>(name: N): Ref<"query", N> => ({ $ref: "query", path: name }),
  // 決定表の、当たった行の列の値
  decision: <const D extends string, const C extends string>(decision: D, column: C): Ref<"decision", readonly [D, C]> => ({
    $ref: "decision",
    path: [decision, column],
  }),
  // 計算の結果
  calculation: <const N extends string>(name: N): Ref<"calculation", N> => ({ $ref: "calculation", path: name }),
  // コマンドの実行前の状態が、挙げた状態のどれかであること（真偽値）
  was: <const S extends readonly string[]>(...states: S): Ref<"was", S> => ({ $ref: "was", path: states }),
};

// --- Layer 1 の値 ---
// 文だけの項目は { $description }、部品のある項目は { $fragment }（部品が決める構造）で持つ
export type Description = { readonly $description: string };
export const isDescription = (value: unknown): value is Description =>
  typeof value === "object" && value !== null && "$description" in value;

// responds: コマンドが返す値。値1つ（定数か参照）か、{ フィールド: 値 }
// 遷移先: 状態の名前か、決定表の列の参照（その行の値が、状態の名前） (W2)
export type GoTo = string | { readonly $ref: string; readonly path: unknown };
// Layer 1 も、覚えることと副作用を書ける (W11)。解釈の分は、そのあとに足される
export type OutcomeShape = {
  goTo?: GoTo;
  does?: string;
  responds?: unknown;
  effects?: readonly Record<string, unknown>[];
  set?: Record<string, unknown>;
  adds?: readonly Adds[];
  removes?: readonly Removes[];
  // 何も起きないことの明示 (DSL.md §16.7)
  nothing?: true;
};
// コマンドが返すものの形。どの型でも書ける
export type OutputSchema = FieldSchema;
// 尋ねること: 答えに付ける名前 → { 問い合わせの名前: 引数 }
export type Asks = Record<string, Record<string, Record<string, unknown>>>;
// 含む部品のコマンドを呼ぶこと: どの部品の、どのコマンドを、どの入力で
// key: 多数ある部品のうち、どれを呼ぶか（値か参照）
export type Call = { part: string; command: string; input: Record<string, unknown>; key?: unknown };
// 含む部品: その部品と、多数あるならキーの名前
export type PartDeclaration = { component: object; by?: string };
// 多数ある部品を作る（キーと、子のデータのはじめの値）、消す
export type Adds = { part: string; key: unknown; data: Record<string, unknown> };
export type Removes = { part: string; key: unknown };
// 部品が決める構造。どの部品をどこに書けるかは、項目の種類で決まる（読み込みのあとで検査する）
export type CommandShape = {
  description?: string;
  input?: Fields;
  // 入力の生成の指示（フィールド → among / examples / around を持つ型）。入力の型に重ねて、残さない
  hints?: Fields;
  // 問い合わせと計算では値1つの型。コマンドでは、フィールドの組も書ける
  output?: OutputSchema;
  type?: FieldSchema;
  // 覚えるデータの、はじめの値（値を包んで持つ。null も値として書けるように）
  initially?: { readonly value: unknown };
  // 問い合わせの約束
  promise?: "fresh" | "increasing";
  // 依存が失敗することがある (W8)
  mayFail?: true;
  from?: readonly string[];
  onlyIf?: readonly string[];
  asks?: Asks;
  calls?: Record<string, Call>;
  route?: string;
  goTo?: GoTo;
  does?: string;
  responds?: unknown;
  when?: Record<string, OutcomeShape>;
};
export type Fragment = { readonly $fragment: CommandShape };
export const isFragment = (value: unknown): value is Fragment =>
  typeof value === "object" && value !== null && "$fragment" in value;

const shapeOf = (part: unknown): CommandShape =>
  isDescription(part) ? { description: part.$description } : isFragment(part) ? part.$fragment : {};

type Entry = Description | Fragment;
export type Layer1 = {
  description?: string;
  assets?: readonly AssetDeclaration[];
  states?: readonly string[] | Record<string, Description> | Description;
  init?: string;
  data?: Record<string, Entry> | Description;
  queries?: Record<string, Entry> | Description;
  effects?: Record<string, Entry> | Description;
  decisions?: Record<string, Table>;
  calculations?: Record<string, Entry> | Description;
  invariants?: readonly string[];
  commands?: Record<string, Entry> | Description;
  // 含む部品（名前 → その部品と、多数あるならキーの名前）
  parts?: Record<string, PartDeclaration>;
  // 再起動を越えて残る (W7): 自分で (true) か、保存先の部品を通して
  durable?: Durable;
};
export type Durable = true | { store: object };

// 構造として書かれた値（文や省略なら never）
// 状態を持たない部品の、ただ1つの状態の名前
export const STATELESS = "READY";
export const COMPONENT = Symbol.for("clp.component");
export const BINDING = Symbol.for("clp.binding");

// --- 実行時に扱う形 ---
// Layer 1 に解釈を重ねて、すべてが構造になったコンポーネント
export type Outcome = { goTo?: GoTo; does?: string; responds?: unknown; nothing?: true };
// 尋ねること: どの問い合わせを、どの引数で
export type Asked = { query: string; input: Record<string, unknown> };
export type CommandDeclaration = {
  description?: string;
  input?: Fields;
  // 返すものの形。無ければ、何も返さない
  output?: OutputSchema;
  // このコマンドを実行できる状態。省略時は全状態
  from?: readonly string[];
  // 事前条件（条件の文）。満たさない場合の挙動は仕様の対象外
  onlyIf?: readonly string[];
  // 尋ねること。答えに付ける名前 → 問い合わせと引数
  asks?: Record<string, Asked>;
  // 含む部品のコマンドを呼ぶこと（書いた順）。答えに付ける名前 → 部品、コマンド、入力
  calls?: Record<string, Call>;
  // 経路（"POST /todos"）。外からどう届くかの約束
  route?: string;
  // 条件ごとの結果。条件で分かれないコマンドは otherwise だけ
  when: Record<string, Outcome>;
};
// promise: 依存が守る約束。fresh は「一度返した値は、二度と返さない」、increasing は「前の答えより小さくならない」
// mayFail: 依存が失敗することがある（代役は、ときどき例外を投げる）
export type QueryDeclaration = { input: Fields; output: FieldSchema; promise?: "fresh" | "increasing"; mayFail?: true };
export type Declaration = {
  // 全体と、項目ごとの説明（Layer 1 が文で書いたもの。キーは "component"、"queries"、"queries.isMonthEnd" など）
  descriptions: Record<string, string>;
  assets?: readonly AssetDeclaration[];
  states: readonly string[];
  // 終わりの状態（宣言したときだけ）
  finals?: readonly string[];
  init: string;
  data: Fields;
  // 覚えるデータの、はじめの値（宣言したものだけ。無ければ未設定）
  initial?: Record<string, unknown>;
  queries: Record<string, QueryDeclaration>;
  effects: Record<string, Fields>;
  decisions: Record<string, Table>;
  calculations: Record<string, { is: string; type: FieldSchema }>;
  invariants: readonly string[];
  commands: Record<string, CommandDeclaration>;
  // 含む部品（名前 → Layer 1 の component(...) の値と、多数あるならキーの名前）
  parts?: Record<string, PartDeclaration>;
  durable?: Durable;
};
export type Structure = { effects?: readonly Record<string, unknown>[]; set?: Record<string, unknown>; adds?: readonly Adds[]; removes?: readonly Removes[] };
export type BoundSpecification = {
  // Layer 1 のコンポーネント（component(...) が返した値）
  source: object;
  component: Declaration;
  // コマンド名 → 条件 → 構造
  commands: Record<string, Record<string, Structure>>;
  conditions: Record<string, (state: any) => boolean>;
  // 葉の検査で見つかった書き残し（道筋つき。DSL.md §16.7）
  incomplete?: string[];
  calculations?: Record<string, (state: any) => unknown>;
  invariants?: Record<string, (state: any) => boolean>;
  // Layer 1 と解釈が合わない点（Layer 1 が構造として書いたものの書き換え、足りない構造など）
  problems: string[];
};

type OutcomeStructure = Outcome & Structure;
type CommandStructure = OutcomeStructure & {
  description?: string;
  input?: Fields;
  hints?: Fields;
  output?: OutputSchema;
  from?: readonly string[];
  onlyIf?: readonly string[];
  asks?: Asks;
  calls?: Record<string, Call>;
  route?: string;
  when?: Record<string, OutcomeStructure>;
};
type EntryStructure = Record<string, unknown>;
type StructureValue = {
  states?: readonly string[];
  finals?: readonly string[];
  init?: string;
  data?: Record<string, EntryStructure>;
  queries?: Record<string, EntryStructure>;
  effects?: Record<string, EntryStructure>;
  decisions?: Record<string, Table>;
  calculations?: Record<string, EntryStructure>;
  invariants?: readonly string[];
  commands?: Record<string, CommandStructure>;
};

const OUTCOME_KEYS = ["goTo", "does", "responds", "effects", "set", "adds", "removes"] as const;
const COMMAND_KEYS = ["description", "input", "hints", "output", "route", "from", "onlyIf", "asks", "calls", "when", ...OUTCOME_KEYS] as const;
// 入力の生成の指示に書ける設定（合否に関わらない助言だけ）
const HINT_SETTINGS = ["among", "examples", "around"] as const;
const STRUCTURE_KEYS = ["states", "finals", "init", "data", "queries", "effects", "decisions", "calculations", "invariants", "commands"] as const;
// 重ね合わせの規則。種類の定義 (packages/core/index.ts の KINDS) から作って渡す。
// parts: まとまりごとの、項目に書ける部品。closed: Layer 1 が項目を並べたら、解釈は項目を足せない
export type MergeRules = {
  parts: Record<"data" | "queries" | "effects" | "calculations", readonly string[]>;
  closed: Record<"data" | "queries" | "effects" | "calculations" | "commands", boolean>;
  commandParts: readonly string[];
};
const DEFAULT_RULES: MergeRules = {
  parts: {
    data: ["description", "type", "initially"],
    queries: ["description", "input", "output", "promise", "mayFail"],
    effects: ["description", "input"],
    calculations: ["description", "output"],
  },
  closed: { data: true, queries: true, effects: true, calculations: false, commands: true },
  commandParts: ["description", "input", "output", "route", "from", "onlyIf", "asks", "calls", "goTo", "does", "responds", "effects", "set", "adds", "removes", "nothing", "when"],
};

// 重ねたあとの形（葉の検査が読む。DSL.md §16.7）
export type MergedView = {
  // 文だけで書かれたまとまり（Layer 1）
  prose: string[];
  // 項目: まとまり → 名前 → 重ねた部品
  entries: Record<"data" | "queries" | "effects" | "calculations", Record<string, Record<string, unknown>>>;
  // 状態の宣言があるか、状態を持たない部品か
  states: "given" | "missing" | "stateless";
  init: boolean;
  // コマンド: 文だけのコマンドか、場合ごとに、文で起きることが言われたか・何が書かれたか
  commands: Record<string, { prose: boolean; cases: Record<string, { described: boolean; filled: string[] }> }>;
};

// 重ね合わせで確かめた事実と、問題だったときの言葉 (N12g)
export type OverlayCheck = { fact: OverlayFact; messages: Partial<Record<OverlayCode, string>> };

// Layer 1 に解釈の構造を重ねる。Layer 1 が構造として書いたものは、解釈では書き換えられない。
// 合わない点は problems に集める（読み込みの時点では投げない。報告は IR を作るときに行う）
export function resolveComponent(
  layer1: object,
  written: object = {},
  rules: MergeRules = DEFAULT_RULES,
): { declaration: Declaration; commands: Record<string, Record<string, Structure>>; problems: string[]; overlay: OverlayCheck[]; view: MergedView } {
  const base = layer1 as Layer1;
  const view: MergedView = { prose: [], entries: { data: {}, queries: {}, effects: {}, calculations: {} }, states: "given", init: false, commands: {} };
  const structure = written as StructureValue;
  const problems: string[] = [];
  // 確かめた事実の1つずつと、問題だったときの言葉。読み込む側は、同じ事実を Stage 1 で判断し直せる (N12g)
  const overlay: OverlayCheck[] = [];
  const found = (fact: OverlayFact, messages: Partial<Record<OverlayCode, string>>) => {
    overlay.push({ fact, messages });
    for (const code of overlayCodesStage0(fact)) problems.push(messages[code] ?? code);
  };
  const descriptions: Record<string, string> = {};
  if (base.description !== undefined) descriptions.component = base.description;

  for (const key of Object.keys(structure)) {
    found({ kind: "key", known: (STRUCTURE_KEYS as readonly string[]).includes(key) }, { "unknown-key": `解釈の structure に "${key}" というキーはありません` });
  }

  // 状態: 配列か、{ 名前: 説明 }
  let states: readonly string[] | undefined;
  if (isDescription(base.states)) descriptions.states = base.states.$description;
  else if (Array.isArray(base.states)) states = base.states as readonly string[];
  else if (base.states !== undefined) {
    states = Object.keys(base.states);
    for (const [name, text] of Object.entries(base.states as Record<string, Description>)) {
      if (isDescription(text)) descriptions[`states.${name}`] = text.$description;
      found({ kind: "state", described: isDescription(text) }, { undescribed: `states の "${name}" には、description(...) を書いてください` });
    }
  }
  found({ kind: "slot", known: true, layer1: states !== undefined, interpretation: structure.states !== undefined }, { conflict: "states: Layer 1 に構造として書かれているので、解釈では書けません" });
  states = states ?? structure.states;
  found({ kind: "slot", known: true, layer1: base.init !== undefined, interpretation: structure.init !== undefined }, { conflict: "init: Layer 1 に書かれているので、解釈では書けません" });
  let init = base.init ?? structure.init;
  // 状態も初期状態も、どこにも書かれていない: 状態を持たない部品。内部では、1つだけの状態を持つものとして扱う
  if (states === undefined && init === undefined && !isDescription(base.states)) {
    states = [STATELESS];
    init = STATELESS;
    view.states = "stateless";
  }
  // 状態と初期状態が足りないことは、葉の検査が報告する
  if (states === undefined) view.states = "missing";
  view.init = init !== undefined;
  for (const key of ["states", "data", "queries", "effects", "calculations", "commands"] as const) if (isDescription(base[key])) view.prose.push(key);

  // 語彙のまとまり: 項目ごとに、Layer 1 の部品に、解釈の足りない分を重ねる
  const entries = (key: keyof MergeRules["parts"]): Record<string, CommandShape> => {
    const parts = rules.parts[key];
    const additive = !rules.closed[key];
    const given = base[key];
    if (isDescription(given)) descriptions[key] = given.$description;
    const listed = given === undefined || isDescription(given) ? undefined : given;
    const added = structure[key] ?? {};
    const names = listed ? [...Object.keys(listed), ...(additive ? Object.keys(added).filter((name) => !(name in listed)) : [])] : Object.keys(added);
    if (listed) {
      for (const name of Object.keys(added)) {
        found({ kind: "entry", listed: true, closed: !additive, inLayer1: name in listed }, { closed: `${key}.${name}: Layer 1 にありません（Layer 1 が項目を並べているので、解釈では足せません）` });
      }
    }
    const result: Record<string, CommandShape> = {};
    for (const name of names) {
      const left = shapeOf(listed?.[name]) as Record<string, unknown>;
      // 解釈では、計算の文は is と書く
      const { is, ...rest } = (added[name] ?? {}) as Record<string, unknown>;
      const right: Record<string, unknown> = key === "calculations" && is !== undefined ? { ...rest, description: is } : added[name] ?? {};
      for (const part of Object.keys(left)) {
        found({ kind: "key", known: (parts as readonly string[]).includes(part) }, { "unknown-key": `${key}.${name}: ここには ${part === "type" ? "typed" : part} を書けません` });
      }
      for (const part of Object.keys(right)) {
        found(
          { kind: "slot", known: (parts as readonly string[]).includes(part), layer1: left[part] !== undefined, interpretation: true },
          { "unknown-key": `${key}.${name}: 解釈に "${part}" というキーは書けません`, conflict: `${key}.${name}.${part}: Layer 1 に書かれているので、解釈では書けません` },
        );
      }
      const merged = { ...right, ...left } as CommandShape & Record<string, unknown>;
      // 足りない部品は、葉の検査が報告する
      view.entries[key][name] = merged;
      if (merged.description !== undefined && key !== "calculations") descriptions[`${key}.${name}`] = merged.description;
      result[name] = merged;
    }
    return result;
  };
  const remembered = entries("data");
  const data = Object.fromEntries(Object.entries(remembered).map(([name, entry]) => [name, entry.type ?? "string"]));
  const initial = Object.fromEntries(Object.entries(remembered).flatMap(([name, entry]) => (entry.initially === undefined ? [] : [[name, entry.initially.value]])));
  const queries = Object.fromEntries(
    Object.entries(entries("queries")).map(([name, entry]) => [
      name,
      {
        input: entry.input ?? {},
        output: (entry.output ?? "boolean") as FieldSchema,
        ...(entry.promise === undefined ? {} : { promise: entry.promise }),
        ...(entry.mayFail === true ? { mayFail: true as const } : {}),
      },
    ]),
  );
  const effects = Object.fromEntries(Object.entries(entries("effects")).map(([name, entry]) => [name, entry.input ?? {}]));
  const calculations = Object.fromEntries(
    Object.entries(entries("calculations")).map(([name, entry]) => [name, { is: entry.description ?? "", type: (entry.output ?? "string") as FieldSchema }]),
  );
  found({ kind: "slot", known: true, layer1: base.decisions !== undefined, interpretation: structure.decisions !== undefined }, { conflict: "decisions: Layer 1 に書かれているので、解釈では書けません" });

  // コマンド
  const commands: Declaration["commands"] = {};
  const structures: Record<string, Record<string, Structure>> = {};
  const given = base.commands;
  if (isDescription(given)) descriptions.commands = given.$description;
  const sketched = given === undefined || isDescription(given) ? undefined : given;
  const refined = structure.commands ?? {};
  if (sketched) {
    for (const name of Object.keys(refined)) {
      found({ kind: "entry", listed: true, closed: rules.closed.commands, inLayer1: name in sketched }, { closed: `commands.${name}: Layer 1 にありません（Layer 1 がコマンドを並べているので、解釈では足せません）` });
    }
  }
  const names = sketched ? [...Object.keys(sketched), ...(rules.closed.commands ? [] : Object.keys(refined).filter((name) => !(name in sketched)))] : Object.keys(refined);
  for (const name of names) {
    const left = shapeOf(sketched?.[name]);
    for (const part of Object.keys(left)) {
      found({ kind: "key", known: rules.commandParts.includes(part) }, { "unknown-key": `commands.${name}: ここには ${part === "type" ? "typed" : part} を書けません` });
    }
    // 解釈が触れなかったコマンドは、何も足さない（単一化）
    const right = refined[name] ?? {};
    const prose = isDescription(sketched?.[name]) || (sketched === undefined && isDescription(given));
    view.commands[name] = { prose, cases: {} };
    for (const key of Object.keys(right)) {
      found({ kind: "key", known: (COMMAND_KEYS as readonly string[]).includes(key) || key === "nothing" }, { "unknown-key": `commands.${name}: 解釈に "${key}" というキーは書けません` });
    }
    for (const key of ["input", "output", "route", "from", "onlyIf", "asks", "calls", "description"] as const) {
      found({ kind: "slot", known: true, layer1: left[key] !== undefined, interpretation: right[key] !== undefined }, { conflict: `commands.${name}.${key}: Layer 1 に書かれているので、解釈では書けません` });
    }
    const merge = (where: string, a: OutcomeShape, b: OutcomeStructure, caseName = "otherwise"): [Outcome, Structure] => {
      for (const key of ["goTo", "does", "responds", "nothing"] as const) {
        found({ kind: "slot", known: true, layer1: a[key] !== undefined, interpretation: b[key] !== undefined }, { conflict: `${where}.${key}: Layer 1 に書かれているので、解釈では書けません` });
      }
      const goTo = a.goTo ?? b.goTo;
      const does = a.does ?? b.does;
      const responds = a.responds !== undefined ? a.responds : b.responds;
      const nothing = a.nothing ?? b.nothing;
      // 覚えること: 同じデータを両方が覚えるなら、Layer 1 が勝つ（解釈は書き換えられない）
      for (const field of Object.keys(b.set ?? {})) {
        found({ kind: "slot", known: true, layer1: a.set !== undefined && field in a.set, interpretation: true }, { conflict: `${where}.set.${field}: Layer 1 に書かれているので、解釈では書けません` });
      }
      // 副作用と、部品を作る・消すことは、Layer 1 の分が先、解釈の分があと
      const joined = <T>(first: readonly T[] | undefined, second: readonly T[] | undefined) =>
        first === undefined && second === undefined ? undefined : [...(first ?? []), ...(second ?? [])];
      const effects = joined(a.effects, b.effects);
      const set = a.set === undefined && b.set === undefined ? undefined : { ...(b.set ?? {}), ...(a.set ?? {}) };
      const adds = joined(a.adds, b.adds);
      const removes = joined(a.removes, b.removes);
      // 葉の検査のために、文で起きることが言われたか、何が書かれたかを残す
      view.commands[name].cases[caseName] = {
        described: does !== undefined || prose,
        filled: [
          ...(goTo === undefined ? [] : ["goTo"]),
          ...(responds === undefined ? [] : ["responds"]),
          ...(effects?.length ? ["emits"] : []),
          ...(set && Object.keys(set).length > 0 ? ["set"] : []),
          ...(adds?.length ? ["adds"] : []),
          ...(removes?.length ? ["removes"] : []),
          ...(nothing ? ["nothing"] : []),
        ],
      };
      return [
        { ...(goTo === undefined ? {} : { goTo }), ...(does === undefined ? {} : { does }), ...(responds === undefined ? {} : { responds }), ...(nothing ? { nothing } : {}) },
        {
          ...(effects === undefined ? {} : { effects }),
          ...(set === undefined ? {} : { set }),
          ...(adds === undefined ? {} : { adds }),
          ...(removes === undefined ? {} : { removes }),
        },
      ];
    };
    const outcomes: Record<string, Outcome> = {};
    const cases: Record<string, Structure> = {};
    let text = left.description ?? right.description;
    const flat = OUTCOME_KEYS.filter((key) => right[key] !== undefined);
    found(
      {
        kind: "branching",
        layer1Cases: left.when !== undefined,
        interpretationCases: right.when !== undefined,
        flat: flat.length > 0,
        layer1Outcome: left.goTo !== undefined || left.does !== undefined || left.responds !== undefined,
        layer1GoTo: left.goTo !== undefined,
      },
      {
        "flat-in-cases": `commands.${name}: 場合に分かれるので、${flat.join(" / ")} は場合 (cases) の中に書いてください`,
        "layer1-outside-cases": `commands.${name}: Layer 1 の goTo / does / responds は、場合 (cases) の中に書いてください`,
        "branch-over-goto": `commands.${name}: Layer 1 が遷移先を1つに決めているので、解釈では場合分けできません`,
      },
    );
    if (left.when) {
      // Layer 1 が場合分けを書いた: 解釈は、同じ場合のそれぞれに構造を書く（otherwise だけは足せる）
      const keys = [...Object.keys(left.when), ...(left.when.otherwise === undefined && right.when?.otherwise !== undefined ? ["otherwise"] : [])];
      for (const condition of Object.keys(right.when ?? {})) {
        found({ kind: "entry", listed: true, closed: true, inLayer1: keys.includes(condition) }, { closed: `commands.${name}.cases.${condition}: Layer 1 にありません（Layer 1 が場合分けを書いているので、解釈では足せません）` });
      }
      // 解釈が触れなかった場合は、何も足さない（単一化）
      for (const condition of keys) {
        [outcomes[condition], cases[condition]] = merge(`commands.${name}.cases.${condition}`, left.when[condition] ?? {}, right.when?.[condition] ?? {}, condition);
      }
    } else if (right.when) {
      // 解釈が場合分けを決めた
      text = text ?? left.does;
      for (const [condition, branch] of Object.entries(right.when)) {
        [outcomes[condition], cases[condition]] = merge(`commands.${name}.cases.${condition}`, {}, branch, condition);
      }
    } else {
      [outcomes.otherwise, cases.otherwise] = merge(`commands.${name}`, left, right);
    }
    // otherwise が無いことは、葉の検査が報告する

    // 尋ねること: { 名前: { 問い合わせ: 引数 } } を、{ 名前: { query, input } } にする
    const asked: Record<string, Asked> = {};
    for (const [alias, entry] of Object.entries(left.asks ?? right.asks ?? {})) {
      const queried = Object.keys(entry ?? {});
      found({ kind: "asks", count: queried.length }, { "one-query": `commands.${name}.asks.${alias}: 問い合わせを1つだけ書いてください (${queried.join(", ") || "なし"})` });
      if (queried.length === 1) asked[alias] = { query: queried[0], input: entry[queried[0]] ?? {} };
    }
    // 含む部品を呼ぶこと
    const called = left.calls ?? right.calls ?? {};
    for (const [alias, call] of Object.entries(called)) {
      const part = base.parts?.[call.part];
      found(
        { kind: "call", exists: part !== undefined, keyedPart: part?.by !== undefined, keyGiven: call.key !== undefined },
        {
          "no-part": `commands.${name}.calls.${alias}: 部品 "${call.part}" は parts にありません`,
          "key-extra": `commands.${name}.calls.${alias}: 部品 "${call.part}" は1つだけなので、at(...) は要りません`,
          "key-missing": `commands.${name}.calls.${alias}: 部品 "${call.part}" は多数あるので、at(キー) でどれかを選んでください`,
        },
      );
    }
    const routed = left.route ?? right.route;
    // 入力に、生成の指示を重ねる。指示は助言なので、Layer 1 も解釈も書ける。同じ設定を両方が書けば、Layer 1 が勝つ
    const declaredInput = left.input ?? right.input;
    const hinted: Record<string, unknown> = { ...(declaredInput ?? {}) };
    for (const [field, hint] of [...Object.entries(right.hints ?? {}), ...Object.entries(left.hints ?? {})]) {
      const base = hinted[field];
      const asType = (schema: unknown) => (typeof schema === "string" ? { type: schema } : schema !== null && typeof schema === "object" && "type" in schema ? (schema as Record<string, unknown>) : undefined);
      const [from, to] = [asType(hint), asType(base)];
      found({ kind: "key", known: base !== undefined }, { "unknown-key": `commands.${name}.hints.${field}: 入力に ${field} がありません` });
      const fits = from !== undefined && to !== undefined && from.type === to.type && Object.keys(from).every((key) => key === "type" || (HINT_SETTINGS as readonly string[]).includes(key));
      if (base !== undefined) found({ kind: "key", known: fits }, { "unknown-key": `commands.${name}.hints.${field}: 生成の指示には、入力と同じ型に among / examples / around だけを書けます` });
      if (!fits || !from || !to) continue;
      const settings = Object.fromEntries(Object.entries(from).filter(([key]) => key !== "type" && !(key in to)));
      for (const key of Object.keys(from)) if (key !== "type") found({ kind: "slot", known: true, layer1: key in to, interpretation: true }, { conflict: `commands.${name}.hints.${field}.${key}: 入力に書かれているので、生成の指示では書けません` });
      hinted[field] = { ...to, ...settings };
    }
    const accepted = declaredInput === undefined && Object.keys(hinted).length === 0 ? undefined : (hinted as Fields);
    const returned = (left.output ?? right.output) as OutputSchema | undefined;
    const allowed = left.from ?? right.from;
    const required = left.onlyIf ?? right.onlyIf;
    commands[name] = {
      ...(text === undefined ? {} : { description: text }),
      ...(accepted === undefined ? {} : { input: accepted }),
      ...(returned === undefined ? {} : { output: returned }),
      ...(routed === undefined ? {} : { route: routed }),
      ...(allowed === undefined ? {} : { from: allowed }),
      ...(required === undefined ? {} : { onlyIf: required }),
      ...(Object.keys(asked).length === 0 ? {} : { asks: asked }),
      ...(Object.keys(called).length === 0 ? {} : { calls: called }),
      when: outcomes,
    };
    structures[name] = cases;
  }

  const declaration: Declaration = {
    descriptions,
    ...(Object.keys(initial).length > 0 ? { initial } : {}),
    ...(base.assets ? { assets: base.assets } : {}),
    states: states ?? [],
    ...((base as { finals?: readonly string[] }).finals ?? structure.finals ? { finals: (base as { finals?: readonly string[] }).finals ?? structure.finals } : {}),
    init: init ?? "",
    data,
    queries,
    effects,
    decisions: base.decisions ?? structure.decisions ?? {},
    calculations,
    // 不変条件は、解釈が足してもよい
    invariants: [...(base.invariants ?? []), ...(structure.invariants ?? [])],
    commands,
    ...(base.parts ? { parts: base.parts } : {}),
    ...(base.durable !== undefined ? { durable: base.durable } : {}),
  };
  return { declaration, commands: structures, problems, overlay, view };
}

// コンポーネント → その解釈。decide / calculate が、意味の関数の中から引けるようにする
const registry = new WeakMap<object, BoundSpecification>();
export const bindingOf = (target: object): BoundSpecification | undefined => registry.get(target);
// 同じコンポーネントに解釈が2つ読み込まれているとき（確定版と下書きなど）に、使うほうを選ぶ
// いま評価している解釈。意味の関数の中の取っ手（決定表の of、計算の of）が、これを引く
let current: BoundSpecification | undefined;
export const active = (): BoundSpecification => {
  if (!current) throw new Error("評価している解釈がありません（意味の関数の外で、取っ手の of は使えません）");
  return current;
};
export const activate = (binding: BoundSpecification): void => {
  registry.set(binding.source, binding);
  current = binding;
};

// --- 評価 ---
export class RuleConflictError extends Error {
  hits: string[];
  constructor(hits: string[]) {
    super(`複数の条件が同時に成立しました (同時に成り立つのは1つまで): ${hits.join(" / ")}`);
    this.name = "RuleConflictError";
    this.hits = hits;
  }
}

export class UnboundNameError extends Error {
  constructor(kind: string, name: string) {
    super(`${kind} "${name}" の意味が、解釈 (interpretation) に書かれていません`);
    this.name = "UnboundNameError";
  }
}

// 成立した条件の名前を返す。どれも成立しなければ "otherwise"。2つ以上成立したら RuleConflictError
export function matchCondition(binding: BoundSpecification, names: readonly string[], state: object): string {
  const hits = names.filter((name) => {
    if (name === "otherwise") return false;
    const condition = binding.conditions[name];
    if (!condition) throw new UnboundNameError("条件", name);
    return condition(state);
  });
  if (hits.length > 1) throw new RuleConflictError(hits);
  return hits[0] ?? "otherwise";
}

function bound(target: object): BoundSpecification {
  const binding = registry.get(target);
  if (!binding) throw new Error("このコンポーネントには、まだ解釈 (interpretation) がありません");
  return binding;
}

// 決定表を引く。意味の関数（計算など）の中で、表の結果を使うためのもの
// 決定表を引く。意味の関数（計算など）の中で、表の結果を使うためのもの
export function decide(target: object, decision: string, state: object): any {
  const binding = bound(target);
  const table = binding.component.decisions[decision];
  if (!table) throw new UnboundNameError("決定表", decision);
  return table[matchCondition(binding, Object.keys(table), state)] as any;
}

// 計算する。意味の関数の中で、別の計算の結果を使うためのもの
export function calculate(target: object, name: string, state: object): any {
  const calculation = bound(target).calculations?.[name];
  if (!calculation) throw new UnboundNameError("計算", name);
  return calculation(state);
}
