import assert from "node:assert/strict";
import { test } from "node:test";
import { applyDecision, bindSpecification, defineBehaviors } from "@aac/core";
import { extract, stableStringify } from "../src/extract.ts";
import type { ExtractOptions } from "../src/extract.ts";

// レコーディング Proxy がどこまで通り、どこで破綻するかの記録。
// 各テストは「現在の挙動」を固定する。run() は構文制限 (lint) を外した Proxy 単体の挙動で、
// "盲点" と付いたものは Proxy だけでは誤った IR が無警告で出るケース。
// それらを lint が塞ぐことは lint.test.ts で確認している。

const Rules = {
  "ゴールドの場合": { discount: 0.2, effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }] },
  "default": { discount: 0, effects: [] },
} as const;

const Model = { initial: "A", states: ["A"], data: {}, actions: {}, queries: {}, commands: {} } as const;
bindSpecification(Model, { conditions: { "ゴールドの場合": (state) => (state as { rank?: string }).rank === "Gold" } });

async function run(caseFn: (state: any) => unknown, options?: ExtractOptions) {
  const behaviors = defineBehaviors({ B: { cases: { default: caseFn as any } } });
  const { ir, diagnostics } = await extract({ behaviors, tables: { Rules } }, { lint: false, ...options });
  return {
    transition: ir.behaviors[0].transitions.default as any,
    codes: diagnostics.map((d) => `${d.severity}:${d.code}`),
    messages: diagnostics.map((d) => d.message),
  };
}

const receipt = (discount: unknown) => ({ action: "SendReceipt", payload: { discount } });

test("通る: 表の値の参照と配列スプレッド", async () => {
  const r = await run((state) => {
    const campaign = applyDecision(Rules, state);
    return state.PAID({ event: "決済完了", effects: [receipt(campaign.discount), ...campaign.effects] });
  });
  assert.deepEqual(r.codes, []);
  assert.deepEqual(r.transition, {
    nextState: "PAID",
    event: "決済完了",
    emittedCommands: [
      {
        action: "SendReceipt",
        payload: { discount: { $ref: "decision:Rules.discount" } },
        payloadSchema: { discount: "number" },
      },
      { $spread: "decision:Rules.effects" },
    ],
  });
});

test("通る: 表の結果のオブジェクトスプレッド (列が既知なので列挙できる)", async () => {
  const r = await run((state) =>
    state.PAID({ effects: [{ action: "Audit", payload: { ...applyDecision(Rules, state) } }] }),
  );
  assert.deepEqual(r.codes, []);
  assert.deepEqual(r.transition.emittedCommands[0].payload, {
    discount: { $ref: "decision:Rules.discount" },
    effects: { $ref: "decision:Rules.effects" },
  });
  assert.deepEqual(r.transition.emittedCommands[0].payloadSchema, { discount: "number", effects: "array" });
});

test("通る: state の値を payload にそのまま流す (ただし型は復元できない)", async () => {
  const r = await run((state) => state.PAID({ effects: [receipt(state.amount)] }));
  assert.deepEqual(r.codes, []);
  assert.deepEqual(r.transition.emittedCommands[0].payload, { discount: { $ref: "state.amount" } });
  assert.deepEqual(r.transition.emittedCommands[0].payloadSchema, { discount: "unknown" });
});

test("if (===): 無言で else 側だけが記録される。未使用読み取りの警告で検知", async () => {
  const r = await run((state) => {
    if (state.rank === "Gold") return state.VIP();
    return state.PAID();
  });
  assert.equal(r.transition.nextState, "PAID");
  assert.deepEqual(r.codes, ["warning:unused-read"]);
  assert.match(r.messages[0], /state\.rank/);
});

test("if (真偽判定): 無言で then 側だけが記録される。未使用読み取りの警告で検知", async () => {
  const r = await run((state) => {
    if (state.isMonthEnd) return state.VIP();
    return state.PAID();
  });
  assert.equal(r.transition.nextState, "VIP");
  assert.deepEqual(r.codes, ["warning:unused-read"]);
});

test("if (大小比較): toPrimitive が呼ばれるのでエラーとして検知", async () => {
  const r = await run((state) => {
    if (state.amount > 100) return state.VIP();
    return state.PAID();
  });
  assert.equal(r.transition, undefined);
  assert.deepEqual(r.codes, ["error:symbolic-coercion"]);
});

test("盲点: 変数に取った値を分岐と出力の両方に使うと、片方の経路が無警告で消える", async () => {
  const r = await run((state) => {
    const discount = applyDecision(Rules, state).discount;
    if (discount === 0) return state.FREE();
    return state.PAID({ effects: [receipt(discount)] });
  });
  assert.equal(r.transition.nextState, "PAID");
  assert.deepEqual(r.codes, []);
});

test("盲点: ?? / || のフォールバックは無警告で消える", async () => {
  const r = await run((state) => state.PAID({ effects: [receipt(applyDecision(Rules, state).discount ?? 0.5)] }));
  assert.deepEqual(r.transition.emittedCommands[0].payload, { discount: { $ref: "decision:Rules.discount" } });
  assert.deepEqual(r.codes, []);
});

test("後続演算 (discount * 2): エラーとして検知。式そのものは記録できない", async () => {
  const r = await run((state) => state.PAID({ effects: [receipt(applyDecision(Rules, state).discount * 2)] }));
  assert.deepEqual(r.codes, ["error:symbolic-coercion"]);
});

test("テンプレートリテラル: エラーとして検知", async () => {
  const r = await run((state) => state.PAID({ event: `割引 ${applyDecision(Rules, state).discount}` }));
  assert.deepEqual(r.codes, ["error:symbolic-coercion"]);
});

test("記号値へのメソッド呼び出し (effects.map): エラーとして検知", async () => {
  const r = await run((state) =>
    state.PAID({ effects: (applyDecision(Rules, state).effects as readonly unknown[]).map((e) => e) }),
  );
  assert.deepEqual(r.codes, ["error:symbolic-call"]);
});

test("state のオブジェクトスプレッド: キー集合が不明なのでエラーとして検知", async () => {
  const r = await run((state) => state.PAID({ effects: [{ action: "Audit", payload: { ...state } }] }));
  assert.deepEqual(r.codes, ["error:symbolic-enumerate"]);
});

test("JSON.stringify(記号値): toJSON の呼び出しとしてエラーで検知", async () => {
  const r = await run((state) =>
    state.PAID({ effects: [receipt(JSON.stringify(applyDecision(Rules, state).discount))] }),
  );
  assert.deepEqual(r.codes, ["error:symbolic-call"]);
});

test("非同期: 既定では Promise を返す case をエラーにする", async () => {
  const r = await run(async (state) => state.PAID());
  assert.deepEqual(r.codes, ["error:async-case"]);
});

test("非同期: await 自体は抽象実行を壊さない (allowAsync で同期版と同じ IR)", async () => {
  const r = await run(
    async (state) => {
      const campaign = await applyDecision(Rules, state);
      await null;
      return state.PAID({ effects: [receipt(await campaign.discount), ...campaign.effects] });
    },
    { allowAsync: true },
  );
  assert.deepEqual(r.codes, []);
  assert.deepEqual(r.transition.emittedCommands[1], { $spread: "decision:Rules.effects" });
});

test("非決定性 (Math.random): 2回実行の比較でエラーとして検知", async () => {
  const r = await run((state) => state.PAID({ effects: [receipt(Math.random())] }));
  assert.deepEqual(r.codes, ["error:nondeterministic"]);
});

test("export されていない表: 名前を決められないのでエラー", async () => {
  const hidden = { default: { discount: 0 } };
  const r = await run((state) => state.PAID({ effects: [receipt(applyDecision(hidden, state).discount)] }));
  assert.deepEqual(r.codes, ["error:unknown-table"]);
});

test("遷移を返さない case: エラー", async () => {
  const r = await run((state) => state.PAID);
  assert.deepEqual(r.codes, ["error:no-transition"]);
});

test("stableStringify: キー順に依存しない", () => {
  assert.equal(stableStringify({ b: 1, a: { d: 1, c: 2 } }), stableStringify({ a: { c: 2, d: 1 }, b: 1 }));
});
