// 型の検査。誤った書き方が、型エラーになることを確かめる。
// 実行するテストではなく、pnpm typecheck が通ること自体が確認になる（エラーにならなければ @ts-expect-error が落ちる）。
import { asks, component, compose, decisionTable, description, does, from, goTo, input, interpretation, otherwise, output, ref, typed, when } from "../index.ts";

const Size = decisionTable({ "It is big": { count: 10, label: null }, otherwise: { count: 1, label: "small" } });

// ── Layer 1 ──
// E1: states にない状態 (init / from / goTo)
// @ts-expect-error
component({ states: ["A", "B"], init: "C", commands: {} });
component({
  states: ["A", "B"],
  init: "A",
  commands: {
    // @ts-expect-error
    Go: compose(from("Z"), goTo("B")),
    // @ts-expect-error
    Back: compose(from("B"), goTo("Y")),
    // @ts-expect-error
    Split: compose(when("It is big", goTo("X")), otherwise(goTo("A"))),
  },
});
// E2: 知らないキー
// @ts-expect-error
component({ states: ["A"], init: "A", comands: {} });
// E3: as const を忘れた列挙
const wide = ["x", "y"];
// @ts-expect-error
typed(wide);
// @ts-expect-error
output(wide);
// @ts-expect-error
input({ kind: wide });
// E4: when の中に書けるのは goTo と does だけ
// @ts-expect-error
when("It is big", from("A"));

// ── 解釈 ──
const Thing = component({
  states: ["A", "B"],
  init: "A",
  data: { total: typed("integer"), name: typed("string") },
  queries: { ready: output("boolean"), limitOf: compose(input({ who: "string" }), output("integer")) },
  effects: { Notify: input({ count: "integer" }) },
  decisions: { size: Size },
  calculations: { doubled: description("twice the amount") },
  invariants: ["The total is never negative"],
  commands: {
    Place: compose(input({ amount: "integer" }), from("A"), when("It is ready", goTo("B"), does("It is placed.")), otherwise(does("Nothing."))),
    Rest: description("Nothing happens."),
  },
});
const meanings = {
  conditions: { "It is big": () => true, "It is ready": () => true },
  calculations: { doubled: () => 0 },
  invariants: { "The total is never negative": () => true },
};
const structure = { calculations: { doubled: { output: "integer" } }, commands: { Place: { when: { "It is ready": {}, otherwise: {} } }, Rest: {} } } as const;
interpretation(Thing, { structure, meanings });

// E5: 意味の漏れと、使われていない名前
// @ts-expect-error
interpretation(Thing, { structure, meanings: { ...meanings, conditions: { "It is big": () => true } } });
// @ts-expect-error
interpretation(Thing, { structure, meanings: { ...meanings, conditions: { ...meanings.conditions, "It is redy": () => true } } });
// @ts-expect-error
interpretation(Thing, { structure, meanings: { conditions: meanings.conditions, invariants: meanings.invariants } });

// E6: 構造の誤り
interpretation(Thing, {
  structure: {
    calculations: { doubled: { output: "integer" } },
    commands: {
      Place: {
        when: {
          "It is ready": {
            effects: [
              // 知らない副作用
              // @ts-expect-error
              { Notfy: { count: 1 } },
              // 型の合わない値
              // @ts-expect-error
              { Notify: { count: "many" } },
              // 型の合わない参照（文字列のデータを整数に）
              // @ts-expect-error
              { Notify: { count: ref.data("name") } },
              // ほかのコマンドには無い入力ではなく、このコマンドの入力は使える
              { Notify: { count: ref.input("amount") } },
              // null を除いた型で合う列は使える
              { Notify: { count: ref.decision("size", "count") }, when: ref.query("ready") },
            ],
            // data にないフィールド
            // @ts-expect-error
            set: { totl: 1 },
          },
          otherwise: {
            // states にない遷移先
            // @ts-expect-error
            goTo: "Z",
          },
        },
      },
      Rest: {
        asks: {
          limit: { limitOf: { who: ref.data("name") } },
          // 知らない問い合わせ
          // @ts-expect-error
          other: { limitOff: { who: "x" } },
          // 型の合わない引数
          // @ts-expect-error
          wrong: { limitOf: { who: 1 } },
        },
        // 尋ねた答えは、付けた名前で指せる（型も合う）
        effects: [{ Notify: { count: ref.query("limit") } }],
        // 引数つきの問い合わせは、尋ねずには読めない。このコマンドには無い入力も使えない
        // @ts-expect-error
        set: { total: ref.query("limitOf"), name: ref.input("amount") },
      },
    },
  },
  meanings,
});
// E7: 知らないキー
interpretation(Thing, {
  structure: {
    calculations: { doubled: { output: "integer" } },
    commands: { Place: { when: { "It is ready": {}, otherwise: {} } }, Rest: {} },
    // @ts-expect-error
    comands: {},
  },
  meanings,
});
// E8: 意味の関数は、宣言した名前だけを読める
interpretation(Thing, {
  structure,
  meanings: {
    ...meanings,
    conditions: {
      "It is big": (state) => (state.amount ?? 0) > 10 && state.ready && state.status === "A",
      // @ts-expect-error
      "It is ready": (state) => state.redy,
    },
  },
});
