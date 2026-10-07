// 仕様を書くための型と関数。
//
//   決定表 (decisionTable)       … 条件から値を選ぶ表。値だけを返す
//   コンポーネント (component)   … Layer 1。人が書く。記述 (description) と、書きたい分だけの構造 (compose など)
//   解釈 (interpretation)        … Layer 2。LLM が導く。Layer 1 が書かなかった構造と、名前の意味 (関数)
//
// 人が精度を上げたいときは、解釈を直すのではなく、Layer 1 に構造を書き足す。
// 解釈は、Layer 1 が構造として書いたものを書き換えられない。
//
// 型は実行時に消えるため、すべて「値」として宣言し、型はそこから導出する。
// 値として残るので IR に出力でき、PBT の入力生成にもそのまま使える。

// --- 多重度DSL (型のみ) ---
export type One<T> = T;
export type Lone<T> = T | undefined;
export type Some<T> = [T, ...T[]];
export type Many<T> = T[];

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

type FieldType<F> = F extends "boolean"
  ? boolean
  : F extends "number" | "integer" | NumberSchema
    ? number
    : F extends "string"
      ? string
      : F extends readonly (infer Value)[]
        ? Value
        : never;

// --- 型エラーの説明 ---
// 文字列リテラルと交差させても never に潰れないよう、オブジェクト型にしている（文面がエラーに残る）
type Problem<Message extends string> = { readonly 誤り: Message };
type KnownKeys<T, Allowed> = {
  [K in keyof T]: K extends Allowed ? unknown : Problem<`"${K & string}" というキーはありません (書き間違い?)`>;
};
type OneOf<Actual, Allowed, What extends string> = Actual extends Allowed
  ? unknown
  : Problem<`"${Actual & string}" は ${What} にありません`>;
// 列挙は、その場に書くか `as const` を付けた配列でなければならない。
// 変数に取り出して `as const` を忘れると string[] に広がり、列挙の検査が効かなくなる
type NoWide<F> = {
  [K in keyof F]: F[K] extends readonly (infer Value)[]
    ? string extends Value
      ? Problem<"列挙は、その場に書くか as const を付けた配列で宣言してください">
      : unknown
    : unknown;
};
type NoWideIn<Group> = { [K in keyof Group]: NoWide<Group[K]> };

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

// --- Layer 1: 記述と、コマンドの部品 ---
// いちばん粗い書き方は、文だけ (description)。構造にしたい所だけを、部品を compose で組み合わせて書く。
//   description("...")     … 文。何を構造にするかは、解釈 (Layer 2) が決める
//   input({...})           … コマンドの入力
//   from("A", "B")         … 実行できる状態
//   onlyIf("...")          … 事前条件（条件の文）
//   when("...", ...)       … 条件で分かれるときの、1つの場合。中に goTo / does を書く
//   otherwise(...)         … どの条件にも当たらない場合
//   goTo("A")              … 遷移先。どこにも書かなければ、状態は変わらない
//   does("...")            … 何が起きるかの文
//   compose(...)           … 部品を1つにまとめる。まとめたものは値なので、複数のコマンドで共有できる
export type Description = { readonly $description: string };
export const description = (text: string): Description => ({ $description: text });
export const isDescription = (value: unknown): value is Description =>
  typeof value === "object" && value !== null && "$description" in value;

export type OutcomeShape = { goTo?: string; does?: string };
export type CommandShape = {
  description?: string;
  input?: Fields;
  from?: readonly string[];
  onlyIf?: readonly string[];
  goTo?: string;
  does?: string;
  when?: Record<string, OutcomeShape>;
};
declare const fragmentShape: unique symbol;
// 部品。型引数は、その部品が決める構造（型の検査に使う。実行時には無い）
export type Fragment<T> = { readonly $fragment: CommandShape; readonly [fragmentShape]?: T };
const fragment = <T>(shape: CommandShape): Fragment<T> => ({ $fragment: shape });
export const isFragment = (value: unknown): value is Fragment<unknown> =>
  typeof value === "object" && value !== null && "$fragment" in value;

type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;
type ShapeOf<P> = P extends Fragment<infer T> ? T : P extends Description ? { description: string } : never;
type Merged<P extends readonly unknown[]> = UnionToIntersection<ShapeOf<P[number]>>;
type OutcomePart = Fragment<OutcomeShape>;

const joined = (a: string | undefined, b: string | undefined) => (a === undefined ? b : b === undefined ? a : `${a} ${b}`);
function mergeOutcomes(a: OutcomeShape, b: OutcomeShape): OutcomeShape {
  if (a.goTo !== undefined && b.goTo !== undefined && a.goTo !== b.goTo) {
    throw new Error(`遷移先 (goTo) が2つ書かれています: "${a.goTo}" と "${b.goTo}"`);
  }
  const goTo = a.goTo ?? b.goTo;
  const does = joined(a.does, b.does);
  return { ...(goTo === undefined ? {} : { goTo }), ...(does === undefined ? {} : { does }) };
}
function mergeShapes(parts: readonly CommandShape[]): CommandShape {
  const result: CommandShape = {};
  for (const part of parts) {
    const text = joined(result.description, part.description);
    if (text !== undefined) result.description = text;
    if (part.input) result.input = { ...result.input, ...part.input };
    if (part.from) result.from = [...(result.from ?? []), ...part.from];
    if (part.onlyIf) result.onlyIf = [...(result.onlyIf ?? []), ...part.onlyIf];
    const outcome = mergeOutcomes(result, part);
    if (outcome.goTo !== undefined) result.goTo = outcome.goTo;
    if (outcome.does !== undefined) result.does = outcome.does;
    for (const [condition, branch] of Object.entries(part.when ?? {})) {
      result.when = { ...result.when, [condition]: mergeOutcomes(result.when?.[condition] ?? {}, branch) };
    }
  }
  return result;
}
const shapeOf = (part: Fragment<unknown> | Description): CommandShape =>
  isDescription(part) ? { description: part.$description } : part.$fragment;

export const input = <const F extends Fields>(fields: F & NoWide<F>): Fragment<{ input: F }> => fragment({ input: fields });
export const from = <const S extends readonly string[]>(...states: S): Fragment<{ from: S }> => fragment({ from: states });
export const onlyIf = <const S extends readonly string[]>(...conditions: S): Fragment<{ onlyIf: S }> => fragment({ onlyIf: conditions });
export const goTo = <const S extends string>(state: S): Fragment<{ goTo: S }> => fragment({ goTo: state });
export const does = (text: string): Fragment<{ does: string }> => fragment({ does: text });
export const when = <const C extends string, const P extends readonly OutcomePart[]>(
  condition: C,
  ...parts: P
): Fragment<{ when: { [K in C]: Merged<P> } }> => fragment({ when: { [condition]: mergeShapes(parts.map(shapeOf)) } });
export const otherwise = <const P extends readonly OutcomePart[]>(...parts: P): Fragment<{ when: { otherwise: Merged<P> } }> =>
  fragment({ when: { otherwise: mergeShapes(parts.map(shapeOf)) } });
export const compose = <const P extends readonly (Fragment<any> | Description)[]>(...parts: P): Fragment<Merged<P>> =>
  fragment(mergeShapes(parts.map(shapeOf)));

// --- Layer 1: コンポーネント ---
// 部品を記述する。どの項目も、文 (description) で済ませるか、構造で書くかを選べる。省いてもよい。
//   description  … コンポーネント全体の説明（文）
//   states / init … 状態名と初期状態
//   data         … 部品が覚えているデータ（初めは未設定）
//   queries      … 依存への問い合わせ（部品が外に尋ねて答えをもらう値）
//   effects      … 依存への副作用（部品が外に対して行うこと）
//   decisions    … 使う決定表
//   calculations … 計算。名前ごとに、式を述べる文 (description) か、文と結果の型 ({ is, type })
//   invariants   … 不変条件（文）
//   commands     … 外から部品を動かすコマンド。名前ごとに、文 (description) か、部品 (compose など)
//   assets       … 実装を LLM に依頼するときに添付する資料。仕様の意味には影響しない
// component(description("...")) と書けば、すべてを解釈に任せることになる
export type Layer1 = {
  description?: string;
  assets?: readonly AssetDeclaration[];
  states?: readonly string[] | Description;
  init?: string;
  data?: Fields | Description;
  queries?: Fields | Description;
  effects?: Record<string, Fields> | Description;
  decisions?: Record<string, Table>;
  calculations?: Record<string, Description | { is: string; type: FieldSchema }> | Description;
  invariants?: readonly string[];
  commands?: Record<string, Description | Fragment<any>> | Description;
};

// 構造として書かれた値（文や省略なら never）
type Has<T, K extends PropertyKey> = T extends { [P in K]: infer V } ? ([V] extends [Description] ? never : V) : never;
type Or<A, Fallback> = [A] extends [never] ? Fallback : A;
type AllIn<Actual, Allowed, What extends string> = [Actual] extends [Allowed] ? unknown : Problem<`${What} にない状態が書かれています`>;

type Elements<T> = [T] extends [never] ? never : T extends readonly (infer X)[] ? X : never;
type L1States<B> = Elements<Has<B, "states">>;
type CheckL1Command<B, T> = [L1States<B>] extends [never]
  ? unknown
  : (T extends { from: readonly (infer F)[] } ? AllIn<F, L1States<B>, "states"> : unknown) &
      (T extends { goTo: infer G } ? AllIn<G, L1States<B>, "states"> : unknown) &
      (T extends { when: infer W } ? AllIn<W[keyof W] extends infer O ? (O extends { goTo: infer G } ? G : never) : never, L1States<B>, "states"> : unknown);
type CheckLayer1<B> = KnownKeys<B, keyof Layer1> & {
  [K in keyof B]: B[K] extends Description
    ? unknown
    : K extends "data" | "queries"
      ? NoWide<B[K]>
      : K extends "effects"
        ? NoWideIn<B[K]>
        : K extends "init"
          ? [L1States<B>] extends [never]
            ? unknown
            : OneOf<B[K], L1States<B>, "states">
          : K extends "commands"
            ? { [A in keyof B[K]]: CheckL1Command<B, ShapeOf<B[K][A]>> }
            : unknown;
};

declare const componentBrand: unique symbol;
export type Component<B> = { readonly [componentBrand]?: B };

export const COMPONENT = Symbol.for("clp.component");
export const BINDING = Symbol.for("clp.binding");

export function component(text: Description): Component<{}>;
export function component<const B extends Layer1>(declaration: B & CheckLayer1<B>): Component<B>;
export function component(declaration: Layer1 | Description): Component<any> {
  const value = isDescription(declaration) ? { description: declaration.$description } : { ...declaration };
  Object.defineProperty(value, COMPONENT, { value: true });
  return value as Component<any>;
}

// --- Layer 2: 解釈 ---
// Layer 1 の文を、構造と意味に細かくしたもの。LLM が導き、人は読んで確かめる（書かない）。2つの部分を持つ:
//   structure … 構造。Layer 1 が構造として書かなかった分を、宣言で書く。関数は無い。IR に出て、実装する LLM に渡る。
//               語彙 (states / init / data / queries / effects / decisions / calculations / invariants) と、
//               コマンドごとの入力 (input)、実行できる状態 (from)、事前条件 (onlyIf)、遷移先 (goTo)、
//               副作用 (effects)、覚えるデータ (set)。条件で分かれるなら when の下に、条件ごとに書く。
//               goTo を書かなければ、状態は変わらない
//   meanings  … 意味。条件・計算・不変条件の名前が何を指すかを、関数で書く。
//               IR には出ない。PBT が期待値を計算するための正解になる

// Layer 1 と解釈の構造を合わせた語彙（型の検査に使う）
type CalculationType<E> = E extends { type: infer T } ? T : never;
type Calculated<B, S, L = Or<Has<B, "calculations">, {}>, R = Or<Has<S, "calculations">, {}>> = {
  [N in keyof L | keyof R]: Or<N extends keyof L ? CalculationType<L[N]> : never, N extends keyof R ? CalculationType<R[N]> : never>;
};
type L1Command<B, A, L = Or<Has<B, "commands">, {}>> = A extends keyof L ? ShapeOf<L[A]> : {};
type L2Command<S, A, R = Or<Has<S, "commands">, {}>> = A extends keyof R ? R[A] : {};
type Model<B, S> = {
  states: Or<Has<B, "states">, Or<Has<S, "states">, readonly []>>;
  data: Or<Has<B, "data">, Or<Has<S, "data">, {}>>;
  queries: Or<Has<B, "queries">, Or<Has<S, "queries">, {}>>;
  effects: Or<Has<B, "effects">, Or<Has<S, "effects">, {}>>;
  decisions: Or<Has<B, "decisions">, Or<Has<S, "decisions">, {}>>;
  calculations: Calculated<B, S>;
  invariants: Elements<Has<B, "invariants">> | Elements<Has<S, "invariants">>;
  inputs: {
    [A in keyof Or<Has<B, "commands">, {}> | keyof Or<Has<S, "commands">, {}>]: Or<Has<L1Command<B, A>, "input">, Or<Has<L2Command<S, A>, "input">, {}>>;
  };
};
type States<M> = M extends { states: readonly (infer X)[] } ? X : never;
type Data<M> = M extends { data: infer D } ? D : {};
type Queries<M> = M extends { queries: infer D } ? D : {};
type EffectsOf<M> = M extends { effects: infer D } ? D : {};
type Decisions<M> = M extends { decisions: infer D } ? D : {};
type Calculations<M> = M extends { calculations: infer D } ? D : {};
type Input<M, A> = M extends { inputs: infer I } ? (A extends keyof I ? I[A] : {}) : {};

// 型 T の値として使える参照
type ColumnType<T, C> = T[keyof T] extends infer Row ? (Row extends unknown ? (C extends keyof Row ? Row[C] : never) : never) : never;
type RefTo<M, A, T> =
  | {
      [D in keyof Decisions<M>]: {
        [C in Columns<Decisions<M>[D]>]: Exclude<ColumnType<Decisions<M>[D], C>, null> extends T ? Ref<"decision", readonly [D, C]> : never;
      }[Columns<Decisions<M>[D]>];
    }[keyof Decisions<M>]
  | { [N in keyof Calculations<M>]: FieldType<Calculations<M>[N]> extends T ? Ref<"calculation", N> : never }[keyof Calculations<M>]
  | { [N in keyof Input<M, A>]: FieldType<Input<M, A>[N]> extends T ? Ref<"input", N> : never }[keyof Input<M, A>]
  | { [N in keyof Data<M>]: FieldType<Data<M>[N]> extends T ? Ref<"data", N> : never }[keyof Data<M>]
  | { [N in keyof Queries<M>]: FieldType<Queries<M>[N]> extends T ? Ref<"query", N> : never }[keyof Queries<M>]
  | (boolean extends T ? Ref<"was", readonly States<M>[]> : never);
type Value<M, A, T> = T | RefTo<M, A, T>;

// 実際に書かれたキーをなぞって検査する（書かれた型そのものとの交差では、余計なキーを検出できないため）
type CheckPayload<M, A, Schema, P> = {
  [F in keyof P]: F extends keyof Schema ? Value<M, A, FieldType<Schema[F]>> : Problem<`"${F & string}" というフィールドは、この副作用にありません`>;
} & { [F in keyof Schema]: unknown };
type CheckEffect<M, A, E> = {
  // when: 条件の文か、真偽値の参照（決定表の列、問い合わせ、実行前の状態）
  [K in keyof E]: K extends "when"
    ? string | RefTo<M, A, boolean>
    : K extends keyof EffectsOf<M>
      ? CheckPayload<M, A, EffectsOf<M>[K], E[K]>
      : Problem<`"${K & string}" は effects にありません`>;
};
// 型引数をそのままなぞる形にしないと、タプルの要素ごとの検査にならない
type CheckEffectList<M, A, T> = { [I in keyof T]: CheckEffect<M, A, T[I]> };
type CheckSet<M, A, R> = {
  [K in keyof R]: K extends keyof Data<M> ? Value<M, A, FieldType<Data<M>[K]>> : Problem<`"${K & string}" は data にありません`>;
};
type CheckOutcomeKey<M, A, K, V> = K extends "effects"
  ? CheckEffectList<M, A, V>
  : K extends "set"
    ? CheckSet<M, A, V>
    : K extends "goTo"
      ? OneOf<V, States<M>, "states">
      : K extends "does"
        ? string
        : Problem<`"${K & string}" はここには書けません。書けるのは goTo / does / effects / set です`>;
type CheckCommand<M, A, C> = {
  [K in keyof C]: K extends "when"
    ? { [Condition in keyof C[K]]: { [O in keyof C[K][Condition]]: CheckOutcomeKey<M, A, O, C[K][Condition][O]> } }
    : K extends "input"
      ? NoWide<C[K]>
      : K extends "from"
        ? readonly States<M>[]
        : K extends "onlyIf"
          ? readonly string[]
          : K extends "description"
            ? string
            : CheckOutcomeKey<M, A, K, C[K]>;
};
type StructureKeys = "states" | "init" | "data" | "queries" | "effects" | "decisions" | "calculations" | "invariants" | "commands";
type CheckStructure<M, S> = {
  [K in keyof S]: K extends "commands"
    ? { [A in keyof S[K]]: CheckCommand<M, A, S[K][A]> }
    : K extends "data" | "queries"
      ? NoWide<S[K]>
      : K extends "effects"
        ? NoWideIn<S[K]>
        : K extends "init"
          ? OneOf<S[K], States<M>, "states">
          : K extends StructureKeys
            ? unknown
            : Problem<`"${K & string}" というキーはありません (書き間違い?)`>;
};

// 条件の名前は、決定表の行、Layer 1 と解釈の onlyIf・when のキー、副作用の when から集める。
// 意味の漏れも、どこにも使われていない条件（typo）も、コンパイルエラーになる
type EffectConditions<E> = E extends { effects: readonly (infer T)[] } ? (T extends { when: infer W } ? (W extends string ? W : never) : never) : never;
type CommandConditions<C> =
  | (C extends { onlyIf: readonly (infer N)[] } ? N : never)
  | (C extends { when: infer W } ? Exclude<keyof W, "otherwise"> | EffectConditions<W[keyof W]> : never)
  | EffectConditions<C>;
type ConditionNames<B, S, M> = (
  | Exclude<{ [D in keyof Decisions<M>]: keyof Decisions<M>[D] }[keyof Decisions<M>], "otherwise">
  | { [A in keyof Or<Has<B, "commands">, {}>]: CommandConditions<L1Command<B, A>> }[keyof Or<Has<B, "commands">, {}>]
  | { [A in keyof Or<Has<S, "commands">, {}>]: CommandConditions<L2Command<S, A>> }[keyof Or<Has<S, "commands">, {}>]
) &
  string;

type Shape<F> = F extends Fields ? { -readonly [K in keyof F]: FieldType<F[K]> } : {};
// 部品が覚えている状態: 状態名 (status) と、覚えているデータ（未設定があり得る）
type StateOf<M> = { status: States<M> } & Partial<Shape<Data<M>>>;
// 条件と計算が読めるデータ: 状態、問い合わせの答え、コマンドの入力（どのコマンドでも使われ得るので省略可能）
type ContextOf<M> = StateOf<M> &
  Shape<Queries<M>> &
  (M extends { inputs: infer I } ? Partial<UnionToIntersection<{ [A in keyof I]: Shape<I[A]> }[keyof I]>> : {});

type Meanings<B, S, M> = {
  conditions: { [N in ConditionNames<B, S, M>]: (state: ContextOf<M>) => boolean };
} & (keyof Calculations<M> extends never
  ? { calculations?: never }
  : { calculations: { [N in keyof Calculations<M>]: (state: ContextOf<M>) => FieldType<Calculations<M>[N]> } }) &
  (M extends { invariants: infer N }
    ? [N] extends [never]
      ? { invariants?: never }
      : { invariants: { [K in N & string]: (state: StateOf<M>) => boolean } }
    : { invariants?: never });

// --- 実行時に扱う形 ---
// Layer 1 に解釈を重ねて、すべてが構造になったコンポーネント
export type Outcome = { goTo?: string; does?: string };
export type CommandDeclaration = {
  description?: string;
  input?: Fields;
  // このコマンドを実行できる状態。省略時は全状態
  from?: readonly string[];
  // 事前条件（条件の文）。満たさない場合の挙動は仕様の対象外
  onlyIf?: readonly string[];
  // 条件ごとの結果。条件で分かれないコマンドは otherwise だけ
  when: Record<string, Outcome>;
};
export type Declaration = {
  // 全体と、項目ごとの説明（Layer 1 が文で書いたもの）
  descriptions: Record<string, string>;
  assets?: readonly AssetDeclaration[];
  states: readonly string[];
  init: string;
  data: Fields;
  queries: Fields;
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
  from?: readonly string[];
  onlyIf?: readonly string[];
  when?: Record<string, OutcomeStructure>;
};
type StructureValue = {
  states?: readonly string[];
  init?: string;
  data?: Fields;
  queries?: Fields;
  effects?: Record<string, Fields>;
  decisions?: Record<string, Table>;
  calculations?: Record<string, { is?: string; type: FieldSchema }>;
  invariants?: readonly string[];
  commands?: Record<string, CommandStructure>;
};

const OUTCOME_KEYS = ["goTo", "does", "effects", "set"] as const;
const COMMAND_KEYS = ["description", "input", "from", "onlyIf", "when", ...OUTCOME_KEYS] as const;
const STRUCTURE_KEYS = ["states", "init", "data", "queries", "effects", "decisions", "calculations", "invariants", "commands"] as const;

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
  // 項目ごと: Layer 1 が構造で書いていればそれを、文か省略なら解釈のものを使う
  const group = <K extends "states" | "data" | "queries" | "effects" | "decisions">(key: K): StructureValue[K] => {
    const given = base[key];
    if (isDescription(given)) descriptions[key] = given.$description;
    if (given !== undefined && !isDescription(given)) {
      if (structure[key] !== undefined) problems.push(`${key} は Layer 1 に構造として書かれているので、解釈では書けません`);
      return given as StructureValue[K];
    }
    return structure[key];
  };

  const states = group("states");
  if (states === undefined) problems.push("states が、Layer 1 にも解釈にもありません");
  if (base.init !== undefined && structure.init !== undefined) problems.push("init は Layer 1 に書かれているので、解釈では書けません");
  const init = base.init ?? structure.init;
  if (init === undefined) problems.push("init が、Layer 1 にも解釈にもありません");

  // 計算: Layer 1 が文だけを書いたものは、型を解釈が決める。解釈は、計算を足してもよい
  const calculations: Declaration["calculations"] = {};
  const listed = base.calculations;
  if (isDescription(listed)) descriptions.calculations = listed.$description;
  const declared = listed === undefined || isDescription(listed) ? {} : listed;
  for (const [name, entry] of Object.entries(declared)) {
    const added = structure.calculations?.[name];
    if (isDescription(entry)) {
      if (added?.type === undefined) problems.push(`計算 "${name}" の型 (type) が、解釈にありません`);
      else calculations[name] = { is: entry.$description, type: added.type };
    } else {
      if (added !== undefined) problems.push(`計算 "${name}" は Layer 1 に構造として書かれているので、解釈では書けません`);
      calculations[name] = entry;
    }
  }
  for (const [name, entry] of Object.entries(structure.calculations ?? {})) {
    if (name in declared) continue;
    if (entry.is === undefined) problems.push(`計算 "${name}" に、式を述べる文 (is) がありません`);
    else calculations[name] = { is: entry.is, type: entry.type };
  }

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
    const part = sketched?.[name];
    const left: CommandShape = part === undefined ? {} : shapeOf(part);
    const right = refined[name];
    if (right === undefined) {
      problems.push(`コマンド "${name}" の構造が、解釈にありません（足すものが無ければ {} と書きます）`);
      continue;
    }
    for (const key of Object.keys(right)) {
      if (!(COMMAND_KEYS as readonly string[]).includes(key)) problems.push(`コマンド "${name}": 解釈に "${key}" というキーは書けません`);
    }
    for (const key of ["input", "from", "onlyIf", "description"] as const) {
      if (left[key] !== undefined && right[key] !== undefined) {
        problems.push(`コマンド "${name}" の ${key} は Layer 1 に書かれているので、解釈では書けません`);
      }
    }
    const merge = (where: string, a: OutcomeShape, b: OutcomeStructure): [Outcome, Structure] => {
      for (const key of ["goTo", "does"] as const) {
        if (a[key] !== undefined && b[key] !== undefined) problems.push(`${where} の ${key} は Layer 1 に書かれているので、解釈では書けません`);
      }
      const goTo = a.goTo ?? b.goTo;
      const does = a.does ?? b.does;
      return [
        { ...(goTo === undefined ? {} : { goTo }), ...(does === undefined ? {} : { does }) },
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
      if (left.goTo !== undefined || left.does !== undefined) problems.push(`コマンド "${name}": Layer 1 の goTo / does は、when か otherwise の中に書いてください`);
      const keys = [...Object.keys(left.when), ...(left.when.otherwise === undefined && right.when?.otherwise !== undefined ? ["otherwise"] : [])];
      for (const condition of Object.keys(right.when ?? {})) {
        if (!keys.includes(condition)) problems.push(`コマンド "${name}" の条件 "${condition}" は Layer 1 にありません（Layer 1 が場合分けを書いているので、解釈では足せません）`);
      }
      for (const condition of keys) {
        const branch = right.when?.[condition];
        if (branch === undefined) {
          problems.push(`コマンド "${name}" の条件 "${condition}" の構造が、解釈にありません（足すものが無ければ {} と書きます）`);
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
    const accepted = left.input ?? right.input;
    const allowed = left.from ?? right.from;
    const required = left.onlyIf ?? right.onlyIf;
    commands[name] = {
      ...(text === undefined ? {} : { description: text }),
      ...(accepted === undefined ? {} : { input: accepted }),
      ...(allowed === undefined ? {} : { from: allowed }),
      ...(required === undefined ? {} : { onlyIf: required }),
      when: outcomes,
    };
    structures[name] = cases;
  }

  const declaration: Declaration = {
    descriptions,
    ...(base.assets ? { assets: base.assets } : {}),
    states: states ?? [],
    init: init ?? "",
    data: group("data") ?? {},
    queries: group("queries") ?? {},
    effects: group("effects") ?? {},
    decisions: group("decisions") ?? {},
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

export function interpretation<B, const S>(
  target: Component<B>,
  written: { structure: S & CheckStructure<Model<B, S>, S>; meanings: Meanings<B, S, Model<B, S>> },
): BoundSpecification {
  const { declaration, commands, problems } = resolveComponent(target, written.structure as object);
  const meanings = written.meanings as Pick<BoundSpecification, "conditions" | "calculations" | "invariants">;
  const value: BoundSpecification = {
    source: target,
    component: declaration,
    commands,
    conditions: meanings.conditions ?? {},
    ...(meanings.calculations ? { calculations: meanings.calculations } : {}),
    ...(meanings.invariants ? { invariants: meanings.invariants } : {}),
    problems,
  };
  Object.defineProperty(value, BINDING, { value: true });
  registry.set(target, value);
  return value;
}

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
export function decide<B, D extends string>(
  target: Component<B>,
  decision: D,
  state: object,
): [Has<B, "decisions">] extends [never] ? any : D extends keyof Has<B, "decisions"> ? Has<B, "decisions">[D][keyof Has<B, "decisions">[D]] : any {
  const binding = bound(target);
  const table = binding.component.decisions[decision];
  if (!table) throw new UnboundNameError("決定表", decision);
  return table[matchCondition(binding, Object.keys(table), state)] as any;
}

// 計算する。意味の関数の中で、別の計算の結果を使うためのもの
export function calculate<B>(target: Component<B>, name: string, state: object): any {
  const calculation = bound(target).calculations?.[name];
  if (!calculation) throw new UnboundNameError("計算", name);
  return calculation(state);
}
