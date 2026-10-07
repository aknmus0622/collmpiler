// 型の検査。実行するテストではなく、pnpm typecheck が通ること自体が確認になる:
// 誤った書き方には @ts-expect-error を付けてあり、エラーにならなくなると型チェックが失敗する。
import { bind, component, decisionTable, ref } from "../index.ts";

// ---- 決定表 ----
const Size = decisionTable({
  "It is big": { count: 10, label: "big", urgent: true, grade: "high" },
  otherwise: { count: 1, label: "small", urgent: false, grade: "none" },
});
// T1: otherwise が無い
// @ts-expect-error
decisionTable({ "It is big": { count: 10 } });
// T2: 行によって列が足りない
// @ts-expect-error
decisionTable({ "It is big": { count: 10 }, otherwise: { count: 1, label: "small" } });
// T3: 行によって列が余計にある
// @ts-expect-error
decisionTable({ "It is big": { count: 10, extra: 1 }, otherwise: { count: 1 } });
// T4: セルに値以外 (副作用など) は書けない
// @ts-expect-error
decisionTable({ otherwise: { effects: [{ action: "Refund" }] } });

// ---- コンポーネント ----
const base = {
  states: ["A", "B"],
  init: "A",
  data: { memo: "string", level: ["low", "high"] },
  queries: { flag: "boolean", mode: ["x", "y"] },
  effects: { Notify: { text: "string", count: "integer" }, Ping: {}, Grade: { level: ["low", "high"] } },
  decisions: { size: Size },
  calculations: { total: { is: "count times two", type: "integer" }, title: { is: "upper-cased memo", type: "string" } },
  invariants: ["Memo is set in B"],
} as const;
const stay = { then: { goTo: "A", does: "Nothing happens." } } as const;

const C = component({
  ...base,
  commands: {
    Go: {
      input: { note: "string", n: "integer" },
      from: ["A"],
      onlyIf: ["Flag is on"],
      when: {
        "Note is empty": { goTo: "A", does: "Nothing happens." },
        otherwise: { goTo: "B", does: "The memo is remembered and notifications are sent." },
      },
    },
    Back: { from: ["B"], then: { goTo: "A", does: "A ping is sent." } },
  },
});

// C1: init が states に無い
// @ts-expect-error
component({ ...base, init: "Z", commands: { Go: stay } });
// C2: from が states に無い
// @ts-expect-error
component({ ...base, commands: { Go: { from: ["Z"], then: { goTo: "A", does: "x" } } } });
// C3: goTo が states に無い
// @ts-expect-error
component({ ...base, commands: { Go: { then: { goTo: "Z", does: "x" } } } });
// C4: 文 (does) が無い
// @ts-expect-error
component({ ...base, commands: { Go: { then: { goTo: "A" } } } });
// C5: then も when も無い
// @ts-expect-error
component({ ...base, commands: { Go: { from: ["A"] } } });
// C6: when に otherwise が無い
// @ts-expect-error
component({ ...base, commands: { Go: { when: { "Flag is on": { goTo: "B", does: "x" } } } } });
// C7: コンポーネントに構造 (effects) は書けない
// @ts-expect-error
component({ ...base, commands: { Go: { then: { goTo: "A", does: "x", effects: [{ Ping: {} }] } } } });
// C8: キーの書き間違い
// @ts-expect-error
component({ ...base, commands: { Go: { alowedIn: ["A"], then: { goTo: "A", does: "x" } } } });

// ---- 結び付け ----
const conditions = {
  "It is big": () => true,     // 決定表の行
  "Flag is on": () => true,    // onlyIf
  "Note is empty": () => true, // when のキー
  "Mode is x": () => true,     // 副作用の when
};
const rest = { calculations: { total: () => 1, title: () => "t" }, invariants: { "Memo is set in B": () => true } };
const nothing = { "Note is empty": {}, otherwise: {} };

// 正しい書き方: 5種類の参照がすべて使える
bind(C, {
  commands: {
    Go: {
      "Note is empty": {},
      otherwise: {
        set: { memo: ref.input("note"), level: "high" },
        effects: [
          { Notify: { text: ref.data("memo"), count: ref.decision("size", "count") } },
          { Notify: { text: ref.calculation("title"), count: ref.calculation("total") }, when: "It is big" },
          { Notify: { text: ref.input("note"), count: ref.input("n") } },
          { Grade: { level: ref.data("level") } },
        ],
      },
    },
    Back: { effects: [{ Ping: {}, when: "Mode is x" }] },
  },
  conditions,
  ...rest,
});

const B1 = { conditions: { "It is big": () => true, "Flag is on": () => true, "Note is empty": () => true }, ...rest };

// B1: コマンドの構造の抜け
// @ts-expect-error
bind(C, { commands: { Go: nothing }, ...B1 });
// B2: 余計なコマンド
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: {}, Jump: {} }, ...B1 });
// B3: when の条件の抜け (otherwise が無い)
// @ts-expect-error
bind(C, { commands: { Go: { "Note is empty": {} }, Back: {} }, ...B1 });
// B4: when に無い条件
// @ts-expect-error
bind(C, { commands: { Go: { ...nothing, "Note is long": {} }, Back: {} }, ...B1 });
// B5: 遷移先は結び付けには書けない (コンポーネントの goTo)
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { goTo: "A" } }, ...B1 });
// B6: effects に無い副作用
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Refund: {} }] } }, ...B1 });
// B7: 副作用に無いフィールド
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Ping: { extra: 1 } }] } }, ...B1 });
// B8: 副作用のフィールドが足りない
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: "x" } }] } }, ...B1 });
// B9: 値の型が違う
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: 1, count: 1 } }] } }, ...B1 });
// B10: 存在しない決定表
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: "x", count: ref.decision("weight", "count") } }] } }, ...B1 });
// B11: 存在しない列
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: "x", count: ref.decision("size", "amount") } }] } }, ...B1 });
// B12: 列の型が合わない (真偽値の列を、整数のフィールドに)
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: "x", count: ref.decision("size", "urgent") } }] } }, ...B1 });
// B13: 列の値が、渡す先の列挙に収まらない ("none" は level に無い)
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Grade: { level: ref.decision("size", "grade") } }] } }, ...B1 });
// B14: 存在しない計算 / 型の合わない計算
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: "x", count: ref.calculation("sum") } }] } }, ...B1 });
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Notify: { text: "x", count: ref.calculation("title") } }] } }, ...B1 });
// B15: 他のコマンドの入力 (note は Go の入力)
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { set: { memo: ref.input("note") } } }, ...B1 });
// B16: data に無いデータ / 型違い
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { set: { nickname: "x" } } }, ...B1 });
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { set: { memo: 1 } } }, ...B1 });
// B17: 列挙どうしでも値の集合が違えば使えない
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Grade: { level: ref.query("mode") } }] } }, ...B1 });

// ---- 条件の結び付け ----
const full = { Go: nothing, Back: { effects: [{ Ping: {}, when: "Mode is x" }] } } as const;
const without = <K extends keyof typeof conditions>(key: K) => {
  const { [key]: _, ...others } = conditions;
  return others as Omit<typeof conditions, K>;
};
bind(C, { commands: full, conditions, ...rest });
// M1: 決定表の行の漏れ
// @ts-expect-error
bind(C, { commands: full, conditions: without("It is big"), ...rest });
// M2: onlyIf の漏れ
// @ts-expect-error
bind(C, { commands: full, conditions: without("Flag is on"), ...rest });
// M3: when のキーの漏れ
// @ts-expect-error
bind(C, { commands: full, conditions: without("Note is empty"), ...rest });
// M4: 副作用の when の漏れ (結び付けの構造の中で使った条件)
// @ts-expect-error
bind(C, { commands: full, conditions: without("Mode is x"), ...rest });
bind(C, {
  commands: full,
  conditions: {
    ...conditions,
    // M5: どこにも使われていない条件
    // @ts-expect-error
    "Flag is onn": () => true,
  },
  ...rest,
});
// M6: 計算の漏れ / 戻り値の型違い
// @ts-expect-error
bind(C, { commands: full, conditions, calculations: { total: () => 1 }, invariants: rest.invariants });
// @ts-expect-error
bind(C, { commands: full, conditions, calculations: { total: () => "x", title: () => "t" }, invariants: rest.invariants });
// M7: 不変条件の漏れ
// @ts-expect-error
bind(C, { commands: full, conditions, calculations: rest.calculations });
bind(C, {
  commands: full,
  conditions: {
    ...conditions,
    // M8: 評価関数の中のフィールド名の typo
    // @ts-expect-error
    "Flag is on": (s) => s.flga,
  },
  ...rest,
});

// ---- 副作用の when: 文のほかに、真偽値の参照を書ける ----
bind(C, {
  commands: {
    Go: nothing,
    Back: { effects: [{ Ping: {}, when: ref.decision("size", "urgent") }, { Ping: {}, when: ref.query("flag") }, { Ping: {}, when: ref.was("B") }] },
  },
  conditions: { "It is big": () => true, "Flag is on": () => true, "Note is empty": () => true },
  ...rest,
});
// W1: when に真偽値でない参照
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Ping: {}, when: ref.decision("size", "count") }] } }, ...B1 });
// W2: was に存在しない状態
// @ts-expect-error
bind(C, { commands: { Go: nothing, Back: { effects: [{ Ping: {}, when: ref.was("Z") }] } }, ...B1 });

// ---- 列挙の広がり ----
const Loose = ["low", "high"];
// E1: 変数に取り出して as const を忘れた配列 (string[] に広がる) は拒否される
// @ts-expect-error
component({ states: ["A"], init: "A", data: { level: Loose }, commands: { Go: { then: { goTo: "A", does: "x" } } } });
// @ts-expect-error
component({ states: ["A"], init: "A", commands: { Go: { input: { level: Loose }, then: { goTo: "A", does: "x" } } } });

// ---- 添付資料 ----
import { dir, file, text } from "../index.ts";
component({
  states: ["A"],
  init: "A",
  assets: [file("docs/architecture.md"), dir("docs/conventions"), text("Adapters are named *Gateway.", { phases: ["wiring"] })],
  commands: { Go: { then: { goTo: "A", does: "x" } } },
});
// A1: 存在しない段階
// @ts-expect-error
file("x.md", { phases: ["review"] });
// A2: 包まずに文字列を並べることはできない
// @ts-expect-error
component({ states: ["A"], init: "A", assets: ["docs/architecture.md"], commands: { Go: { then: { goTo: "A", does: "x" } } } });

// ---- 決定表の、値の無いセル (null) ----
const Sparse = decisionTable({ "It is big": { count: 10, note: "x" }, otherwise: { count: 1, note: null } });
const D = component({
  states: ["A"],
  init: "A",
  effects: { Ping: { count: "integer", note: "string" } },
  decisions: { sparse: Sparse },
  commands: { Go: { then: { goTo: "A", does: "x" } } },
});
// null を含む列も、値のある行の型で参照できる
bind(D, {
  commands: { Go: { effects: [{ Ping: { count: ref.decision("sparse", "count"), note: ref.decision("sparse", "note") } }] } },
  conditions: { "It is big": () => true },
});
// N1: 型の合わないフィールドには渡せない (note は文字列)
bind(D, {
  // @ts-expect-error
  commands: { Go: { effects: [{ Ping: { count: ref.decision("sparse", "note"), note: "y" } }] } },
  conditions: { "It is big": () => true },
});
// N2: 行ごとに列をそろえる規則は変わらない (書かないのではなく、null と書く)
// @ts-expect-error
decisionTable({ "It is big": { count: 10, note: "x" }, otherwise: { count: 1 } });
