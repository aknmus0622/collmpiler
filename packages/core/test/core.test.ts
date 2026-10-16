import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculations, check, component, conditions, data, decisionTable, description, does, effects, fresh, from, goTo, initially, input, integer,
  invariants, list, onlyIf, onlyWhen, optional, otherwise, output, plain, queries, record, responds, states, string, was, when,
} from "../index.ts";

// 仕様を書くための語彙 (DSL.md): 節、取っ手、`{}` から節への変換、木の検査

const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = integer({ min: 0, max: 1_000_000 });

// 注文の例（一部）。語彙のまとまりを先に宣言し、取っ手で参照する
const State = states("DRAFT", "PENDING", "PAID");
const Data = data({ rank: Rank, price: Yen, notes: component(list("string"), initially([])) });
const Query = queries({
  isMonthEnd: component(description("Whether today is the last day of the month."), output("boolean")),
  paymentResult: ["succeeded", "failed"],
  stateDeclared: component(input({ name: "string" }), output("boolean")),
  newId: component(output("string"), fresh()),
});
const Effect = effects({ SendReceipt: input({ amount: "integer" }), Refund: description("What the customer paid is returned.") });
const Calc = calculations({ amountCharged: component(description("price × (100 − discount percent) ÷ 100"), output("integer")) });
const Inv = invariants({ priced: "Every order past the draft state has a price" });
const If = conditions({ paid: "The payment succeeded", active: "The external payment module is active", gold: "The customer is a Gold member" });
const Campaign = decisionTable(when(If.gold, { discountPercent: 20 }), otherwise({ discountPercent: 0 }));
const PlaceInput = input({ customerRank: Rank, listPrice: Yen });

const order = () =>
  component({
    description: "An order.",
    states: State,
    init: State.DRAFT,
    data: Data,
    queries: Query,
    effects: Effect,
    decisions: { campaign: Campaign },
    calculations: Calc,
    invariants: Inv,
    commands: {
      PlaceOrder: component(PlaceInput, from(State.DRAFT), goTo(State.PENDING), Data.rank.set(PlaceInput.customerRank), Data.price.set(PlaceInput.listPrice), does("An order confirmation is sent.")),
      Checkout: component(
        from(State.PENDING),
        onlyIf(If.active),
        Query.stateDeclared({ name: "PAID" }).as("declared"),
        output(record({ result: ["paid", "failed"], receipt: optional("integer") })),
        when(If.paid, goTo(State.PAID), Effect.SendReceipt({ amount: Calc.amountCharged }), responds({ result: "paid", receipt: Campaign.discountPercent })),
        otherwise(Effect.Refund(onlyWhen(was(State.PAID))), responds({ result: "failed", receipt: null })),
      ),
    },
  });

test("取っ手: 例の仕様は、木の検査を通る", () => {
  assert.deepEqual(check(order()), []);
});

test("取っ手: 宣言したまとまりは、部品の中にその場で書いたものと同じ木になる。参照は、名前の参照になる", () => {
  const inline = component({
    states: ["DRAFT", "PENDING", "PAID"],
    data: { rank: Rank, price: Yen },
    effects: { SendReceipt: input({ amount: "integer" }) },
  });
  const declared = component({ states: states("DRAFT", "PENDING", "PAID"), data: data({ rank: Rank, price: Yen }), effects: effects({ SendReceipt: input({ amount: "integer" }) }) });
  assert.deepEqual(plain(declared), plain(inline));

  // 参照は、構造に書く値（{ $ref, path }）と、状態や条件の名前になる
  assert.deepEqual({ ...Data.price }, { $ref: "data", path: "price" });
  assert.deepEqual({ ...Calc.amountCharged }, { $ref: "calculation", path: "amountCharged" });
  assert.deepEqual({ ...PlaceInput.listPrice }, { $ref: "input", path: "listPrice" });
  assert.deepEqual(was(State.PAID), { $ref: "was", path: ["PAID"] });
  assert.deepEqual(plain(goTo(State.PAID)), { kind: "goTo", value: "PAID" });
  assert.deepEqual(plain(when(If.paid)), { kind: "when", name: "The payment succeeded" });
  // 引数つきの問い合わせ: 呼ぶと尋ねる節。答えは、付けた名前の参照
  const asked = Query.stateDeclared({ name: "PAID" }).as("declared");
  assert.deepEqual([asked.kind, asked.name, asked.value], ["asks", "declared", "stateDeclared"]);
  assert.deepEqual(asked.answer, { $ref: "query", path: "declared" });
  assert.deepEqual(Query.stateDeclared.answer, { $ref: "query", path: "stateDeclared" });
  // 副作用を起こす節
  assert.deepEqual(plain(Effect.Refund(onlyWhen(If.paid))), { kind: "emits", value: "Refund", children: [{ kind: "onlyWhen", value: "The payment succeeded" }] });
});

test("取っ手: 決定表の行は条件の取っ手で書く。列の参照は、部品に置いたキーを名前に使う", () => {
  assert.deepEqual({ ...Campaign }, { "The customer is a Gold member": { discountPercent: 20 }, otherwise: { discountPercent: 0 } });
  order();
  assert.deepEqual({ ...Campaign.discountPercent }, { $ref: "decision", path: ["campaign", "discountPercent"] });
  // 意味の関数は、取っ手に付ける
  const meaning = If.paid.means(() => true);
  assert.deepEqual([meaning.$meaning, meaning.name], ["conditions", "The payment succeeded"]);
  assert.deepEqual([Calc.amountCharged.means(() => 1).$meaning, Inv.priced.means(() => true).name], ["calculations", "Every order past the draft state has a price"]);
});

test("節: 名前の無い component は、置いた先に溶け込む（共有する断片）", () => {
  const Refused = conditions({ refused: "The request is refused" });
  const refused = component(when(Refused.refused, responds("refused")), otherwise(responds("done")));
  const spec = component({ commands: { A: component(input({ n: "integer" }), refused), B: component(refused) } });
  assert.deepEqual(check(spec), []);
  const [a, b] = spec.children;
  assert.deepEqual(a.children.map((node) => node.kind), ["input", "when", "otherwise"]);
  assert.deepEqual(b.children.map((node) => node.kind), ["when", "otherwise"]);
});

test("木の検査: 書けない組み合わせ、多すぎる子、重なった名前を、場所と一緒に報告する", () => {
  const S = states("A", "A");
  const X = conditions({ x: "x", y: "y" });
  const spec = component({
    states: S,
    init: { $state: "C" },
    data: { count: component(integer(), output("integer")) },
    queries: { now: component(output("integer"), initially(0)) },
    effects: { Send: component(input({ a: "string" }), input({ a: "integer" }), from(S.A)) },
    commands: {
      Go: component(goTo(S.A), when(X.x, description("no"), when(X.y)), fresh()),
      Stop: component(when(X.x, goTo(S.A)), when(X.x, goTo(S.A))),
    },
  });
  const found = check(spec);
  assert.deepEqual(found.map((d) => `${d.code}: ${d.message}`), [
    'duplicate: 部品の中に、状態 "A"が2回書かれています',
    'misplaced: データ "count"の中に、返すものの形 (output)は書けません',
    'misplaced: 問い合わせ "now"の中に、initiallyは書けません',
    'too-many: 副作用 "Send"の中に、入力 (input)を 2 つ以上は書けません',
    'misplaced: 副作用 "Send"の中に、fromは書けません',
    'misplaced: 場合 (when)の中に、説明 (description)は書けません',
    'misplaced: 場合 (when)の中に、場合 (when)は書けません',
    'misplaced: コマンド "Go"の中に、freshは書けません',
    'mixed-outcome: コマンド "Go"は場合に分かれているので、goToは、場合 (when / otherwise) の中に書いてください',
    'duplicate: コマンド "Stop"の中に、場合 (when)が2回書かれています',
    'unknown-state: 初期状態 "C" は、状態にありません',
  ]);
  // 診断は、その節を書いた場所（このファイルの行）を指す
  for (const diagnostic of found.filter((d) => d.code !== "unknown-state" && d.code !== "duplicate")) {
    assert.ok(diagnostic.at?.file.endsWith("core.test.ts"), JSON.stringify(diagnostic));
    assert.ok(diagnostic.at!.line > 0);
  }
  // 行は、その節を作った行
  const here = () => Number(/:(\d+):\d+\)?$/.exec(new Error().stack!.split("\n")[2].trim())![1]);
  const [line, misplaced] = [here(), fresh()];
  assert.deepEqual(check(component({ commands: { A: component(misplaced) } })).map((d) => d.at?.line), [line]);
});

test("木の検査: 裸の {} と、知らないまとまりは書けない", () => {
  const spec = component({
    data: { days: { type: "integer", min: 1 } },
    commnds: {},
    commands: { A: component(input({ n: string({ examples: ["x"] }) })) },
  } as never);
  assert.deepEqual(check(spec).map((d) => d.message), [
    '部品の中に、"commnds" というまとまりは書けません',
    'データ "days"の中に、裸の {}（受け取る語の無いもの）は書けません',
  ]);
});
