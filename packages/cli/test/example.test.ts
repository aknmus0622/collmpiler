import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { RuleConflictError, bindSpecification, createState, evaluateConditions } from "@aac/core";
import { behaviors } from "../../../specs/order.spec.ts";
import "../../../specs/vocabulary.ts";
import { extract } from "../src/extract.ts";
import { loadSpecs } from "../src/loader.ts";
import { selfCheck } from "../src/runtime.ts";

// SPEC.md の例 (specs/) を、具体値と抽象実行の両方で通す

const success = behaviors.Checkout.cases["決済に成功した場合"];
const order = (data: object) => createState({ status: "PENDING", rank: undefined, price: undefined, ...data });

test("具体実行: ゴールド会員かつ月末は20%引きで、請求金額は計算で決まる", () => {
  assert.deepEqual(success(order({ rank: "Gold", isMonthEnd: true, price: 1999 })), {
    nextState: "PAID",
    event: "Payment completed",
    effects: [
      { action: "SendReceipt", payload: { discountPercent: 20, amount: 1599 } }, // 1599.2 を切り捨て
      { action: "IssueCoupon", payload: { type: "Premium" } },
    ],
  });
});

test("具体実行: どの条件にも当たらなければ default", () => {
  const state = { status: "PENDING", rank: "Bronze", isMonthEnd: true, price: 500 };
  assert.equal(evaluateConditions(["ゴールド会員であり、かつ月末の場合", "シルバー会員の場合"], state), "default");
  assert.deepEqual(success(order(state)).effects, [{ action: "SendReceipt", payload: { discountPercent: 0, amount: 500 } }]);
});

test("具体実行: set で覚えるデータが遷移に含まれる", () => {
  assert.deepEqual(behaviors.PlaceOrder.cases.default(order({ status: "DRAFT", customerRank: "Gold", listPrice: 300 })), {
    nextState: "PENDING",
    event: "Order placed",
    effects: [{ action: "SendOrderConfirmation", payload: {} }],
    set: { rank: "Gold", price: 300 },
  });
});

const Tiny = { initial: "A", states: ["A"], data: {}, actions: {}, queries: {}, commands: {} } as const;

test("Hit Policy Unique: default 以外が複数成立すると RuleConflictError", () => {
  bindSpecification(Tiny, { conditions: { "常に成り立つ条件その1": () => true, "常に成り立つ条件その2": () => true } });
  assert.throws(() => evaluateConditions(["常に成り立つ条件その1", "常に成り立つ条件その2", "default"], {}), RuleConflictError);
});

test("結び付け: 同じ文を別の関数に結び付けるとエラー (同じ文は1つの意味)", () => {
  bindSpecification(Tiny, { conditions: { "二重に結び付ける条件": () => true } });
  assert.throws(() => bindSpecification(Tiny, { conditions: { "二重に結び付ける条件": () => false } }), /複数回、別の関数に/);
});

test("specs/ の IR 出力は実行ごとにバイト一致する", () => {
  const compile = () => execFileSync(process.execPath, ["packages/cli/src/compile.ts", "specs"], { encoding: "utf8" });
  const first = compile();
  assert.equal(first, compile());
  const ir = JSON.parse(first);
  const find = (name: string) => ir.behaviors.find((b: { name: string }) => b.name === name);
  // case のキーは条件の文。state の参照は「どの境界の値か」に、計算は名前に解決されて IR に出る
  const paid = find("Checkout").transitions["決済に成功した場合"];
  assert.equal(paid.nextState, "PAID");
  assert.deepEqual(paid.emittedCommands[0].payload.amount, {
    $ref: "formula:請求金額（価格 ×（100 − 割引率）÷ 100、1円未満切り捨て）",
  });
  assert.deepEqual(find("PlaceOrder").transitions.default.set, {
    rank: { $ref: "input:customerRank" },
    price: { $ref: "input:listPrice" },
  });
  assert.deepEqual(ir.model.invariants, ["下書き以外の注文には、会員ランクと価格が設定されている"]);
});

test("specs/ は仕様の事前検査に合格する", async () => {
  assert.deepEqual(await selfCheck(await loadSpecs("specs"), { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
});

// --- 仕様の誤りの検出 (loader / extract / selfCheck) ---
// 結び付けはプロセス全体で共有されるので、テストごとに条件の文を変えている

const tmpRoot = join(import.meta.dirname, ".tmp-specs");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

function specDir(model: string, behaviors: string, bindings = "conditions: {}") {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.spec.ts"),
    `import { applyFormula, bindSpecification, defineBehaviors } from "@aac/core";
export const Model = { initial: "A", states: ["A", "B"], ${model} };
export const behaviors = defineBehaviors({ ${behaviors} });
bindSpecification(Model, { ${bindings} });
`,
  );
  return dir;
}
const empty = "data: {}, queries: {}, commands: {}";
const noop = "{ cases: { default: (state) => state.A() } }";

test("モデル: data・queries・入力の名前が重なるとエラー (条件から区別できないため)", async () => {
  const dir = specDir(`data: { rank: "string" }, queries: {}, commands: {}, actions: { Place: { rank: "string" } }`, `Place: ${noop}`);
  await assert.rejects(loadSpecs(dir), /"rank" が重複しています \(data と actions の入力\)/);
});

test("モデル: 入力はアクションが違えば同名でよい", async () => {
  const dir = specDir(`${empty}, actions: { Place: { note: "string" }, Amend: { note: "string" } }`, `Place: ${noop}, Amend: ${noop}`);
  assert.deepEqual(Object.keys((await loadSpecs(dir)).behaviors).sort(), ["Amend", "Place"]);
});

test("モデル: actions と behaviors が一致しなければエラー", async () => {
  const dir = specDir(`${empty}, actions: { Place: {}, Ship: {} }`, `Place: ${noop}`);
  await assert.rejects(loadSpecs(dir), /actions \(Place, Ship\) と behaviors \(Place\) が一致しません/);
});

test("振る舞い: cases に default が無ければエラー", async () => {
  const dir = specDir(`${empty}, actions: { Place: {} }`, `Place: { cases: { "何かの場合": (state) => state.A() } }`);
  await assert.rejects(loadSpecs(dir), /cases に "default" がありません/);
});

test("IR 抽出: 結び付けの無い条件・計算・不変条件はエラー", async () => {
  const dir = specDir(
    `${empty}, actions: { Place: {} }, formulas: { "結び付けの無い計算": "integer" }, invariants: ["結び付けの無い不変条件"]`,
    `Place: { where: ["結び付けの無い事前条件"], cases: { "結び付けの無い場合": (state) => state.A(), default: (state) => state.A() } }`,
  );
  const { diagnostics } = await extract(await loadSpecs(dir));
  assert.deepEqual(diagnostics.map((d) => d.code).sort(), [
    "unbound-condition",
    "unbound-condition",
    "unbound-formula",
    "unbound-invariant",
  ]);
});

test("事前検査: 2つの条件が同時に成り立つ仕様を、実装なしで見つける", async () => {
  const dir = specDir(
    `${empty}, actions: { Place: {} }`,
    `Place: { cases: { "事前検査で衝突する条件その1": (state) => state.B(), "事前検査で衝突する条件その2": (state) => state.B(), default: (state) => state.A() } }`,
    `conditions: { "事前検査で衝突する条件その1": () => true, "事前検査で衝突する条件その2": () => true }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /複数の条件が同時に成立しました/);
});

test("事前検査: 不変条件が破れるアクション列を、最短で報告する", async () => {
  const dir = specDir(
    `data: { note: "string" }, queries: {}, commands: {}, actions: { Place: {}, Back: {} }, invariants: ["Bの状態ではメモが設定されている"]`,
    // Place がメモを覚え忘れている
    `Place: { from: ["A"], cases: { default: (state) => state.B() } }, Back: { from: ["B"], cases: { default: (state) => state.A() } }`,
    `conditions: {}, invariants: { "Bの状態ではメモが設定されている": (state) => state.status !== "B" || state.note !== undefined }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /不変条件が破れました: "Bの状態ではメモが設定されている"/);
  assert.deepEqual(result.steps.map((step) => step.action), ["Place"]);
});

test("事前検査: 計算の結果が宣言した型に合わなければ報告する", async () => {
  const dir = specDir(
    `data: {}, queries: {}, commands: { Bill: { amount: "integer" } }, actions: { Place: {} }, formulas: { "半額（端数処理なし）": "integer" }`,
    `Place: { cases: { default: (state) => state.A({ effects: [{ action: "Bill", payload: { amount: applyFormula(Model, "半額（端数処理なし）", state) } }] }) } }`,
    `conditions: {}, formulas: { "半額（端数処理なし）": () => 1.5 }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /Bill\.amount = 1\.5 が宣言した型・範囲に合いません/);
});
