// 型の検査。実行するテストではなく、pnpm typecheck が通ること自体が確認になる:
// 誤った書き方には @ts-expect-error を付けてあり、エラーにならなくなると型チェックが失敗する。
import { asked, bind, calculated, component, decided, decisionTable, given, remembered } from "../index.ts";

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
// T4: セルに値以外 (指示など) は書けない
// @ts-expect-error
decisionTable({ otherwise: { effects: [{ action: "Refund" }] } });

// ---- コンポーネント ----
const base = {
  states: ["A", "B"],
  startsIn: "A",
  remembers: { memo: "string", level: ["low", "high"] },
  asks: { flag: "boolean", mode: ["x", "y"] },
  tells: { Notify: { text: "string", count: "integer" }, Ping: {}, Grade: { level: ["low", "high"] } },
  decisions: { size: Size },
  calculations: { total: { is: "count times two", type: "integer" }, title: { is: "upper-cased memo", type: "string" } },
  alwaysTrue: ["Memo is set in B"],
} as const;
const stay = { then: { goTo: "A", does: "Nothing happens." } } as const;

const C = component({
  ...base,
  actions: {
    Go: {
      takes: { note: "string", n: "integer" },
      allowedIn: ["A"],
      onlyIf: ["Flag is on"],
      when: {
        "Note is empty": { goTo: "A", does: "Nothing happens." },
        otherwise: { goTo: "B", does: "The memo is remembered and notifications are sent." },
      },
    },
    Back: { allowedIn: ["B"], then: { goTo: "A", does: "A ping is sent." } },
  },
});

// C1: startsIn が states に無い
// @ts-expect-error
component({ ...base, startsIn: "Z", actions: { Go: stay } });
// C2: allowedIn が states に無い
// @ts-expect-error
component({ ...base, actions: { Go: { allowedIn: ["Z"], then: { goTo: "A", does: "x" } } } });
// C3: goTo が states に無い
// @ts-expect-error
component({ ...base, actions: { Go: { then: { goTo: "Z", does: "x" } } } });
// C4: 文 (does) が無い
// @ts-expect-error
component({ ...base, actions: { Go: { then: { goTo: "A" } } } });
// C5: then も when も無い
// @ts-expect-error
component({ ...base, actions: { Go: { allowedIn: ["A"] } } });
// C6: when に otherwise が無い
// @ts-expect-error
component({ ...base, actions: { Go: { when: { "Flag is on": { goTo: "B", does: "x" } } } } });
// C7: コンポーネントに構造 (tell) は書けない
// @ts-expect-error
component({ ...base, actions: { Go: { then: { goTo: "A", does: "x", tell: [{ Ping: {} }] } } } });
// C8: キーの書き間違い
// @ts-expect-error
component({ ...base, actions: { Go: { alowedIn: ["A"], then: { goTo: "A", does: "x" } } } });

// ---- 結び付け ----
const conditions = {
  "It is big": () => true,     // 決定表の行
  "Flag is on": () => true,    // onlyIf
  "Note is empty": () => true, // when のキー
  "Mode is x": () => true,     // 指示の when
};
const rest = { calculations: { total: () => 1, title: () => "t" }, alwaysTrue: { "Memo is set in B": () => true } };
const nothing = { "Note is empty": {}, otherwise: {} };

// 正しい書き方: 5種類の参照がすべて使える
bind(C, {
  actions: {
    Go: {
      "Note is empty": {},
      otherwise: {
        remember: { memo: given("note"), level: "high" },
        tell: [
          { Notify: { text: remembered("memo"), count: decided("size", "count") } },
          { Notify: { text: calculated("title"), count: calculated("total") }, when: "It is big" },
          { Notify: { text: given("note"), count: given("n") } },
          { Grade: { level: remembered("level") } },
        ],
      },
    },
    Back: { tell: [{ Ping: {}, when: "Mode is x" }] },
  },
  conditions,
  ...rest,
});
void asked;

const B1 = { conditions: { "It is big": () => true, "Flag is on": () => true, "Note is empty": () => true }, ...rest };

// B1: アクションの構造の抜け
// @ts-expect-error
bind(C, { actions: { Go: nothing }, ...B1 });
// B2: 余計なアクション
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: {}, Jump: {} }, ...B1 });
// B3: when の条件の抜け (otherwise が無い)
// @ts-expect-error
bind(C, { actions: { Go: { "Note is empty": {} }, Back: {} }, ...B1 });
// B4: when に無い条件
// @ts-expect-error
bind(C, { actions: { Go: { ...nothing, "Note is long": {} }, Back: {} }, ...B1 });
// B5: 遷移先は結び付けには書けない (コンポーネントの goTo)
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { goTo: "A" } }, ...B1 });
// B6: tells に無い指示
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Refund: {} }] } }, ...B1 });
// B7: 指示に無いフィールド
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Ping: { extra: 1 } }] } }, ...B1 });
// B8: 指示のフィールドが足りない
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: "x" } }] } }, ...B1 });
// B9: 値の型が違う
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: 1, count: 1 } }] } }, ...B1 });
// B10: 存在しない決定表
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: "x", count: decided("weight", "count") } }] } }, ...B1 });
// B11: 存在しない列
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: "x", count: decided("size", "amount") } }] } }, ...B1 });
// B12: 列の型が合わない (真偽値の列を、整数のフィールドに)
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: "x", count: decided("size", "urgent") } }] } }, ...B1 });
// B13: 列の値が、渡す先の列挙に収まらない ("none" は level に無い)
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Grade: { level: decided("size", "grade") } }] } }, ...B1 });
// B14: 存在しない計算 / 型の合わない計算
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: "x", count: calculated("sum") } }] } }, ...B1 });
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Notify: { text: "x", count: calculated("title") } }] } }, ...B1 });
// B15: 他のアクションの入力 (note は Go の入力)
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { remember: { memo: given("note") } } }, ...B1 });
// B16: remembers に無いデータ / 型違い
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { remember: { nickname: "x" } } }, ...B1 });
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { remember: { memo: 1 } } }, ...B1 });
// B17: 列挙どうしでも値の集合が違えば使えない
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Grade: { level: asked("mode") } }] } }, ...B1 });

// ---- 条件の結び付け ----
const full = { Go: nothing, Back: { tell: [{ Ping: {}, when: "Mode is x" }] } } as const;
const without = <K extends keyof typeof conditions>(key: K) => {
  const { [key]: _, ...others } = conditions;
  return others as Omit<typeof conditions, K>;
};
bind(C, { actions: full, conditions, ...rest });
// M1: 決定表の行の漏れ
// @ts-expect-error
bind(C, { actions: full, conditions: without("It is big"), ...rest });
// M2: onlyIf の漏れ
// @ts-expect-error
bind(C, { actions: full, conditions: without("Flag is on"), ...rest });
// M3: when のキーの漏れ
// @ts-expect-error
bind(C, { actions: full, conditions: without("Note is empty"), ...rest });
// M4: 指示の when の漏れ (結び付けの構造の中で使った条件)
// @ts-expect-error
bind(C, { actions: full, conditions: without("Mode is x"), ...rest });
bind(C, {
  actions: full,
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
bind(C, { actions: full, conditions, calculations: { total: () => 1 }, alwaysTrue: rest.alwaysTrue });
// @ts-expect-error
bind(C, { actions: full, conditions, calculations: { total: () => "x", title: () => "t" }, alwaysTrue: rest.alwaysTrue });
// M7: 不変条件の漏れ
// @ts-expect-error
bind(C, { actions: full, conditions, calculations: rest.calculations });
bind(C, {
  actions: full,
  conditions: {
    ...conditions,
    // M8: 評価関数の中のフィールド名の typo
    // @ts-expect-error
    "Flag is on": (s) => s.flga,
  },
  ...rest,
});

// ---- 指示の when: 文のほかに、真偽値の参照を書ける ----
import { was } from "../index.ts";
bind(C, {
  actions: {
    Go: nothing,
    Back: { tell: [{ Ping: {}, when: decided("size", "urgent") }, { Ping: {}, when: asked("flag") }, { Ping: {}, when: was("B") }] },
  },
  conditions: { "It is big": () => true, "Flag is on": () => true, "Note is empty": () => true },
  ...rest,
});
// W1: when に真偽値でない参照
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Ping: {}, when: decided("size", "count") }] } }, ...B1 });
// W2: was に存在しない状態
// @ts-expect-error
bind(C, { actions: { Go: nothing, Back: { tell: [{ Ping: {}, when: was("Z") }] } }, ...B1 });

// ---- 列挙の広がり ----
const Loose = ["low", "high"];
// E1: 変数に取り出して as const を忘れた配列 (string[] に広がる) は拒否される
// @ts-expect-error
component({ states: ["A"], startsIn: "A", remembers: { level: Loose }, actions: { Go: { then: { goTo: "A", does: "x" } } } });
// @ts-expect-error
component({ states: ["A"], startsIn: "A", actions: { Go: { takes: { level: Loose }, then: { goTo: "A", does: "x" } } } });

// ---- 添付資料 ----
import { dir, file, text } from "../index.ts";
component({
  states: ["A"],
  startsIn: "A",
  assets: [file("docs/architecture.md"), dir("docs/conventions"), text("Adapters are named *Gateway.", { phases: ["wiring"] })],
  actions: { Go: { then: { goTo: "A", does: "x" } } },
});
// A1: 存在しない段階
// @ts-expect-error
file("x.md", { phases: ["review"] });
// A2: 包まずに文字列を並べることはできない
// @ts-expect-error
component({ states: ["A"], startsIn: "A", assets: ["docs/architecture.md"], actions: { Go: { then: { goTo: "A", does: "x" } } } });
