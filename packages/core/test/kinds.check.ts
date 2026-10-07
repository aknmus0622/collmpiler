// 型の検査。さまざまな種類の部品が、同じ形 (コンポーネント + 解釈) で書けることを確かめる。
// 実行するテストではなく、pnpm typecheck が通ること自体が確認になる。
import { component, compose, decide, decisionTable, description, does, from, goTo, input, interpretation, onlyIf, otherwise, ref, when } from "../index.ts";

// K1: 最小の部品。語彙も決定表も無い。Layer 1 がすべてを構造で書き、解釈は意味だけを持つ
export const Toggle = component({
  states: ["OFF", "ON"],
  init: "OFF",
  commands: {
    Flip: compose(when("It is on", goTo("OFF"), does("It turns off.")), otherwise(goTo("ON"), does("It turns on."))),
  },
});
interpretation(Toggle, {
  structure: { commands: { Flip: { when: { "It is on": {}, otherwise: {} } } } },
  meanings: { conditions: { "It is on": (s) => s.status === "ON" } },
});

// K2: 文だけの部品。構造はすべて解釈が持つ
export const Counter = component(description("A counter that can be raised by a step and reset. It reports each new total."));
interpretation(Counter, {
  structure: {
    states: ["ACTIVE"],
    init: "ACTIVE",
    data: { total: "integer" },
    effects: { ReportTotal: { total: "integer" } },
    calculations: { raised: { is: "the total so far (0 if none) plus the step", type: "integer" } },
    invariants: ["The total is never negative"],
    commands: {
      Raise: {
        input: { step: { type: "integer", min: 0, max: 10 } },
        set: { total: ref.calculation("raised") },
        effects: [{ ReportTotal: { total: ref.calculation("raised") } }],
      },
      Reset: { set: { total: 0 }, effects: [{ ReportTotal: { total: 0 }, when: "The total is not zero" }] },
    },
  },
  meanings: {
    conditions: { "The total is not zero": (s) => (s.total ?? 0) !== 0 },
    calculations: { raised: (s) => (s.total ?? 0) + (s.step ?? 0) },
    invariants: { "The total is never negative": (s) => (s.total ?? 0) >= 0 },
  },
});

// K3: 一部だけを構造にした部品。語彙は文で、コマンドは部品で書く。部品 (retry) は共有できる
const Fee = decisionTable({
  "The parcel is heavy": { fee: 800, express: null },
  "The parcel is urgent": { fee: 1200, express: true },
  otherwise: { fee: 500, express: false },
});
const retry = compose(when("The carrier refused and tries remain", does("The request is sent again.")), otherwise(goTo("FAILED")));
export const Shipment = component({
  description: "Hands a parcel to a carrier.",
  states: ["NEW", "REQUESTED", "ACCEPTED", "FAILED"],
  init: "NEW",
  queries: description("Whether the carrier accepted."),
  effects: description("A pickup request with the fee; a notice to the sender."),
  decisions: { fee: Fee },
  calculations: { nextTry: description("the number of tries so far plus one") },
  commands: {
    Request: compose(input({ weight: { type: "integer", min: 0 }, urgent: "boolean" }), from("NEW"), goTo("REQUESTED"), does("A pickup is requested.")),
    Answered: compose(from("REQUESTED"), when("The carrier accepted", goTo("ACCEPTED"), does("The sender is notified.")), retry),
    Abandon: description("A shipment that has not been accepted can be abandoned; it then counts as failed."),
  },
});
interpretation(Shipment, {
  structure: {
    data: { tries: { type: "integer", min: 0, max: 5 } },
    queries: { accepted: "boolean" },
    effects: { RequestPickup: { fee: "integer" }, NotifySender: {} },
    calculations: { nextTry: { type: "integer" } },
    commands: {
      Request: { set: { tries: 1 }, effects: [{ RequestPickup: { fee: ref.decision("fee", "fee") } }] },
      Answered: {
        when: {
          "The carrier accepted": { effects: [{ NotifySender: {} }] },
          // goTo が無いので、状態は変わらない
          "The carrier refused and tries remain": {
            set: { tries: ref.calculation("nextTry") },
            effects: [{ RequestPickup: { fee: ref.decision("fee", "fee") } }],
          },
          otherwise: {},
        },
      },
      Abandon: { from: ["NEW", "REQUESTED"], goTo: "FAILED" },
    },
  },
  meanings: {
    conditions: {
      "The parcel is heavy": (s) => (s.weight ?? 0) > 20 && s.urgent !== true,
      "The parcel is urgent": (s) => s.urgent === true,
      "The carrier accepted": (s) => s.accepted,
      "The carrier refused and tries remain": (s) => !s.accepted && (s.tries ?? 0) < 3,
    },
    calculations: { nextTry: (s) => (s.tries ?? 0) + 1 },
  },
});
// 決定表の結果は、Layer 1 に表があれば型が付く
export const feeOf = (state: object): number => decide(Shipment, "fee", state).fee;
void onlyIf;
