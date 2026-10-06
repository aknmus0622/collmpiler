import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { RuleConflictError, bindDecisionDetails, createState } from "@aac/core";
import { behaviors } from "../../../specs/order.spec.ts";
import { CampaignEvaluator } from "../../../specs/vocabulary.ts";
import { loadSpecs } from "../src/loader.ts";

// SPEC.md の例 (specs/) を、具体値と抽象実行の両方で通す

const checkout = (data: object) => behaviors.Checkout.cases.PaymentSuccess(createState(data));

test("具体実行: ゴールド会員かつ月末", () => {
  assert.deepEqual(checkout({ rank: "Gold", isMonthEnd: true }), {
    nextState: "PAID",
    event: "Payment completed",
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

test("具体実行: set で覚えるデータが遷移に含まれる", () => {
  assert.deepEqual(behaviors.PlaceOrder.cases.Placed(createState({ customerRank: "Gold", rank: undefined })), {
    nextState: "PENDING",
    event: "Order placed",
    effects: [{ action: "SendOrderConfirmation", payload: {} }],
    set: { rank: "Gold" },
  });
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
  const checkout = JSON.parse(first).behaviors.find((b: { name: string }) => b.name === "Checkout");
  assert.equal(checkout.transitions.PaymentSuccess.nextState, "PAID");
  // state の参照は「どの境界の値か」に解決されて IR に出る
  const place = JSON.parse(first).behaviors.find((b: { name: string }) => b.name === "PlaceOrder");
  assert.deepEqual(place.transitions.Placed.set, { rank: { $ref: "input:customerRank" } });
});

// --- モデルの検査 (loader) ---

const tmpRoot = join(import.meta.dirname, ".tmp-specs");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

function specDir(model: string, behaviors: string) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.spec.ts"),
    `import { defineBehaviors } from "@aac/core";
export const Model = { initial: "A", states: ["A"], commands: {}, ${model} };
export const behaviors = defineBehaviors({ ${behaviors} });
`,
  );
  return dir;
}
const noop = "{ cases: { Done: (state) => state.A() } }";

test("モデル: data・queries・入力の名前が重なるとエラー (条件から区別できないため)", async () => {
  const dir = specDir(`data: { rank: "string" }, queries: {}, actions: { Place: { rank: "string" } }`, `Place: ${noop}`);
  await assert.rejects(loadSpecs(dir), /"rank" が重複しています \(data と actions の入力\)/);
});

test("モデル: 入力はアクションが違えば同名でよい", async () => {
  const dir = specDir(
    `data: {}, queries: {}, actions: { Place: { note: "string" }, Amend: { note: "string" } }`,
    `Place: ${noop}, Amend: ${noop}`,
  );
  assert.deepEqual(Object.keys((await loadSpecs(dir)).behaviors).sort(), ["Amend", "Place"]);
});

test("モデル: actions と behaviors が一致しなければエラー", async () => {
  const dir = specDir(`data: {}, queries: {}, actions: { Place: {}, Ship: {} }`, `Place: ${noop}`);
  await assert.rejects(loadSpecs(dir), /actions \(Place, Ship\) と behaviors \(Place\) が一致しません/);
});
