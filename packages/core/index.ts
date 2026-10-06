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
//   actions  … 外から部品を動かすアクションと、その入力
//   queries  … 依存への問い合わせ（部品が外に尋ねて答えをもらう値。時計・設定など）
//   commands … 依存への指示（部品が外に対して行う副作用）
//   data     … 部品が覚えているデータ（遷移の set で書き、後のアクションで読む。初期状態では未設定）
export type FieldSchema = "boolean" | "number" | "string" | readonly string[];
export type Fields = Record<string, FieldSchema>;

export type DomainModel = {
  initial: string;
  states: readonly string[];
  data: Fields;
  actions: Record<string, Fields>;
  queries: Fields;
  commands: Record<string, Fields>;
};

type FieldType<F> = F extends "boolean"
  ? boolean
  : F extends "number"
    ? number
    : F extends "string"
      ? string
      : F extends readonly (infer Value)[]
        ? Value
        : never;

type Shape<F> = { -readonly [K in keyof F]: FieldType<F[K]> };

export type DataOf<M extends DomainModel> = Shape<M["data"]>;
export type CommandsOf<M extends DomainModel> = {
  [Action in keyof M["commands"]]: { action: Action; payload: Shape<M["commands"][Action]> };
}[keyof M["commands"]];

// 条件の評価関数と case が読めるデータ:
// 現在の状態名 (status)、覚えているデータ（未設定があり得る）、問い合わせの答え、そのアクションの入力
export type ContextOf<M extends DomainModel, Action extends keyof M["actions"]> = { status: M["states"][number] } & Partial<
  DataOf<M>
> &
  Shape<M["queries"]> &
  Shape<M["actions"][Action]>;

// --- DMN ---
// 文字列キーに加え、必ず "default" キーを要求する
export type DecisionTable<Outputs> = Record<string, Outputs> & { default: Outputs };

export type Predicate = (state: any) => boolean;

export class RuleConflictError extends Error {
  hits: string[];
  constructor(hits: string[]) {
    super(`複数のルールが同時に成立しました (Hit Policy: Unique): ${hits.join(" / ")}`);
    this.name = "RuleConflictError";
    this.hits = hits;
  }
}

export class UnboundDecisionError extends Error {
  constructor() {
    super("この DecisionTable には bindDecisionDetails による評価関数が登録されていません");
    this.name = "UnboundDecisionError";
  }
}

const bindings = new WeakMap<object, Record<string, Predicate>>();

export function getBinding(table: object): Record<string, Predicate> | undefined {
  return bindings.get(table);
}

// 抽象実行（IR 抽出）側が state に生やすフック。core は中身を知らない。
export const ABSTRACT_APPLY = Symbol.for("aac.abstract.applyDecision");

function evaluate(table: object, state: unknown): string {
  const impl = bindings.get(table);
  if (!impl) throw new UnboundDecisionError();
  // "default" はフォールバックであり、Unique 判定の対象外
  const hits = Object.keys(table).filter((key) => key !== "default" && impl[key](state));
  if (hits.length > 1) throw new RuleConflictError(hits);
  return hits[0] ?? "default";
}

export function applyDecision<T extends { default: unknown }>(table: T, state: object): T[keyof T] {
  const hook = (state as any)[ABSTRACT_APPLY];
  if (typeof hook === "function") return hook(table);
  return table[evaluate(table, state) as keyof T];
}

export function bindDecisionDetails<Conditions extends string>(
  table: Record<Conditions, unknown>,
  impl: Record<Conditions, Predicate>,
) {
  bindings.set(table, impl);
  return {
    table,
    evaluate: (state: object) => evaluate(table, state) as Conditions,
  };
}

// --- 事前条件 (where) ---
const preconditions = new Map<string, Predicate>();

export function bindPreconditions<Conditions extends string>(impl: Record<Conditions, Predicate>) {
  for (const [text, predicate] of Object.entries<Predicate>(impl)) preconditions.set(text, predicate);
  return impl;
}

export function getPrecondition(text: string): Predicate | undefined {
  return preconditions.get(text);
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

export type Behavior<M extends DomainModel, Action extends keyof M["actions"]> = {
  // このアクションを実行できる状態。省略時は全状態
  from?: readonly M["states"][number][];
  where?: readonly string[];
  // キーは outcome（アクションの結果を決める外部要因の応答）
  cases: Record<string, (state: StateHandle<M, Action>) => Transition<M>>;
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
