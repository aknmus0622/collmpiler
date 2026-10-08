import assert from "node:assert/strict";
import { test } from "node:test";
import {
  asks, calculation, check, command, component, condition, data, decision, description, does, effect, emits, field, from, fresh, goTo,
  init, initially, input, integer, invariant, list, onlyIf, onlyWhen, optional, otherwise, output, plain, query, record, responds, set,
  state, string, when,
  decisionTable, ref,
} from "../index.ts";

// 仕様を書くための語彙 (DSL.md) の土台: 節、`{}` から節への変換、木の検査

const Rank = ["Gold", "Silver", "Bronze"] as const;
const Yen = integer({ min: 0, max: 1_000_000 });
const Campaign = decisionTable({ otherwise: { discountPercent: 0 } });

// 注文の例（一部）を、dict 形式で
const sugar = () =>
  component({
    description: "An order.",
    states: ["DRAFT", "PENDING", "PAID"],
    init: "DRAFT",
    data: { rank: Rank, price: Yen, notes: component(list("string"), initially([])) },
    queries: {
      isMonthEnd: component(description("Whether today is the last day of the month."), output("boolean")),
      paymentResult: ["succeeded", "failed"],
      stateDeclared: component(input({ name: "string" }), output("boolean")),
      newId: component(output("string"), fresh()),
    },
    effects: { SendReceipt: input({ amount: "integer" }), Refund: description("What the customer paid is returned.") },
    decisions: { campaign: Campaign },
    calculations: { amountCharged: component(description("price × (100 − discount percent) ÷ 100"), output("integer")) },
    conditions: { paid: "The payment succeeded" },
    invariants: ["Every order past the draft state has a price"],
    commands: {
      PlaceOrder: component(
        input({ customerRank: Rank, listPrice: Yen }),
        from("DRAFT"),
        goTo("PENDING"),
        set({ rank: ref.input("customerRank"), price: ref.input("listPrice") }),
        does("An order confirmation is sent."),
      ),
      Checkout: component(
        from("PENDING"),
        onlyIf("The external payment module is active"),
        asks("declared", "stateDeclared", { name: "PAID" }),
        output(record({ result: ["paid", "failed"], receipt: optional("integer") })),
        when("paid", goTo("PAID"), emits("SendReceipt", { amount: ref.calculation("amountCharged") }), responds({ result: "paid", receipt: 1 })),
        otherwise(emits("Refund", onlyWhen(ref.was("PAID"))), responds({ result: "failed", receipt: null })),
      ),
    },
  });

test("節: 例の仕様は、木の検査を通る", () => {
  assert.deepEqual(check(sugar()), []);
});

test("節: dict 形式は、節だけの正規形と同じ木になる", () => {
  const normal = component(
    description("An order."),
    state("DRAFT"), state("PENDING"), state("PAID"),
    init("DRAFT"),
    data("rank", Rank), data("price", integer({ min: 0, max: 1_000_000 })), data("notes", list("string"), initially([])),
    query("isMonthEnd", description("Whether today is the last day of the month."), output("boolean")),
    query("paymentResult", output(["succeeded", "failed"])),
    query("stateDeclared", input(record(field("name", "string"))), output("boolean")),
    query("newId", output("string"), fresh()),
    effect("SendReceipt", input({ amount: "integer" })),
    effect("Refund", description("What the customer paid is returned.")),
    calculation("amountCharged", description("price × (100 − discount percent) ÷ 100"), output("integer")),
    command(
      "PlaceOrder",
      input({ customerRank: Rank, listPrice: Yen }),
      from("DRAFT"),
      goTo("PENDING"),
      set(field("rank", ref.input("customerRank")), field("price", ref.input("listPrice"))),
      does("An order confirmation is sent."),
    ),
    command(
      "Checkout",
      from("PENDING"),
      onlyIf("The external payment module is active"),
      asks("declared", "stateDeclared", field("name", "PAID")),
      output(record(field("result", ["paid", "failed"]), field("receipt", optional("integer")))),
      when("paid", goTo("PAID"), emits("SendReceipt", field("amount", ref.calculation("amountCharged"))), responds(field("result", "paid"), field("receipt", 1))),
      otherwise(emits("Refund", onlyWhen(ref.was("PAID"))), responds({ result: "failed", receipt: null })),
    ),
    decision("campaign", Campaign),
    condition("paid", "The payment succeeded"),
    invariant("Every order past the draft state has a price"),
  );
  assert.deepEqual(plain(sugar()), plain(normal));
  assert.deepEqual(check(normal), []);
});

test("節: 名前の無い component は、置いた先に溶け込む（共有する断片）", () => {
  const refused = component(when("The request is refused", responds("refused")), otherwise(responds("done")));
  const spec = component({ commands: { A: component(input({ n: "integer" }), refused), B: component(refused) } });
  assert.deepEqual(check(spec), []);
  const [a, b] = spec.children;
  assert.deepEqual(a.children.map((node) => node.kind), ["input", "when", "otherwise"]);
  assert.deepEqual(b.children.map((node) => node.kind), ["when", "otherwise"]);
});

test("木の検査: 書けない組み合わせ、多すぎる子、重なった名前を、場所と一緒に報告する", () => {
  const spec = component({
    states: ["A", "A"],
    init: "C",
    data: { count: component(integer(), output("integer")) },
    queries: { now: component(output("integer"), initially(0)) },
    effects: { Send: component(input({ a: "string" }), input({ a: "integer" }), from("A")) },
    commands: {
      Go: component(goTo("A"), when("x", description("no"), when("y")), fresh()),
      Stop: component(when("x", goTo("A")), when("x", goTo("A"))),
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
    '初期状態 "C" は、状態にありません'.replace(/^/, "unknown-state: "),
  ]);
  // 診断は、その節を書いた場所（このファイルの行）を指す
  for (const diagnostic of found) {
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
    commands: { A: component(input({ n: string({ examples: ["x"] }) }), emits("Send", { a: 1 }, { onlyWhen: true })) },
  } as never);
  assert.deepEqual(check(spec).map((d) => d.message), [
    '部品の中に、"commnds" というまとまりは書けません',
    'データ "days"の中に、裸の {}（受け取る語の無いもの）は書けません',
  ]);
});
