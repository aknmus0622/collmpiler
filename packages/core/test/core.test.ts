import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculations, check, commands, conditions, data, decisions, effects, input, integer, invariants, list, optional, otherwise, plain, queries, record,
  service, states, string, was,
} from "../index.ts";

// 仕様を書くための語彙 (DSL.md §16.0): 種類（席か項目）、取っ手、[] と略記、木の検査

const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = integer({ min: 0, max: 1_000_000 });

// 注文の例（一部）。語彙のまとまりを先に宣言し、取っ手で参照する
const State = states(["DRAFT", "PENDING", "PAID"]);
const Data = data({ rank: Rank, price: Yen, notes: { type: list("string"), initially: [] } });
const Query = queries({
  isMonthEnd: { description: "Whether today is the last day of the month.", output: "boolean" },
  paymentResult: ["succeeded", "failed"],
  stateDeclared: { input: input({ name: "string" }), output: "boolean" },
  newId: { output: "string", fresh: true },
});
const Effect = effects({ SendReceipt: input({ amount: "integer" }), Refund: "What the customer paid is returned." });
const Calc = calculations({ amountCharged: { description: "price × (100 − discount percent) ÷ 100", output: "integer" } });
const Inv = invariants({ priced: "Every order past the draft state has a price" });
const If = conditions({ paid: "The payment succeeded", active: "The external payment module is active", gold: "The customer is a Gold member" });
const Decision = decisions({ campaign: [If.gold.then({ discountPercent: 20 }), otherwise({ discountPercent: 0 })] });
const PlaceInput = input({ customerRank: Rank, listPrice: Yen });

const Command = commands({
  PlaceOrder: {
    input: PlaceInput,
    from: State.DRAFT,
    goTo: State.PENDING,
    set: [Data.rank.set(PlaceInput.customerRank), Data.price.set(PlaceInput.listPrice)],
    does: "An order confirmation is sent.",
  },
  Checkout: {
    from: State.PENDING,
    onlyIf: If.active,
    asks: [Query.stateDeclared({ name: "PAID" }).as("declared")],
    output: record({ result: ["paid", "failed"], receipt: optional("integer") }),
    cases: [
      If.paid.then({ goTo: State.PAID, emits: [Effect.SendReceipt({ amount: Calc.amountCharged })], responds: { result: "paid", receipt: Decision.campaign.discountPercent } }),
      otherwise({ emits: [Effect.Refund().onlyWhen(was(State.PAID))], responds: { result: "failed", receipt: null } }),
    ],
  },
});
const order = () =>
  service({ description: "An order.", init: State.DRAFT, uses: [State, Data, Query, Effect, Decision, If, Calc, Inv, Command] });

test("取っ手: 例の仕様は、木の検査を通る", () => {
  assert.deepEqual(check(order()), []);
});

test("取っ手: 参照は、名前の参照になる。引数つきの問い合わせは、尋ねる節。副作用の修飾は続けて呼ぶ", () => {
  assert.deepEqual({ ...Data.price }, { $ref: "data", path: "price" });
  assert.deepEqual({ ...Calc.amountCharged }, { $ref: "calculation", path: "amountCharged" });
  assert.deepEqual({ ...PlaceInput.listPrice }, { $ref: "input", path: "listPrice" });
  assert.deepEqual(was(State.PAID), { $ref: "was", path: ["PAID"] });
  const asked = Query.stateDeclared({ name: "PAID" }).as("declared");
  assert.deepEqual([asked.kind, asked.name, asked.value], ["asks", "declared", "stateDeclared"]);
  assert.deepEqual(asked.answer, { $ref: "query", path: "declared" });
  assert.deepEqual(Query.stateDeclared.answer, { $ref: "query", path: "stateDeclared" });
  assert.deepEqual(plain(Effect.Refund().onlyWhen(If.paid)), { kind: "emits", value: "Refund", children: [{ kind: "onlyWhen", value: "The payment succeeded" }] });
});

test("取っ手: 決定表は、まとまりの宣言のキーが名前。行は条件の取っ手から作る。意味の関数は取っ手に付ける", () => {
  assert.deepEqual({ ...Decision.campaign }, { "The customer is a Gold member": { discountPercent: 20 }, otherwise: { discountPercent: 0 } });
  assert.deepEqual({ ...Decision.campaign.discountPercent }, { $ref: "decision", path: ["campaign", "discountPercent"] });
  const meaning = If.paid.means(() => true);
  assert.deepEqual([meaning.$meaning, meaning.name], ["conditions", "The payment succeeded"]);
  assert.deepEqual([Calc.amountCharged.means(() => 1).$meaning, Inv.priced.means(() => true).name], ["calculations", "Every order past the draft state has a price"]);
});

test("断片: 場合の並びは、値として共有できる（[] を広げる）", () => {
  const Refused = conditions({ refused: "The request is refused" });
  const refused = [Refused.refused.then({ responds: "refused" }), otherwise({ responds: "done" })];
  const Cmd = commands({ A: { input: input({ n: "integer" }), cases: [...refused] }, B: { cases: refused } });
  const spec = service({ uses: [Cmd] });
  assert.deepEqual(check(spec), []);
  const [a, b] = spec.children;
  assert.deepEqual(a.children.map((node) => node.kind), ["input", "when", "otherwise"]);
  assert.deepEqual(b.children.map((node) => node.kind), ["when", "otherwise"]);
});

test("木の検査: 種類に無い席、重なった名前、知らない初期状態を、場所と一緒に報告する", () => {
  const S = states(["A", "A"]);
  const X = conditions({ x: "x" });
  const spec = service({
    init: { $state: "C" } as never,
    uses: [
      S,
      data({ count: { type: integer(), output: "integer" } as never }),
      queries({ now: { output: "integer", initially: 0 } as never }),
      effects({ Send: { input: input({ a: "string" }), from: S.A } as never }),
      commands({ Go: { cases: [X.x.then({ description: "no" } as never)], fresh: true } as never }),
    ],
  });
  const found = check(spec);
  assert.deepEqual(found.map((d) => `${d.code}: ${d.message}`), [
    'duplicate: 部品の中に、状態 "A"が2回書かれています',
    'unknown-field: データに、"output" という席はありません',
    'unknown-field: 問い合わせに、"initially" という席はありません',
    'unknown-field: 副作用に、"from" という席はありません',
    'unknown-field: コマンドに、"fresh" という席はありません',
    'unknown-field: 場合に、"description" という席はありません',
    'unknown-state: 初期状態 "C" は、状態にありません',
  ]);
  // 診断は、その種類の節を書いた場所（このファイルの行）を指す
  for (const diagnostic of found.filter((d) => d.code === "unknown-field")) assert.ok(diagnostic.at?.file.endsWith("core.test.ts"), JSON.stringify(diagnostic));
});

test("木の検査: 型の席の {} と、部品に無い席は書けない", () => {
  const spec = service({
    uses: [data({ days: { type: "integer", min: 1 } as never }), commands({ A: { input: input({ n: string({ examples: ["x"] }) }) } })],
    commnds: {},
  } as never);
  assert.deepEqual(check(spec).map((d) => d.message), ['データに、"min" という席はありません', '部品 (service)に、"commnds" という席はありません']);
});
