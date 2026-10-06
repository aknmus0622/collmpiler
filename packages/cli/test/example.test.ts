import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { RuleConflictError, bindSpecification, createState, defineComponent, evaluateConditions } from "@aac/core";
import { Order } from "../../../specs/order.component.ts";
import "../../../specs/order.binding.ts";
import { extract } from "../src/extract.ts";
import { loadSpecs } from "../src/loader.ts";
import { selfCheck } from "../src/runtime.ts";

// SPEC.md の例 (specs/) を、具体値と抽象実行の両方で通す

const success = Order.behaviors.Checkout["The payment succeeded"];
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
  assert.equal(evaluateConditions(["The customer is a Gold member and it is month-end", "The customer is a Silver member"], state), "default");
  assert.deepEqual(success(order(state)).effects, [{ action: "SendReceipt", payload: { discountPercent: 0, amount: 500 } }]);
});

test("具体実行: set で覚えるデータが遷移に含まれる", () => {
  assert.deepEqual(Order.behaviors.PlaceOrder(order({ status: "DRAFT", customerRank: "Gold", listPrice: 300 })), {
    nextState: "PENDING",
    event: "Order placed",
    effects: [{ action: "SendOrderConfirmation", payload: {} }],
    set: { rank: "Gold", price: 300 },
  });
});

// 任意の条件を結び付けるための最小のコンポーネント
const tiny = (first: string, second: string) =>
  defineComponent({ initial: "A", states: ["A"], actions: { Go: { where: [first, second] } } }).cases({ Go: (state) => state.A() });

test("Hit Policy Unique: default 以外が複数成立すると RuleConflictError", () => {
  bindSpecification(tiny("常に成り立つ条件その1", "常に成り立つ条件その2"), {
    conditions: { "常に成り立つ条件その1": () => true, "常に成り立つ条件その2": () => true },
  });
  assert.throws(() => evaluateConditions(["常に成り立つ条件その1", "常に成り立つ条件その2", "default"], {}), RuleConflictError);
});

test("結び付け: 同じ文を別の関数に結び付けるとエラー (同じ文は1つの意味)", () => {
  const component = tiny("二重に結び付ける条件", "もう1つの条件");
  bindSpecification(component, { conditions: { "二重に結び付ける条件": () => true, "もう1つの条件": () => true } });
  assert.throws(
    () => bindSpecification(component, { conditions: { "二重に結び付ける条件": () => false, "もう1つの条件": () => true } }),
    /複数回、別の関数に/,
  );
});

test("specs/ の IR 出力は実行ごとにバイト一致する", () => {
  const compile = () => execFileSync(process.execPath, ["packages/cli/src/compile.ts", "specs"], { encoding: "utf8" });
  const first = compile();
  assert.equal(first, compile());
  const ir = JSON.parse(first);
  const find = (name: string) => ir.behaviors.find((b: { name: string }) => b.name === name);
  // case のキーは条件の文。state の参照は「どの境界の値か」に、計算は名前に解決されて IR に出る
  const paid = find("Checkout").transitions["The payment succeeded"];
  assert.equal(paid.nextState, "PAID");
  assert.deepEqual(paid.emittedCommands[0].payload.amount, {
    $ref: "formula:Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen",
  });
  assert.deepEqual(find("PlaceOrder").transitions.default.set, {
    rank: { $ref: "input:customerRank" },
    price: { $ref: "input:listPrice" },
  });
  assert.deepEqual(ir.model.invariants, ["Every order past the draft state has a member rank and a price"]);
});

test("specs/ は仕様の事前検査に合格する", async () => {
  assert.deepEqual(await selfCheck(await loadSpecs("specs"), { seed: 1, numRuns: 300 }), { ok: true, numRuns: 300 });
});

// --- 仕様の誤りの検出 (loader / extract / selfCheck) ---
// 結び付けはプロセス全体で共有されるので、テストごとに条件の文を変えている

const tmpRoot = join(import.meta.dirname, ".tmp-specs");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 仕様ファイルを一時ディレクトリに書き出す。boundary は defineComponent の中身、cases は .cases() の中身
function specDir(boundary: string, cases: string, bindings = "conditions: {}") {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(
    join(dir, "x.component.ts"),
    `import { applyFormula, bindSpecification, defineComponent } from "@aac/core";
const Boundary = defineComponent({ initial: "A", states: ["A", "B"], ${boundary} });
export const Component = Boundary.cases({ ${cases} });
bindSpecification(Component, { ${bindings} });
`,
  );
  return dir;
}
const noop = "(state) => state.A()";

test("コンポーネント: data・queries・入力の名前が重なるとエラー (条件から区別できないため)", async () => {
  const dir = specDir(`data: { rank: "string" }, actions: { Place: { input: { rank: "string" } } }`, `Place: ${noop}`);
  await assert.rejects(loadSpecs(dir), /"rank" が重複しています \(data と actions の入力\)/);
});

test("コンポーネント: 入力はアクションが違えば同名でよい", async () => {
  const dir = specDir(`actions: { Place: { input: { note: "string" } }, Amend: { input: { note: "string" } } }`, `Place: ${noop}, Amend: ${noop}`);
  assert.deepEqual(Object.keys((await loadSpecs(dir)).behaviors).sort(), ["Amend", "Place"]);
});

test("コンポーネント: 省略した宣言は空として扱い、関数1つの case は default だけの表になる", async () => {
  const spec = await loadSpecs(specDir(`actions: { Place: { from: ["A"] }, Back: {} }`, `Place: ${noop}, Back: { default: ${noop} }`));
  assert.deepEqual(spec.model, { initial: "A", states: ["A", "B"], data: {}, actions: { Place: {}, Back: {} }, queries: {}, commands: {} });
  assert.deepEqual(Object.keys(spec.behaviors.Place.cases), ["default"]);
  assert.deepEqual(spec.behaviors.Place.from, ["A"]);
  assert.equal(spec.behaviors.Back.from, undefined);
});

test("コンポーネント: case の無いアクション、default の無い表はエラー", async () => {
  await assert.rejects(loadSpecs(specDir(`actions: { Place: {}, Ship: {} }`, `Place: ${noop}`)), /アクション "Ship" に case がありません/);
  await assert.rejects(
    loadSpecs(specDir(`actions: { Place: {} }`, `Place: { "何かの場合": ${noop} }`)),
    /アクション "Place" に case がありません/,
  );
});

test("IR 抽出: 結び付けの無い条件・計算・不変条件はエラー", async () => {
  const dir = specDir(
    `actions: { Place: { where: ["結び付けの無い事前条件"] } }, formulas: { "結び付けの無い計算": "integer" }, invariants: ["結び付けの無い不変条件"]`,
    `Place: { "結び付けの無い場合": ${noop}, default: ${noop} }`,
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
    `actions: { Place: {} }`,
    `Place: { "事前検査で衝突する条件その1": (state) => state.B(), "事前検査で衝突する条件その2": (state) => state.B(), default: ${noop} }`,
    `conditions: { "事前検査で衝突する条件その1": () => true, "事前検査で衝突する条件その2": () => true }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /複数の条件が同時に成立しました/);
});

test("事前検査: 不変条件が破れるアクション列を、最短で報告する", async () => {
  const dir = specDir(
    `data: { note: "string" }, actions: { Place: { from: ["A"] }, Back: { from: ["B"] } }, invariants: ["Bの状態ではメモが設定されている"]`,
    // Place がメモを覚え忘れている
    `Place: (state) => state.B(), Back: ${noop}`,
    `conditions: {}, invariants: { "Bの状態ではメモが設定されている": (state) => state.status !== "B" || state.note !== undefined }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /不変条件が破れました: "Bの状態ではメモが設定されている"/);
  assert.deepEqual(result.steps.map((step) => step.action), ["Place"]);
});

test("事前検査: 計算の結果が宣言した型に合わなければ報告する", async () => {
  const dir = specDir(
    `commands: { Bill: { amount: "integer" } }, actions: { Place: {} }, formulas: { "半額（端数処理なし）": "integer" }`,
    `Place: (state) => state.A({ effects: [{ action: "Bill", payload: { amount: applyFormula(Boundary, "半額（端数処理なし）", state) } }] })`,
    `conditions: {}, formulas: { "半額（端数処理なし）": () => 1.5 }`,
  );
  const result = await selfCheck(await loadSpecs(dir), { seed: 1 });
  assert.ok(!result.ok);
  assert.match(result.message, /Bill\.amount = 1\.5 が宣言した型・範囲に合いません/);
});
