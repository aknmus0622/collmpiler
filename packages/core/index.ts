// --- 多重度DSL ---
export type One<T> = T;
export type Lone<T> = T | undefined;
export type Some<T> = [T, ...T[]];
export type Many<T> = T[];

// --- コンポーネント ---
// 型は実行時に消えるため、部品は「値」として宣言し、型はそこから導出する。
// 値として残るので IR に出力でき、PBT の入力生成にもそのまま使える。
//
// 部品は境界と構造だけで記述する (defineComponent)。ここまでは関数を含まない純粋データ:
//   states / initial … 状態名と初期状態
//   actions    … 外から部品を動かすアクション。入力 (input)、実行できる状態 (from)、事前条件 (where)
//   queries    … 依存への問い合わせ（部品が外に尋ねて答えをもらう値。時計・設定・外部サービスの応答など）
//   commands   … 依存への指示（部品が外に対して行う副作用）
//   data       … 部品が覚えているデータ（遷移の set で書き、後のアクションで読む。初期状態では未設定）
//   formulas   … 計算。名前（自然言語）と結果の型だけを宣言し、中身は Layer 2 で結び付ける
//   invariants … 不変条件。名前（自然言語）だけを宣言し、判定は Layer 2 で結び付ける
// そこに .cases() で「アクションごとの遷移」を取り付けると、コンポーネントが完成する。

// 数値の制約。around は、その前後を PBT が重点的に生成するしきい値
export type NumberSchema = {
  readonly type: "integer" | "number";
  readonly min?: number;
  readonly max?: number;
  readonly around?: readonly number[];
};

export type FieldSchema = "boolean" | "number" | "integer" | "string" | readonly string[] | NumberSchema;
export type Fields = Record<string, FieldSchema>;

export type ActionDeclaration = {
  input?: Fields;
  // このアクションを実行できる状態。省略時は全状態
  from?: readonly string[];
  // 事前条件（自然言語の条件）。満たさない場合の挙動は仕様の対象外
  where?: readonly string[];
};

export type Boundary = {
  initial: string;
  states: readonly string[];
  data?: Fields;
  queries?: Fields;
  commands?: Record<string, Fields>;
  formulas?: Fields;
  invariants?: readonly string[];
  actions: Record<string, ActionDeclaration>;
};

// 列挙は、その場に書くか `as const` を付けた配列でなければならない。
// 変数に取り出して `as const` を忘れると string[] に広がり、列挙の検査が効かなくなるため、型で拒否する
type NoWide<F> = {
  [K in keyof F]: F[K] extends readonly (infer Value)[]
    ? string extends Value
      ? "列挙は、その場に書くか as const を付けた配列で宣言してください"
      : F[K]
    : F[K];
};
type NoWideIn<Group> = { [K in keyof Group]: NoWide<Group[K]> };

// 同じ定義の中で検査する: initial と from は states に含まれること、列挙が広がっていないこと
type Checked<B extends Boundary> = B & {
  initial: B["states"][number];
  data?: NoWide<B["data"]>;
  queries?: NoWide<B["queries"]>;
  formulas?: NoWide<B["formulas"]>;
  commands?: NoWideIn<B["commands"]>;
  actions: {
    [Action in keyof B["actions"]]: {
      from?: readonly B["states"][number][];
      input?: NoWide<B["actions"][Action]["input"]>;
    };
  };
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

type Shape<F> = F extends Fields ? { -readonly [K in keyof F]: FieldType<F[K]> } : {};
type UnionToIntersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;

export type DataOf<B extends Boundary> = Shape<B["data"]>;
export type CommandsOf<B extends Boundary> =
  B["commands"] extends Record<string, Fields>
    ? { [Name in keyof B["commands"]]: { action: Name; payload: Shape<B["commands"][Name]> } }[keyof B["commands"]]
    : never;
type InputOf<B extends Boundary, Action extends keyof B["actions"]> = Shape<B["actions"][Action]["input"]>;

// 部品が覚えている状態: 状態名 (status) と、覚えているデータ（未設定があり得る）
export type StateOf<B extends Boundary> = { status: B["states"][number] } & Partial<DataOf<B>>;

// case が読めるデータ: 状態、問い合わせの答え、そのアクションの入力
export type ContextOf<B extends Boundary, Action extends keyof B["actions"]> = StateOf<B> &
  Shape<B["queries"]> &
  InputOf<B, Action>;

// 条件と計算が読めるデータ: どのアクションでも使われ得るので、入力はすべて省略可能
export type SpecContextOf<B extends Boundary> = StateOf<B> &
  Shape<B["queries"]> &
  Partial<UnionToIntersection<{ [Action in keyof B["actions"]]: InputOf<B, Action> }[keyof B["actions"]]>>;

// --- 遷移と case ---
export type TransitionSpec<B extends Boundary> = {
  event?: string;
  effects?: readonly CommandsOf<B>[];
  // 覚えるデータ。ここに書いたフィールドだけが更新される
  set?: Partial<DataOf<B>>;
};

export type Transition = {
  readonly nextState: string;
  readonly event?: string;
  readonly effects: readonly unknown[];
  readonly set?: object;
};

// state は現在のデータを読め、かつ状態名のコンストラクタで次状態を宣言できる。
export type StateHandle<B extends Boundary, Action extends keyof B["actions"]> = Readonly<ContextOf<B, Action>> & {
  readonly [Name in B["states"][number]]: (spec?: TransitionSpec<B>) => Transition;
};

export type Case<B extends Boundary, Action extends keyof B["actions"]> = (state: StateHandle<B, Action>) => Transition;

// アクションごとの case。「条件（自然言語）→ 遷移」の表で、決定表と同じく "default" が必須。
// 条件で分かれないアクションは、関数1つで書ける（default だけの表と同じ意味）
export type CasesOf<B extends Boundary> = {
  [Action in keyof B["actions"]]: Case<B, Action> | (Record<string, Case<B, Action>> & { default: Case<B, Action> });
};

export const COMPONENT = Symbol.for("aac.component");

export type Component<B extends Boundary, Cases> = B & { readonly behaviors: Cases };
export type ComponentBuilder<B extends Boundary> = B & {
  cases<const Cases extends CasesOf<B>>(cases: Cases): Component<B, Cases>;
};

export function defineComponent<const B extends Boundary>(boundary: Checked<B>): ComponentBuilder<B> {
  const declared = boundary as B;
  return {
    ...declared,
    cases(cases) {
      const component = { ...declared, behaviors: cases };
      Object.defineProperty(component, COMPONENT, { value: true });
      return component;
    },
  };
}

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

// 条件の名前は、事前条件 (where)・case のキー・決定表の行のすべてから集める。
// 結び付けの漏れも、どこにも使われていない条件（typo）も、コンパイルエラーになる
type WhereNames<B extends Boundary> = {
  [Action in keyof B["actions"]]: B["actions"][Action] extends { where: readonly (infer Name)[] } ? Name : never;
}[keyof B["actions"]];
type CaseNames<Cases> = {
  [Action in keyof Cases]: Cases[Action] extends (...args: never[]) => unknown ? never : Exclude<keyof Cases[Action], "default">;
}[keyof Cases];
type TableNames<Tables> = Exclude<{ [K in keyof Tables]: keyof Tables[K] }[keyof Tables], "default">;
export type ConditionNames<B extends Boundary, Cases, Tables> = (WhereNames<B> | CaseNames<Cases> | TableNames<Tables>) &
  string;

type Bindings<B extends Boundary, Cases, Tables> = {
  // このコンポーネントの case が使う決定表。行の条件が、結び付けるべき名前に加わる
  tables?: Tables;
  conditions: { [Name in ConditionNames<B, Cases, Tables>]: (state: SpecContextOf<B>) => boolean };
} & (B["formulas"] extends Fields
  ? { formulas: { [Name in keyof B["formulas"]]: (state: SpecContextOf<B>) => FieldType<B["formulas"][Name]> } }
  : { formulas?: never }) &
  (B["invariants"] extends readonly string[]
    ? { invariants: { [Name in B["invariants"][number]]: (state: StateOf<B>) => boolean } }
    : { invariants?: never });

function register<F>(kind: string, registry: Map<string, F>, entries: Record<string, F> | undefined) {
  for (const [name, fn] of Object.entries(entries ?? {})) {
    if (registry.has(name) && registry.get(name) !== fn) {
      throw new Error(`${kind} "${name}" が複数回、別の関数に結び付けられています（同じ文は1つの意味でなければなりません）`);
    }
    registry.set(name, fn);
  }
}

export function bindSpecification<B extends Boundary, Cases, const Tables extends Record<string, object> = {}>(
  _component: Component<B, Cases>,
  bindings: Bindings<B, Cases, Tables>,
) {
  register("条件", conditions, bindings.conditions as Record<string, Condition>);
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
export function applyFormula<B extends Boundary, Name extends keyof NonNullable<B["formulas"]> & string>(
  _component: B,
  name: Name,
  state: object,
): FieldType<NonNullable<B["formulas"]>[Name]> {
  const hook = (state as any)[ABSTRACT_FORMULA];
  if (typeof hook === "function") return hook(name);
  const formula = formulas.get(name);
  if (!formula) throw new UnboundNameError("計算", name);
  return formula(state) as FieldType<NonNullable<B["formulas"]>[Name]>;
}

// 具体値での実行用（PBT のモデル側）。context に無いプロパティは状態コンストラクタとして振る舞う。
// 未設定のデータも、値 undefined のキーとして context に含めること。
export function createState(context: object): any {
  return new Proxy(context, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop);
      return (spec: { event?: string; effects?: readonly unknown[]; set?: object } = {}): Transition => ({
        nextState: prop,
        ...(spec.event === undefined ? {} : { event: spec.event }),
        effects: spec.effects ?? [],
        ...(spec.set === undefined ? {} : { set: spec.set }),
      });
    },
  });
}
