// 型の検査。実行するテストではなく、tsc が通ること自体が確認になる:
// 誤った書き方には @ts-expect-error を付けてあり、エラーにならなくなると tsc が失敗する。
import { applyDecision, applyFormula, bindSpecification, defineComponent, dir, file, text } from "../index.ts";
import type { CommandsOf, DecisionTable } from "../index.ts";

const base = {
  initial: "A",
  states: ["A", "B"],
  data: { memo: "string" },
  queries: { flag: "boolean" },
  commands: { Notify: { text: "string" } },
  formulas: { "Total": "integer" },
  invariants: ["Memo is set in B"],
} as const;

// ---- 境界の誤り ----
// N1: initial が states に無い
// @ts-expect-error
defineComponent({ ...base, initial: "Z", actions: {} });
// N2: from が states に無い
// @ts-expect-error
defineComponent({ ...base, actions: { Go: { from: ["Z"] } } });
// N3: フィールドの型が不正
// @ts-expect-error
defineComponent({ ...base, data: { memo: "text" }, actions: {} });

const B = defineComponent({
  ...base,
  actions: {
    Go: { input: { note: "string" }, from: ["A"], where: ["Flag is on"] },
    Back: { from: ["B"] },
  },
});

// ---- case の誤り ----
// N4: アクションの不足
// @ts-expect-error
B.cases({ Go: (s) => s.B() });
// N5: 余計なアクション
// @ts-expect-error
B.cases({ Go: (s) => s.B(), Back: (s) => s.A(), Jump: (s) => s.A() });
// N6: default の無い表
// @ts-expect-error
B.cases({ Go: { "Some condition": (s) => s.B() }, Back: (s) => s.A() });
B.cases({
  // N7: 存在しない状態への遷移
  // @ts-expect-error
  Go: (s) => s.C(),
  // N8: 他のアクションの入力は読めない
  // @ts-expect-error
  Back: (s) => s.A({ set: { memo: s.note } }),
});
B.cases({
  // N9: data に無いフィールドの set
  // @ts-expect-error
  Go: (s) => s.B({ set: { nickname: "x" } }),
  // N10: 許可されていない指示
  // @ts-expect-error
  Back: (s) => s.A({ effects: [{ action: "Refund", payload: {} }] }),
});
B.cases({
  // N11: 指示の payload の型違い
  // @ts-expect-error
  Go: (s) => s.B({ effects: [{ action: "Notify", payload: { text: 1 } }] }),
  // N12: 存在しない計算
  // @ts-expect-error
  Back: (s) => s.A({ effects: [{ action: "Notify", payload: { text: String(applyFormula(B, "Subtotal", s)) } }] }),
});
B.cases({
  // N13: async な case
  // @ts-expect-error
  Go: async (s) => s.B(),
  // N14: 覚えたデータは未設定があり得る (string | undefined を string に入れられない)
  // @ts-expect-error
  Back: (s) => s.A({ effects: [{ action: "Notify", payload: { text: s.memo } }] }),
});

// ---- 決定表の誤り ----
type Cmd = CommandsOf<typeof B>;
// N15: 表のセルに許可されていない指示
// @ts-expect-error
const Bad = { default: { effects: [{ action: "Refund", payload: {} }] } } as const satisfies DecisionTable<{ effects: Cmd[] }>;
void Bad;
const Rules = { "Memo is long": { text: "long" }, default: { text: "short" } } as const satisfies DecisionTable<{ text: string }>;

const C = B.cases({
  Go: {
    "Note is empty": (s) => s.A(),
    default: (s) => s.B({ set: { memo: s.note }, effects: [{ action: "Notify", payload: { text: applyDecision(Rules, s).text } }] }),
  },
  Back: (s) => s.A(),
});

// ---- 結び付けの誤り ----
const ok = {
  "Flag is on": (s: { flag: boolean }) => s.flag,           // where
  "Note is empty": (s: { note?: string }) => s.note === "", // case のキー
  "Memo is long": (s: { memo?: string }) => (s.memo ?? "").length > 10, // 決定表の行
};
const rest = { formulas: { "Total": () => 1 }, invariants: { "Memo is set in B": () => true } };
bindSpecification(C, { tables: { Rules }, conditions: ok, ...rest }); // 正しい

// N16: 事前条件 (where) の結び付け漏れ
// @ts-expect-error
bindSpecification(C, { tables: { Rules }, conditions: { "Note is empty": ok["Note is empty"], "Memo is long": ok["Memo is long"] }, ...rest });
// N17: case のキーの結び付け漏れ
// @ts-expect-error
bindSpecification(C, { tables: { Rules }, conditions: { "Flag is on": ok["Flag is on"], "Memo is long": ok["Memo is long"] }, ...rest });
// N18: 決定表の行の結び付け漏れ
// @ts-expect-error
bindSpecification(C, { tables: { Rules }, conditions: { "Flag is on": ok["Flag is on"], "Note is empty": ok["Note is empty"] }, ...rest });
bindSpecification(C, {
  tables: { Rules },
  conditions: {
    ...ok,
    // N19: どこにも使われていない条件 (typo の検出)
    // @ts-expect-error
    "Flag is onn": () => true,
  },
  ...rest,
});
bindSpecification(C, {
  tables: { Rules },
  conditions: {
    ...ok,
    // N20: 評価関数の中のフィールド名の typo
    // @ts-expect-error
    "Flag is on": (s) => s.flga,
  },
  ...rest,
});
// N21: 計算の結び付け漏れ
// @ts-expect-error
bindSpecification(C, { tables: { Rules }, conditions: ok, invariants: rest.invariants });
// N22: 計算の戻り値の型違い
// @ts-expect-error
bindSpecification(C, { tables: { Rules }, conditions: ok, formulas: { "Total": () => "x" }, invariants: rest.invariants });
// N23: 不変条件の結び付け漏れ
// @ts-expect-error
bindSpecification(C, { tables: { Rules }, conditions: ok, formulas: rest.formulas });
// N24: case を取り付ける前の境界は結び付けられない
// @ts-expect-error
bindSpecification(B, { conditions: ok, ...rest });

// ---- 列挙の広がり ----
const Loose = ["Gold", "Silver"];
const Strict = ["Gold", "Silver"] as const;
// N25: 変数に取り出して as const を忘れた配列 (string[] に広がる) は拒否される
// @ts-expect-error
defineComponent({ initial: "A", states: ["A"], data: { rank: Loose }, actions: {} });
// @ts-expect-error
defineComponent({ initial: "A", states: ["A"], actions: { Go: { input: { rank: Loose } } } });
// @ts-expect-error
defineComponent({ initial: "A", states: ["A"], commands: { Notify: { rank: Loose } }, actions: {} });
// as const を付けた定数と、その場に書いた配列は列挙のまま使える
const Enums = defineComponent({ initial: "A", states: ["A"], data: { strict: Strict, inline: ["x", "y"] }, actions: { Go: {} } });
Enums.cases({
  // N26: 列挙に無い値は set できない
  // @ts-expect-error
  Go: (s) => s.A({ set: { strict: "Platinum" } }),
});
Enums.cases({
  // @ts-expect-error
  Go: (s) => s.A({ set: { inline: "z" } }),
});

// ---- 添付資料 ----
// file / dir / text で包んで並べる。第2引数で渡す段階を指定できる
defineComponent({
  initial: "A",
  states: ["A"],
  assets: [
    file("docs/architecture.md"),
    dir("docs/conventions"),
    text("Adapters are named *Gateway.", { phases: ["wiring"] }),
    file("docs/glossary.md", { phases: ["design", "implementation"] }),
  ],
  actions: {},
});
// N27: 存在しない段階
// @ts-expect-error
file("x.md", { phases: ["review"] });
// N28: 包まずに文字列を並べることはできない（パスなのか文言なのか区別がつかないため）
// @ts-expect-error
defineComponent({ initial: "A", states: ["A"], assets: ["docs/architecture.md"], actions: {} });
