import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { RuleConflictError, bindDecisionDetails, createState } from "@aac/core";
import { behaviors } from "../../../specs/order.spec.ts";
import { CampaignEvaluator } from "../../../specs/vocabulary.ts";

// SPEC.md の例 (specs/) を、具体値と抽象実行の両方で通す

const checkout = (data: object) => behaviors.Checkout.cases.PaymentSuccess(createState(data));

test("具体実行: ゴールド会員かつ月末", () => {
  assert.deepEqual(checkout({ rank: "Gold", isMonthEnd: true }), {
    nextState: "PAID",
    event: "決済完了",
    effects: [
      { action: "SendReceipt", payload: { discount: 0.2 } },
      { action: "IssueCoupon", payload: { type: "Premium" } },
    ],
  });
});

test("具体実行: どのルールにも当たらなければ default", () => {
  assert.equal(CampaignEvaluator.evaluate({ rank: "Bronze", isMonthEnd: true }), "default");
  assert.deepEqual(checkout({ rank: "Bronze", isMonthEnd: true }).effects, [
    { action: "SendReceipt", payload: { discount: 0 } },
  ]);
});

test("Hit Policy Unique: default 以外が複数成立すると RuleConflictError", () => {
  const table = { a: 1, b: 2, default: 0 };
  const evaluator = bindDecisionDetails<keyof typeof table>(table, {
    a: () => true,
    b: () => true,
    default: () => true,
  });
  assert.throws(() => evaluator.evaluate({}), RuleConflictError);
});

test("specs/ の IR 出力は実行ごとにバイト一致する", () => {
  const compile = () => execFileSync(process.execPath, ["packages/cli/src/compile.ts", "specs"], { encoding: "utf8" });
  const first = compile();
  assert.equal(first, compile());
  assert.equal(JSON.parse(first).behaviors[0].transitions.PaymentSuccess.nextState, "PAID");
});
