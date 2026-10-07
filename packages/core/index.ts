// 仕様を書くための型と関数。書くものは3つ:
//
//   決定表 (decisionTable)   … 条件から値を選ぶ表。値だけを返す
//   コンポーネント (component) … 語彙、状態機械の骨組み、コマンドの説明 (文)。関数は書かない
//   結び付け (bind)           … コマンドの構造 (宣言) と、名前の意味 (関数)
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
// セルに書けるのは値だけ。副作用や計算は書かない（表が決めるのは率や区分といったパラメータ）
export type Constant = string | number | boolean;
export type Table = Record<string, Record<string, Constant>>;
type Columns<T> = T extends { otherwise: infer Row } ? keyof Row : never;
type CheckTable<T> = T & { otherwise: unknown } & {
  [Row in keyof T]: { [C in Columns<T>]: Constant } & KnownKeys<T[Row], Columns<T>>;
};

export function decisionTable<const T extends Table>(table: CheckTable<T>): T {
  return table as T;
}

// --- 参照 ---
// 結び付けの構造の中で、「どこから来る値か」を指す。関数だが、返すのは純粋なデータ
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

// --- コンポーネント ---
// 部品を、語彙と骨組みと文で記述する。関数は書かない。
//   states / init … 状態名と初期状態
//   data         … 部品が覚えているデータ（結び付けの set で書き、後のコマンドで読む。初めは未設定）
//   queries      … 依存への問い合わせ（部品が外に尋ねて答えをもらう値。時計・設定・外部サービスの応答など）
//   effects      … 依存への副作用（部品が外に対して行うこと）
//   decisions    … 使う決定表
//   calculations … 計算。短い名前と、式を述べる文 (is) と、結果の型。中身は結び付けに書く
//   invariants   … 不変条件（文）。判定は結び付けに書く
//   commands     … 外から部品を動かすコマンド。入力 (input)、実行できる状態 (from)、事前条件 (onlyIf)、
//                  そして何が起きるか: 遷移先 (goTo) と、説明の文 (does)。条件で分かれるなら when に並べる
//   assets       … 実装を LLM に依頼するときに添付する資料。仕様の意味には影響しない
export type Outcome = { goTo: string; does: string };
export type CommandDeclaration = {
  input?: Fields;
  // このコマンドを実行できる状態。省略時は全状態
  from?: readonly string[];
  // 事前条件（条件の文）。満たさない場合の挙動は仕様の対象外
  onlyIf?: readonly string[];
  // 条件で分かれないとき
  then?: Outcome;
  // 条件で分かれるとき。キーは条件の文で、otherwise が必須
  when?: Record<string, Outcome>;
};
export type Declaration = {
  assets?: readonly AssetDeclaration[];
  states: readonly string[];
  init: string;
  data?: Fields;
  queries?: Fields;
  effects?: Record<string, Fields>;
  decisions?: Record<string, Table>;
  calculations?: Record<string, { is: string; type: FieldSchema }>;
  invariants?: readonly string[];
  commands: Record<string, CommandDeclaration>;
};

type Opt<T> = T extends object ? T : {};
type States<B extends Declaration> = B["states"][number];
type Data<B extends Declaration> = Opt<B["data"]>;
type Queries<B extends Declaration> = Opt<B["queries"]>;
type EffectsOf<B extends Declaration> = Opt<B["effects"]>;
type Decisions<B extends Declaration> = Opt<B["decisions"]>;
type Calculations<B extends Declaration> = Opt<B["calculations"]>;
type Input<B extends Declaration, A extends keyof B["commands"]> = Opt<B["commands"][A]["input"]>;

type CheckOutcome<B extends Declaration, O> = KnownKeys<O, keyof Outcome> & {
  goTo: O extends { goTo: infer G } ? OneOf<G, States<B>, "states"> : string;
  does: string;
};
type CheckCommand<B extends Declaration, A extends keyof B["commands"]> = KnownKeys<B["commands"][A], keyof CommandDeclaration> & {
  input?: NoWide<B["commands"][A]["input"]>;
  from?: readonly States<B>[];
} & (B["commands"][A] extends { when: infer W }
    ? { when: { [C in keyof W]: CheckOutcome<B, W[C]> } & { otherwise: unknown }; then?: never }
    : B["commands"][A] extends { then: infer O }
      ? { then: CheckOutcome<B, O> }
      : { then: Problem<"then (条件で分かれない) か when (条件で分かれる) のどちらかが必要です"> });
type Checked<B extends Declaration> = B &
  KnownKeys<B, keyof Declaration> & {
    init: OneOf<B["init"], States<B>, "states">;
    data?: NoWide<B["data"]>;
    queries?: NoWide<B["queries"]>;
    effects?: NoWideIn<B["effects"]>;
    commands: { [A in keyof B["commands"]]: CheckCommand<B, A> };
  };

declare const componentBrand: unique symbol;
export type Component<B extends Declaration> = B & { readonly [componentBrand]?: true };

export const COMPONENT = Symbol.for("aac.component");
export const BINDING = Symbol.for("aac.binding");

export function component<const B extends Declaration>(declaration: Checked<B>): Component<B> {
  const value = { ...(declaration as B) };
  Object.defineProperty(value, COMPONENT, { value: true });
  return value;
}

// --- 結び付け ---
// コンポーネントの文と名前に、内容を結び付ける。2種類を書く:
//   commands     … 構造。コマンドの文 (does) が何を意味するかを、宣言で書く:
//                  どの副作用を起こすか (effects)、何を覚えるか (set)。値は参照 (ref.decision など) で指す。
//                  IR に出て、実装する LLM に渡る
//   conditions / calculations / invariants … 意味。名前が何を指すかを、関数で書く。
//                  IR には出ない。PBT が期待値を計算するための正解になる

// 型 T の値として使える参照
type ColumnType<T, C> = T[keyof T] extends infer Row ? (Row extends unknown ? (C extends keyof Row ? Row[C] : never) : never) : never;
type RefTo<B extends Declaration, A extends keyof B["commands"], T> =
  | {
      [D in keyof Decisions<B>]: {
        [C in Columns<Decisions<B>[D]>]: ColumnType<Decisions<B>[D], C> extends T ? Ref<"decision", readonly [D, C]> : never;
      }[Columns<Decisions<B>[D]>];
    }[keyof Decisions<B>]
  | { [N in keyof Calculations<B>]: Calculations<B>[N] extends { type: infer S } ? (FieldType<S> extends T ? Ref<"calculation", N> : never) : never }[keyof Calculations<B>]
  | { [N in keyof Input<B, A>]: FieldType<Input<B, A>[N]> extends T ? Ref<"input", N> : never }[keyof Input<B, A>]
  | { [N in keyof Data<B>]: FieldType<Data<B>[N]> extends T ? Ref<"data", N> : never }[keyof Data<B>]
  | { [N in keyof Queries<B>]: FieldType<Queries<B>[N]> extends T ? Ref<"query", N> : never }[keyof Queries<B>]
  | (boolean extends T ? Ref<"was", readonly States<B>[]> : never);
type Value<B extends Declaration, A extends keyof B["commands"], T> = T | RefTo<B, A, T>;

// 実際に書かれたキーをなぞって検査する（書かれた型そのものとの交差では、余計なキーを検出できないため）
type CheckPayload<B extends Declaration, A extends keyof B["commands"], Schema, P> = {
  [F in keyof P]: F extends keyof Schema
    ? Value<B, A, FieldType<Schema[F]>>
    : Problem<`"${F & string}" というフィールドは、この副作用にありません`>;
} & { [F in keyof Schema]: unknown };
type CheckEffect<B extends Declaration, A extends keyof B["commands"], E> = {
  // when: 条件の文か、真偽値の参照（決定表の列、問い合わせ、実行前の状態）
  [K in keyof E]: K extends "when"
    ? string | RefTo<B, A, boolean>
    : K extends keyof EffectsOf<B>
      ? CheckPayload<B, A, EffectsOf<B>[K], E[K]>
      : Problem<`"${K & string}" は effects にありません`>;
};
// 型引数をそのままなぞる形にしないと、タプルの要素ごとの検査にならない
type CheckEffectList<B extends Declaration, A extends keyof B["commands"], T> = { [I in keyof T]: CheckEffect<B, A, T[I]> };
type CheckSet<B extends Declaration, A extends keyof B["commands"], R> = {
  [K in keyof R]: K extends keyof Data<B>
    ? Value<B, A, FieldType<Data<B>[K]>>
    : Problem<`"${K & string}" は data にありません`>;
};
type CheckStructureOf<B extends Declaration, A extends keyof B["commands"], E> = {
  [K in keyof E]: K extends "effects"
    ? CheckEffectList<B, A, E[K]>
    : K extends "set"
      ? CheckSet<B, A, E[K]>
      : Problem<`"${K & string}" はここには書けません。書けるのは effects と set です (遷移先はコンポーネントの goTo に書きます)`>;
};
// コマンドごとの構造。when のあるコマンドは、その条件ごと (otherwise を含む) に書く
type CheckStructure<B extends Declaration, S> = {
  [A in keyof B["commands"]]: B["commands"][A] extends { when: infer W }
    ? { [C in keyof W]: A extends keyof S ? (C extends keyof S[A] ? CheckStructureOf<B, A, S[A][C]> : unknown) : unknown } &
        (A extends keyof S ? KnownKeys<S[A], keyof W> : unknown)
    : A extends keyof S
      ? CheckStructureOf<B, A, S[A]>
      : unknown;
} & KnownKeys<S, keyof B["commands"]>;

// 条件の名前は、決定表の行・onlyIf・when のキー（コンポーネント）と、副作用の when（結び付けの構造）から集める。
// 結び付けの漏れも、どこにも使われていない条件（typo）も、コンパイルエラーになる
type EffectConditions<E> = E extends { effects: readonly (infer T)[] } ? (T extends { when: infer W } ? (W extends string ? W : never) : never) : never;
type StructureConditions<B extends Declaration, S> = {
  [A in keyof S]: A extends keyof B["commands"]
    ? B["commands"][A] extends { when: unknown }
      ? EffectConditions<S[A][keyof S[A]]>
      : EffectConditions<S[A]>
    : never;
}[keyof S];
type DeclaredConditions<B extends Declaration> =
  | Exclude<{ [D in keyof Decisions<B>]: keyof Decisions<B>[D] }[keyof Decisions<B>], "otherwise">
  | {
      [A in keyof B["commands"]]:
        | (B["commands"][A] extends { onlyIf: readonly (infer N)[] } ? N : never)
        | (B["commands"][A] extends { when: infer W } ? Exclude<keyof W, "otherwise"> : never);
    }[keyof B["commands"]];
export type ConditionNames<B extends Declaration, S> = (DeclaredConditions<B> | StructureConditions<B, S>) & string;

type Shape<F> = F extends Fields ? { -readonly [K in keyof F]: FieldType<F[K]> } : {};
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;
// 部品が覚えている状態: 状態名 (status) と、覚えているデータ（未設定があり得る）
export type StateOf<B extends Declaration> = { status: States<B> } & Partial<Shape<B["data"]>>;
// 条件と計算が読めるデータ: 状態、問い合わせの答え、コマンドの入力（どのコマンドでも使われ得るので省略可能）
export type ContextOf<B extends Declaration> = StateOf<B> &
  Shape<B["queries"]> &
  Partial<UnionToIntersection<{ [A in keyof B["commands"]]: Shape<B["commands"][A]["input"]> }[keyof B["commands"]]>>;

type Meanings<B extends Declaration, S> = {
  conditions: { [N in ConditionNames<B, S>]: (state: ContextOf<B>) => boolean };
} & (keyof Calculations<B> extends never
  ? { calculations?: never }
  : { calculations: { [N in keyof Calculations<B>]: (state: ContextOf<B>) => Calculations<B>[N] extends { type: infer T } ? FieldType<T> : never } }) &
  (B["invariants"] extends readonly string[]
    ? { invariants: { [N in B["invariants"][number]]: (state: StateOf<B>) => boolean } }
    : { invariants?: never });

// 実行時に扱う形（型の検査は bind の引数で済んでいる）
export type Structure = { effects?: readonly Record<string, unknown>[]; set?: Record<string, unknown> };
export type BoundSpecification = {
  component: Declaration;
  // コマンド名 → 構造。when のあるコマンドは、条件 → 構造
  commands: Record<string, Structure | Record<string, Structure>>;
  conditions: Record<string, (state: any) => boolean>;
  calculations?: Record<string, (state: any) => unknown>;
  invariants?: Record<string, (state: any) => boolean>;
};

// コンポーネント → その結び付け。decide / calculate が、意味の関数の中から引けるようにする
const registry = new WeakMap<object, BoundSpecification>();
export const bindingOf = (target: object): BoundSpecification | undefined => registry.get(target);

export function bind<B extends Declaration, const S>(
  target: Component<B>,
  bindings: { commands: S & CheckStructure<B, S> } & Meanings<B, S>,
): BoundSpecification {
  const value = { component: target as Declaration, ...(bindings as unknown as Omit<BoundSpecification, "component">) };
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
    super(`${kind} "${name}" の意味が、結び付け (bind) に書かれていません`);
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
  if (!binding) throw new Error("このコンポーネントには、まだ結び付け (bind) がありません");
  return binding;
}

// 決定表を引く。意味の関数（計算など）の中で、表の結果を使うためのもの
export function decide<B extends Declaration, D extends keyof Decisions<B> & string>(
  target: Component<B>,
  decision: D,
  state: object,
): Decisions<B>[D][keyof Decisions<B>[D]] {
  const table = (target as Declaration).decisions?.[decision];
  if (!table) throw new UnboundNameError("決定表", decision);
  return table[matchCondition(bound(target), Object.keys(table), state)] as Decisions<B>[D][keyof Decisions<B>[D]];
}

// 計算する。意味の関数の中で、別の計算の結果を使うためのもの
export function calculate<B extends Declaration, N extends keyof Calculations<B> & string>(
  target: Component<B>,
  name: N,
  state: object,
): Calculations<B>[N] extends { type: infer T } ? FieldType<T> : never {
  const calculation = bound(target).calculations?.[name];
  if (!calculation) throw new UnboundNameError("計算", name);
  return calculation(state) as Calculations<B>[N] extends { type: infer T } ? FieldType<T> : never;
}
