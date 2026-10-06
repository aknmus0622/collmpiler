import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDecision, bindSpecification, defineComponent } from "@aac/core";
import { extract } from "../src/extract.ts";
import { lintCase } from "../src/lint.ts";

const Rules = { "default": { discount: 0, effects: [] } } as const;
// 下の extract のテストで使う条件を結び付けるための最小のコンポーネント
const Tiny = defineComponent({ initial: "A", states: ["A"], actions: { Go: {} } }).cases({
  Go: { "変数を使い回す場合": (state) => state.A(), "フォールバックを書く場合": (state) => state.A(), default: (state) => state.A() },
});
bindSpecification(Tiny, { conditions: { "変数を使い回す場合": () => false, "フォールバックを書く場合": () => false } });
const receipt = (discount: unknown) => ({ action: "SendReceipt", payload: { discount } });

const token = (fn: (state: any) => unknown) => lintCase(fn.toString())?.token;

test("許可: SPEC.md の例の形 (const / return / 参照 / 呼び出し / スプレッド / コメント)", () => {
  assert.equal(
    token((state) => {
      // 表データ(DMN)を適用し、その結果をマッピングするのみ
      const campaign = applyDecision(Rules, state);
      /* 記号 === ? || はコメントや文字列の中なら構わない */
      return state.PAID({
        event: "決済完了 (a === b ? 1 : 2)",
        effects: [receipt(campaign.discount), ...campaign.effects, { action: "Audit", payload: { rate: 0.5 } }],
      });
    }),
    undefined,
  );
});

test("許可: 式本体のアロー関数、分割代入、型注釈 (実行時には消えている)", () => {
  assert.equal(token((state) => state.PAID()), undefined);
  assert.equal(
    token((state: { PAID: (spec: object) => unknown }) => {
      const { discount, effects } = applyDecision(Rules, state) as { discount: number; effects: readonly unknown[] };
      return state.PAID({ effects: [receipt(discount), ...effects] });
    }),
    undefined,
  );
});

test("禁止: 分岐", () => {
  assert.equal(token((state) => { if (state.rank === "Gold") return state.VIP(); return state.PAID(); }), "if");
  assert.equal(token((state) => (state.isMonthEnd ? state.VIP() : state.PAID())), "?");
  assert.equal(token((state) => state.PAID({ event: state.rank === "Gold" })), "===");
  assert.equal(token((state) => state.PAID({ event: state.a || "x" })), "||");
  assert.equal(token((state) => state.PAID({ event: state.a && "x" })), "&&");
  assert.equal(token((state) => state.PAID({ event: state.a ?? "x" })), "??");
  assert.equal(token((state) => state.PAID({ event: !state.a })), "!");
  assert.equal(token((state) => state.PAID({ event: state.a?.b })), "?");
  assert.equal(token((state) => { switch (state.rank) { default: return state.PAID(); } }), "switch");
});

test("禁止: 演算・文字列連結", () => {
  assert.equal(token((state) => state.PAID({ event: state.amount * 2 })), "*");
  assert.equal(token((state) => state.PAID({ event: state.amount > 100 })), ">");
  assert.equal(token((state) => state.PAID({ event: "a" + state.name })), "+");
  assert.equal(token((state) => state.PAID({ event: `割引 ${state.amount}` })), "${");
  assert.equal(token((state) => state.PAID({ event: `埋め込みなしは可` })), undefined);
});

test("禁止: 既定値 (?? と同じく無警告でフォールバックを失う)", () => {
  assert.equal(token((state) => { const { discount = 0.5 } = state; return state.PAID({ event: discount }); }), "=");
  assert.equal(token((state = {}) => state.PAID()), "=");
});

test("禁止: 非同期・ループ・例外・再代入", () => {
  assert.equal(token(async (state) => state.PAID()), "async");
  assert.equal(token((state) => { for (;;) return state.PAID(); }), "for");
  assert.equal(token((state) => { try { return state.PAID(); } finally {} }), "try");
  assert.equal(token((state) => { let x = state.a; return state.PAID({ event: x }); }), "let");
});

test("extract: Proxy 単体では盲点だった書き方が forbidden-syntax エラーになり、IR に載らない", async () => {
  const behaviors = {
    B: {
      cases: {
        "変数を使い回す場合": (state: any) => {
          const discount = applyDecision(Rules, state).discount;
          if (discount === 0) return state.FREE();
          return state.PAID({ effects: [receipt(discount)] });
        },
        "フォールバックを書く場合": (state: any) => state.PAID({ effects: [receipt(applyDecision(Rules, state).discount ?? 0.5)] }),
        default: (state: any) => state.PAID({ effects: [receipt(applyDecision(Rules, state).discount)] }),
      },
    },
  };
  const { ir, diagnostics } = await extract({ behaviors, tables: { Rules } });
  assert.deepEqual(
    diagnostics.map((d) => `${d.case}:${d.code}`).sort(),
    ["フォールバックを書く場合:forbidden-syntax", "変数を使い回す場合:forbidden-syntax"],
  );
  assert.match(diagnostics.find((d) => d.case === "変数を使い回す場合")!.message, /3 行目 `if`/);
  assert.deepEqual(Object.keys(ir.behaviors[0].transitions), ["default"]);
});
