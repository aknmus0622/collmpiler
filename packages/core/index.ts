// --- 多重度DSL ---
export type One<T> = T;
export type Lone<T> = T | undefined;
export type Some<T> = [T, ...T[]];
export type Many<T> = T[];

// --- ドメインモデル ---
// 型は実行時に消えるため、状態・データ・Command は「値」として宣言し、型はそこから導出する。
// 値として残るので IR に出力でき、PBT の入力生成にもそのまま使える。
export type FieldSchema = "boolean" | "number" | "string" | readonly string[];

export type DomainModel = {
  initial: string;
  states: readonly string[];
  data: Record<string, FieldSchema>;
  commands: Record<string, Record<string, FieldSchema>>;
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

type Shape<Fields> = { -readonly [K in keyof Fields]: FieldType<Fields[K]> };

export type DataOf<M extends DomainModel> = Shape<M["data"]>;
export type StatesOf<M extends DomainModel> = { [Name in M["states"][number]]: DataOf<M> };
export type CommandsOf<M extends DomainModel> = {
  [Action in keyof M["commands"]]: { action: Action; payload: Shape<M["commands"][Action]> };
}[keyof M["commands"]];

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
export type TransitionSpec<Command> = { event?: string; effects?: readonly Command[] };

export type Transition<Command = unknown> = {
  readonly nextState: string;
  readonly event?: string;
  readonly effects: readonly Command[];
};

// States は「状態名 → その状態が持つデータ」のレコード。
// state は現在のデータを読め、かつ状態名のコンストラクタで次状態を宣言できる。
export type StateHandle<States, Command> = Readonly<States[keyof States]> & {
  readonly [Name in keyof States]: (spec?: TransitionSpec<Command>) => Transition<Command>;
};

export type Behavior<States, Command> = {
  where?: readonly string[];
  cases: Record<string, (state: StateHandle<States, Command>) => Transition<Command>>;
};

export const BEHAVIORS = Symbol.for("aac.behaviors");

export function defineBehaviors<States = any, Command = any>(
  defs: Record<string, Behavior<States, Command>>,
): Record<string, Behavior<States, Command>> {
  Object.defineProperty(defs, BEHAVIORS, { value: true });
  return defs;
}

// 具体値での実行用（PBT のモデル側）。data に無いプロパティは状態コンストラクタとして振る舞う。
export function createState<States, Command>(data: object): StateHandle<States, Command> {
  return new Proxy(data, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop);
      return (spec: TransitionSpec<Command> = {}): Transition<Command> => ({
        nextState: prop,
        ...(spec.event === undefined ? {} : { event: spec.event }),
        effects: spec.effects ?? [],
      });
    },
  }) as StateHandle<States, Command>;
}
