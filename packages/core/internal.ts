// 内部の形: 仕様を読み込む側 (packages/cli) が扱う、Layer 1 の値と、解釈の structure / meanings。
//
// 仕様を書くための語彙は index.ts にある（節と、その木）。書かれた木は、ここで定める形に変換される。
// ここに残っているのは、その形の型、Layer 1 に解釈を重ねる処理 (resolveComponent)、決定表、参照、
// そして意味の関数を評価する処理である。
//
// 型は実行時に消えるため、すべて「値」として宣言する。値として残るので IR に出力でき、PBT の入力生成にも使える。

// --- フィールドの型 ---
// 数値の制約。around は、その前後を PBT が重点的に生成するしきい値
export type NumberSchema = {
  readonly type: "integer" | "number";
  readonly min?: number;
  readonly max?: number;
  readonly around?: readonly number[];
};
export type FieldSchema = "boolean" | "number" | "integer" | "string" | readonly string[] | NumberSchema;
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
export type OutcomeShape = { goTo?: string; does?: string; responds?: unknown };
// コマンドが返すものの形: 値1つの型か、フィールドの組（optional に挙げたフィールドは、無いことがある。そのときの値は null）
export type OutputSchema = FieldSchema | { readonly record: Fields; readonly optional?: readonly string[] };
// 尋ねること: 答えに付ける名前 → { 問い合わせの名前: 引数 }
export type Asks = Record<string, Record<string, Record<string, unknown>>>;
// 部品が決める構造。どの部品をどこに書けるかは、項目の種類で決まる（読み込みのあとで検査する）
export type CommandShape = {
  description?: string;
  input?: Fields;
  // 問い合わせと計算では値1つの型。コマンドでは、フィールドの組も書ける
  output?: OutputSchema;
  type?: FieldSchema;
  from?: readonly string[];
  onlyIf?: readonly string[];
  asks?: Asks;
  goTo?: string;
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
};

// 構造として書かれた値（文や省略なら never）
export const COMPONENT = Symbol.for("clp.component");
export const BINDING = Symbol.for("clp.binding");

// --- 実行時に扱う形 ---
// Layer 1 に解釈を重ねて、すべてが構造になったコンポーネント
export type Outcome = { goTo?: string; does?: string; responds?: unknown };
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
  // 条件ごとの結果。条件で分かれないコマンドは otherwise だけ
  when: Record<string, Outcome>;
};
export type QueryDeclaration = { input: Fields; output: FieldSchema };
export type Declaration = {
  // 全体と、項目ごとの説明（Layer 1 が文で書いたもの。キーは "component"、"queries"、"queries.isMonthEnd" など）
  descriptions: Record<string, string>;
  assets?: readonly AssetDeclaration[];
  states: readonly string[];
  init: string;
  data: Fields;
  queries: Record<string, QueryDeclaration>;
  effects: Record<string, Fields>;
  decisions: Record<string, Table>;
  calculations: Record<string, { is: string; type: FieldSchema }>;
  invariants: readonly string[];
  commands: Record<string, CommandDeclaration>;
};
export type Structure = { effects?: readonly Record<string, unknown>[]; set?: Record<string, unknown> };
export type BoundSpecification = {
  // Layer 1 のコンポーネント（component(...) が返した値）
  source: object;
  component: Declaration;
  // コマンド名 → 条件 → 構造
  commands: Record<string, Record<string, Structure>>;
  conditions: Record<string, (state: any) => boolean>;
  calculations?: Record<string, (state: any) => unknown>;
  invariants?: Record<string, (state: any) => boolean>;
  // Layer 1 と解釈が合わない点（Layer 1 が構造として書いたものの書き換え、足りない構造など）
  problems: string[];
};

type OutcomeStructure = Outcome & Structure;
type CommandStructure = OutcomeStructure & {
  description?: string;
  input?: Fields;
  output?: OutputSchema;
  from?: readonly string[];
  onlyIf?: readonly string[];
  asks?: Asks;
  when?: Record<string, OutcomeStructure>;
};
type EntryStructure = Record<string, unknown>;
type StructureValue = {
  states?: readonly string[];
  init?: string;
  data?: Record<string, EntryStructure>;
  queries?: Record<string, EntryStructure>;
  effects?: Record<string, EntryStructure>;
  decisions?: Record<string, Table>;
  calculations?: Record<string, EntryStructure>;
  invariants?: readonly string[];
  commands?: Record<string, CommandStructure>;
};

const OUTCOME_KEYS = ["goTo", "does", "responds", "effects", "set"] as const;
const COMMAND_KEYS = ["description", "input", "output", "from", "onlyIf", "asks", "when", ...OUTCOME_KEYS] as const;
const STRUCTURE_KEYS = ["states", "init", "data", "queries", "effects", "decisions", "calculations", "invariants", "commands"] as const;
// まとまりごとの、項目に書ける部品。required は、Layer 1 か解釈のどちらかに無ければならないもの
const ENTRY_PARTS = {
  data: { parts: ["description", "type"], required: ["type"], additive: false },
  queries: { parts: ["description", "input", "output"], required: ["output"], additive: false },
  effects: { parts: ["description", "input"], required: [], additive: false },
  calculations: { parts: ["description", "output"], required: ["description", "output"], additive: true },
} as const;
const COMMAND_PARTS = ["description", "input", "output", "from", "onlyIf", "asks", "goTo", "does", "responds", "when"];

// Layer 1 に解釈の構造を重ねる。Layer 1 が構造として書いたものは、解釈では書き換えられない。
// 合わない点は problems に集める（読み込みの時点では投げない。報告は IR を作るときに行う）
export function resolveComponent(
  layer1: object,
  written: object = {},
): { declaration: Declaration; commands: Record<string, Record<string, Structure>>; problems: string[] } {
  const base = layer1 as Layer1;
  const structure = written as StructureValue;
  const problems: string[] = [];
  const descriptions: Record<string, string> = {};
  if (base.description !== undefined) descriptions.component = base.description;

  for (const key of Object.keys(structure)) {
    if (!(STRUCTURE_KEYS as readonly string[]).includes(key)) problems.push(`解釈の structure に "${key}" というキーはありません`);
  }

  // 状態: 配列か、{ 名前: 説明 }
  let states: readonly string[] | undefined;
  if (isDescription(base.states)) descriptions.states = base.states.$description;
  else if (Array.isArray(base.states)) states = base.states as readonly string[];
  else if (base.states !== undefined) {
    states = Object.keys(base.states);
    for (const [name, text] of Object.entries(base.states as Record<string, Description>)) {
      if (isDescription(text)) descriptions[`states.${name}`] = text.$description;
      else problems.push(`states の "${name}" には、description(...) を書いてください`);
    }
  }
  if (states !== undefined && structure.states !== undefined) problems.push("states は Layer 1 に構造として書かれているので、解釈では書けません");
  states = states ?? structure.states;
  if (states === undefined) problems.push("states が、Layer 1 にも解釈にもありません");
  if (base.init !== undefined && structure.init !== undefined) problems.push("init は Layer 1 に書かれているので、解釈では書けません");
  const init = base.init ?? structure.init;
  if (init === undefined) problems.push("init が、Layer 1 にも解釈にもありません");

  // 語彙のまとまり: 項目ごとに、Layer 1 の部品に、解釈の足りない分を重ねる
  const entries = (key: keyof typeof ENTRY_PARTS): Record<string, CommandShape> => {
    const { parts, required, additive } = ENTRY_PARTS[key];
    const given = base[key];
    if (isDescription(given)) descriptions[key] = given.$description;
    const listed = given === undefined || isDescription(given) ? undefined : given;
    const added = structure[key] ?? {};
    const names = listed ? [...Object.keys(listed), ...(additive ? Object.keys(added).filter((name) => !(name in listed)) : [])] : Object.keys(added);
    if (listed && !additive) {
      for (const name of Object.keys(added)) {
        if (!(name in listed)) problems.push(`${key} の "${name}" は Layer 1 にありません（Layer 1 が項目を並べているので、解釈では足せません）`);
      }
    }
    const result: Record<string, CommandShape> = {};
    for (const name of names) {
      const left = shapeOf(listed?.[name]) as Record<string, unknown>;
      // 解釈では、計算の文は is と書く
      const { is, ...rest } = (added[name] ?? {}) as Record<string, unknown>;
      const right: Record<string, unknown> = key === "calculations" && is !== undefined ? { ...rest, description: is } : added[name] ?? {};
      for (const part of Object.keys(left)) {
        if (!(parts as readonly string[]).includes(part)) problems.push(`${key}.${name}: ここには ${part === "type" ? "typed" : part} を書けません`);
      }
      for (const part of Object.keys(right)) {
        if (!(parts as readonly string[]).includes(part)) problems.push(`${key}.${name}: 解釈に "${part}" というキーは書けません`);
        else if (left[part] !== undefined) problems.push(`${key}.${name} の ${part} は Layer 1 に書かれているので、解釈では書けません`);
      }
      const merged = { ...right, ...left } as CommandShape & Record<string, unknown>;
      for (const part of required) {
        if (merged[part] === undefined) problems.push(`${key}.${name} の ${part === "description" ? "式を述べる文 (is)" : `型 (${part})`} が、Layer 1 にも解釈にもありません`);
      }
      if (merged.description !== undefined && key !== "calculations") descriptions[`${key}.${name}`] = merged.description;
      result[name] = merged;
    }
    return result;
  };
  const data = Object.fromEntries(Object.entries(entries("data")).map(([name, entry]) => [name, entry.type ?? "string"]));
  const queries = Object.fromEntries(Object.entries(entries("queries")).map(([name, entry]) => [name, { input: entry.input ?? {}, output: (entry.output ?? "boolean") as FieldSchema }]));
  const effects = Object.fromEntries(Object.entries(entries("effects")).map(([name, entry]) => [name, entry.input ?? {}]));
  const calculations = Object.fromEntries(
    Object.entries(entries("calculations")).map(([name, entry]) => [name, { is: entry.description ?? "", type: (entry.output ?? "string") as FieldSchema }]),
  );
  if (base.decisions !== undefined && structure.decisions !== undefined) problems.push("decisions は Layer 1 に書かれているので、解釈では書けません");

  // コマンド
  const commands: Declaration["commands"] = {};
  const structures: Record<string, Record<string, Structure>> = {};
  const given = base.commands;
  if (isDescription(given)) descriptions.commands = given.$description;
  const sketched = given === undefined || isDescription(given) ? undefined : given;
  const refined = structure.commands ?? {};
  if (sketched) {
    for (const name of Object.keys(refined)) {
      if (!(name in sketched)) problems.push(`コマンド "${name}" は Layer 1 にありません（Layer 1 がコマンドを並べているので、解釈では足せません）`);
    }
  }
  const names = sketched ? Object.keys(sketched) : Object.keys(refined);
  if (names.length === 0) problems.push("commands が、Layer 1 にも解釈にもありません");
  for (const name of names) {
    const left = shapeOf(sketched?.[name]);
    for (const part of Object.keys(left)) {
      if (!COMMAND_PARTS.includes(part)) problems.push(`コマンド "${name}": ここには ${part === "type" ? "typed" : part} を書けません`);
    }
    const right = refined[name];
    if (right === undefined) {
      problems.push(`コマンド "${name}" の構造が、解釈にありません（足すものが無ければ component() と書きます）`);
      continue;
    }
    for (const key of Object.keys(right)) {
      if (!(COMMAND_KEYS as readonly string[]).includes(key)) problems.push(`コマンド "${name}": 解釈に "${key}" というキーは書けません`);
    }
    for (const key of ["input", "output", "from", "onlyIf", "asks", "description"] as const) {
      if (left[key] !== undefined && right[key] !== undefined) {
        problems.push(`コマンド "${name}" の ${key} は Layer 1 に書かれているので、解釈では書けません`);
      }
    }
    const merge = (where: string, a: OutcomeShape, b: OutcomeStructure): [Outcome, Structure] => {
      for (const key of ["goTo", "does", "responds"] as const) {
        if (a[key] !== undefined && b[key] !== undefined) problems.push(`${where} の ${key} は Layer 1 に書かれているので、解釈では書けません`);
      }
      const goTo = a.goTo ?? b.goTo;
      const does = a.does ?? b.does;
      const responds = a.responds !== undefined ? a.responds : b.responds;
      return [
        { ...(goTo === undefined ? {} : { goTo }), ...(does === undefined ? {} : { does }), ...(responds === undefined ? {} : { responds }) },
        { ...(b.effects === undefined ? {} : { effects: b.effects }), ...(b.set === undefined ? {} : { set: b.set }) },
      ];
    };
    const outcomes: Record<string, Outcome> = {};
    const cases: Record<string, Structure> = {};
    let text = left.description ?? right.description;
    const flat = OUTCOME_KEYS.filter((key) => right[key] !== undefined);
    if (left.when) {
      // Layer 1 が場合分けを書いた: 解釈は、同じ場合のそれぞれに構造を書く（otherwise だけは足せる）
      if (flat.length > 0) problems.push(`コマンド "${name}" は条件で分かれるので、${flat.join(" / ")} は when の下に、条件ごとに書いてください`);
      if (left.goTo !== undefined || left.does !== undefined || left.responds !== undefined) problems.push(`コマンド "${name}": Layer 1 の goTo / does / responds は、when か otherwise の中に書いてください`);
      const keys = [...Object.keys(left.when), ...(left.when.otherwise === undefined && right.when?.otherwise !== undefined ? ["otherwise"] : [])];
      for (const condition of Object.keys(right.when ?? {})) {
        if (!keys.includes(condition)) problems.push(`コマンド "${name}" の条件 "${condition}" は Layer 1 にありません（Layer 1 が場合分けを書いているので、解釈では足せません）`);
      }
      for (const condition of keys) {
        const branch = right.when?.[condition];
        if (branch === undefined) {
          problems.push(`コマンド "${name}" の条件 "${condition}" の構造が、解釈にありません（足すものが無ければ component() と書きます）`);
          continue;
        }
        [outcomes[condition], cases[condition]] = merge(`コマンド "${name}" の条件 "${condition}"`, left.when[condition] ?? {}, branch);
      }
    } else if (right.when) {
      // 解釈が場合分けを決めた
      if (flat.length > 0) problems.push(`コマンド "${name}" は条件で分かれるので、${flat.join(" / ")} は when の下に、条件ごとに書いてください`);
      if (left.goTo !== undefined) problems.push(`コマンド "${name}": Layer 1 が遷移先を1つに決めているので、解釈では場合分けできません`);
      text = text ?? left.does;
      for (const [condition, branch] of Object.entries(right.when)) {
        [outcomes[condition], cases[condition]] = merge(`コマンド "${name}" の条件 "${condition}"`, {}, branch);
      }
    } else {
      [outcomes.otherwise, cases.otherwise] = merge(`コマンド "${name}"`, left, right);
    }
    if (outcomes.otherwise === undefined && Object.keys(outcomes).length > 0) problems.push(`コマンド "${name}" に otherwise がありません`);

    // 尋ねること: { 名前: { 問い合わせ: 引数 } } を、{ 名前: { query, input } } にする
    const asked: Record<string, Asked> = {};
    for (const [alias, entry] of Object.entries(left.asks ?? right.asks ?? {})) {
      const queried = Object.keys(entry ?? {});
      if (queried.length !== 1) problems.push(`コマンド "${name}" の asks.${alias}: 問い合わせを1つだけ書いてください (${queried.join(", ") || "なし"})`);
      else asked[alias] = { query: queried[0], input: entry[queried[0]] ?? {} };
    }
    const accepted = left.input ?? right.input;
    const returned = (left.output ?? right.output) as OutputSchema | undefined;
    const allowed = left.from ?? right.from;
    const required = left.onlyIf ?? right.onlyIf;
    commands[name] = {
      ...(text === undefined ? {} : { description: text }),
      ...(accepted === undefined ? {} : { input: accepted }),
      ...(returned === undefined ? {} : { output: returned }),
      ...(allowed === undefined ? {} : { from: allowed }),
      ...(required === undefined ? {} : { onlyIf: required }),
      ...(Object.keys(asked).length === 0 ? {} : { asks: asked }),
      when: outcomes,
    };
    structures[name] = cases;
  }

  const declaration: Declaration = {
    descriptions,
    ...(base.assets ? { assets: base.assets } : {}),
    states: states ?? [],
    init: init ?? "",
    data,
    queries,
    effects,
    decisions: base.decisions ?? structure.decisions ?? {},
    calculations,
    // 不変条件は、解釈が足してもよい
    invariants: [...(base.invariants ?? []), ...(structure.invariants ?? [])],
    commands,
  };
  return { declaration, commands: structures, problems };
}

// コンポーネント → その解釈。decide / calculate が、意味の関数の中から引けるようにする
const registry = new WeakMap<object, BoundSpecification>();
export const bindingOf = (target: object): BoundSpecification | undefined => registry.get(target);
// 同じコンポーネントに解釈が2つ読み込まれているとき（確定版と下書きなど）に、使うほうを選ぶ
export const activate = (binding: BoundSpecification): void => void registry.set(binding.source, binding);

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
