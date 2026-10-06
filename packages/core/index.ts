// --- 多重度DSL ---
export type One<T> = T;
export type Lone<T> = T | undefined;
export type Some<T> = [T, ...T[]];
export type Many<T> = T[];

// --- ドメインモデル ---
// 型は実行時に消えるため、部品の境界は「値」として宣言し、型はそこから導出する。
// 値として残るので IR に出力でき、PBT の入力生成にもそのまま使える。
//
// 部品は境界だけで記述する:
//   actions    … 外から部品を動かすアクションと、その入力
//   queries    … 依存への問い合わせ（部品が外に尋ねて答えをもらう値。時計・設定・外部サービスの応答など）
//   commands   … 依存への指示（部品が外に対して行う副作用）
//   data       … 部品が覚えているデータ（遷移の set で書き、後のアクションで読む。初期状態では未設定）
//   formulas   … 計算。名前（自然言語）と結果の型だけを宣言し、中身は Layer 2 で結び付ける
//   invariants … 不変条件。名前（自然言語）だけを宣言し、判定は Layer 2 で結び付ける

// 数値の制約。around は、その前後を PBT が重点的に生成するしきい値
export type NumberSchema = {
  readonly type: "integer" | "number";
  readonly min?: number;
  readonly max?: number;
  readonly around?: readonly number[];
};

export type FieldSchema = "boolean" | "number" | "integer" | "string" | readonly string[] | NumberSchema;
export type Fields = Record<string, FieldSchema>;

export type DomainModel = {
  initial: string;
  states: readonly string[];
  data: Fields;
  actions: Record<string, Fields>;
  queries: Fields;
  commands: Record<string, Fields>;
  formulas?: Fields;
  invariants?: readonly string[];
};

type FieldType<F> = F extends "boolean"
  ? boolean
  : F extends "number" | "integer" | NumberSchema
    ? number
    : F extends "string"
      ? string
      : F extends readonly (infer Value)[]
        ? Value
        : never;

type Shape<F> = { -readonly [K in keyof F]: FieldType<F[K]> };
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;

export type DataOf<M extends DomainModel> = Shape<M["data"]>;
export type CommandsOf<M extends DomainModel> = {
  [Action in keyof M["commands"]]: { action: Action; payload: Shape<M["commands"][Action]> };
}[keyof M["commands"]];

// 部品が覚えている状態: 状態名 (status) と、覚えているデータ（未設定があり得る）
export type StateOf<M extends DomainModel> = { status: M["states"][number] } & Partial<DataOf<M>>;

// case が読めるデータ: 状態、問い合わせの答え、そのアクションの入力
export type ContextOf<M extends DomainModel, Action extends keyof M["actions"]> = StateOf<M> &
  Shape<M["queries"]> &
  Shape<M["actions"][Action]>;

// 条件と計算が読めるデータ: どのアクションでも使われ得るので、入力はすべて省略可能
export type SpecContextOf<M extends DomainModel> = StateOf<M> &
  Shape<M["queries"]> &
  Partial<UnionToIntersection<Shape<M["actions"][keyof M["actions"]]>>>;

// --- 仕様の結び付け (Layer 2) ---
// Layer 1 に自然言語で書いた名前に、評価関数を結び付ける。同じ文は、どこに書かれても同じ意味になる。
//   conditions … 決定表の行、事前条件 (where)、case の分かれ方
//   formulas   … 計算
//   invariants … 不変条件
type Condition = (state: any) => boolean;
type Formula = (state: any) => unknown;

const conditions = new Map<string, Condition>();
const formulas = new Map<string, Formula>();
const invariants = new Map<string, Condition>();

export class RuleConflictError extends Error {
  hits: string[];
  constructor(hits: string[]) {
    super(`複数の条件が同時に成立しました (Hit Policy: Unique): ${hits.join(" / ")}`);
    this.name = "RuleConflictError";
    this.hits = hits;
  }
}

export class UnboundNameError extends Error {
  constructor(kind: string, name: string) {
    super(`${kind} "${name}" に bindSpecification による評価関数が登録されていません`);
    this.name = "UnboundNameError";
  }
}

type ConditionsOfTables<Tables> = Exclude<{ [K in keyof Tables]: keyof Tables[K] }[keyof Tables], "default"> & string;

type Bindings<M extends DomainModel, Tables> = {
  // 条件名の型検査に使う決定表。ここに渡した表の行は、結び付けの漏れがコンパイルエラーになる。
  // 事前条件と case の条件は型では追えないため、漏れは IR 抽出時のエラーになる
  tables?: Tables;
  conditions: Record<ConditionsOfTables<Tables>, (state: SpecContextOf<M>) => boolean> &
    Record<string, (state: SpecContextOf<M>) => boolean>;
} & (M["formulas"] extends Fields
  ? { formulas: { [K in keyof M["formulas"]]: (state: SpecContextOf<M>) => FieldType<M["formulas"][K]> } }
  : { formulas?: never }) &
  (M["invariants"] extends readonly string[]
    ? { invariants: Record<M["invariants"][number], (state: StateOf<M>) => boolean> }
    : { invariants?: never });

function register<F>(kind: string, registry: Map<string, F>, entries: Record<string, F> | undefined) {
  for (const [name, fn] of Object.entries(entries ?? {})) {
    if (registry.has(name) && registry.get(name) !== fn) {
      throw new Error(`${kind} "${name}" が複数回、別の関数に結び付けられています（同じ文は1つの意味でなければなりません）`);
    }
    registry.set(name, fn);
  }
}

export function bindSpecification<M extends DomainModel, const Tables extends Record<string, object> = {}>(
  _model: M,
  bindings: Bindings<M, Tables>,
) {
  register("条件", conditions, bindings.conditions);
  register("計算", formulas, bindings.formulas as Record<string, Formula> | undefined);
  register("不変条件", invariants, bindings.invariants as Record<string, Condition> | undefined);
  return bindings;
}

export const getCondition = (name: string) => conditions.get(name);
export const getFormula = (name: string) => formulas.get(name);
export const getInvariant = (name: string) => invariants.get(name);

// 成立した条件の名前を返す。どれも成立しなければ "default"。2つ以上成立したら RuleConflictError
export function evaluateConditions(names: readonly string[], state: object): string {
  const hits = names.filter((name) => {
    if (name === "default") return false;
    const condition = conditions.get(name);
    if (!condition) throw new UnboundNameError("条件", name);
    return condition(state);
  });
  if (hits.length > 1) throw new RuleConflictError(hits);
  return hits[0] ?? "default";
}

// --- DMN ---
// 文字列キーに加え、必ず "default" キーを要求する
export type DecisionTable<Outputs> = Record<string, Outputs> & { default: Outputs };

// 抽象実行（IR 抽出）側が state に生やすフック。core は中身を知らない。
export const ABSTRACT_APPLY = Symbol.for("aac.abstract.applyDecision");
export const ABSTRACT_FORMULA = Symbol.for("aac.abstract.applyFormula");

export function applyDecision<T extends { default: unknown }>(table: T, state: object): T[keyof T] {
  const hook = (state as any)[ABSTRACT_APPLY];
  if (typeof hook === "function") return hook(table);
  return table[evaluateConditions(Object.keys(table), state) as keyof T];
}

// --- 計算 ---
export function applyFormula<M extends DomainModel, Name extends keyof NonNullable<M["formulas"]> & string>(
  _model: M,
  name: Name,
  state: object,
): FieldType<NonNullable<M["formulas"]>[Name]> {
  const hook = (state as any)[ABSTRACT_FORMULA];
  if (typeof hook === "function") return hook(name);
  const formula = formulas.get(name);
  if (!formula) throw new UnboundNameError("計算", name);
  return formula(state) as FieldType<NonNullable<M["formulas"]>[Name]>;
}

// --- 振る舞い定義 ---
export type TransitionSpec<M extends DomainModel> = {
  event?: string;
  effects?: readonly CommandsOf<M>[];
  // 覚えるデータ。ここに書いたフィールドだけが更新される
  set?: Partial<DataOf<M>>;
};

export type Transition<M extends DomainModel = any> = {
  readonly nextState: string;
  readonly event?: string;
  readonly effects: readonly CommandsOf<M>[];
  readonly set?: Partial<DataOf<M>>;
};

// state は現在のデータを読め、かつ状態名のコンストラクタで次状態を宣言できる。
export type StateHandle<M extends DomainModel, Action extends keyof M["actions"]> = Readonly<ContextOf<M, Action>> & {
  readonly [Name in M["states"][number]]: (spec?: TransitionSpec<M>) => Transition<M>;
};

type Case<M extends DomainModel, Action extends keyof M["actions"]> = (state: StateHandle<M, Action>) => Transition<M>;

export type Behavior<M extends DomainModel, Action extends keyof M["actions"]> = {
  // このアクションを実行できる状態。省略時は全状態
  from?: readonly M["states"][number][];
  // 事前条件。満たさない場合の挙動は仕様の対象外
  where?: readonly string[];
  // 遷移を出力とする決定表。キーは条件（自然言語）で、決定表と同じく "default" が必須
  cases: Record<string, Case<M, Action>> & { default: Case<M, Action> };
};

// モデルの actions に宣言した全アクションに、振る舞いを1つずつ対応させる
export type Behaviors<M extends DomainModel> = { [Action in keyof M["actions"]]: Behavior<M, Action> };

export const BEHAVIORS = Symbol.for("aac.behaviors");

export function defineBehaviors<M extends DomainModel = any>(defs: Behaviors<M>): Behaviors<M> {
  Object.defineProperty(defs, BEHAVIORS, { value: true });
  return defs;
}

// 具体値での実行用（PBT のモデル側）。context に無いプロパティは状態コンストラクタとして振る舞う。
// 未設定のデータも、値 undefined のキーとして context に含めること。
export function createState(context: object): any {
  return new Proxy(context, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop);
      return (spec: TransitionSpec<any> = {}): Transition => ({
        nextState: prop,
        ...(spec.event === undefined ? {} : { event: spec.event }),
        effects: spec.effects ?? [],
        ...(spec.set === undefined ? {} : { set: spec.set }),
      });
    },
  });
}
