// 型の検査。さまざまな種類の部品が、同じ形 (コンポーネント + 結び付け) で書けることを確かめる。
// 実行するテストではなく、pnpm typecheck が通ること自体が確認になる。
import { bind, component, decisionTable, ref } from "../index.ts";

// K1: 最小の部品。語彙も決定表も無い
export const Toggle = component({
  states: ["OFF", "ON"],
  init: "OFF",
  commands: {
    Flip: {
      when: {
        "It is on": { goTo: "OFF", does: "It turns off." },
        otherwise: { goTo: "ON", does: "It turns on." },
      },
    },
  },
});
bind(Toggle, {
  commands: { Flip: { "It is on": {}, otherwise: {} } },
  conditions: { "It is on": (s) => s.status === "ON" },
});

// K2: UI 部品 (カートのボタン)。副作用 = ユースケースの呼び出しと表示の更新、問い合わせ = 画面の状態
export const CheckoutButton = component({
  states: ["IDLE", "SUBMITTING", "DONE", "FAILED"],
  init: "IDLE",
  queries: { cartIsEmpty: "boolean" },
  effects: { RequestCheckout: {}, ShowMessage: { kind: ["empty-cart", "thanks", "retry"] } },
  commands: {
    Click: {
      from: ["IDLE", "FAILED"],
      when: {
        "The cart is empty": { goTo: "IDLE", does: "A message says the cart is empty." },
        otherwise: { goTo: "SUBMITTING", does: "The checkout is requested." },
      },
    },
    CheckoutFinished: {
      input: { ok: "boolean" },
      from: ["SUBMITTING"],
      when: {
        "The checkout succeeded": { goTo: "DONE", does: "A thank-you message is shown." },
        otherwise: { goTo: "FAILED", does: "A message invites the user to retry." },
      },
    },
  },
});
bind(CheckoutButton, {
  commands: {
    Click: {
      "The cart is empty": { effects: [{ ShowMessage: { kind: "empty-cart" } }] },
      otherwise: { effects: [{ RequestCheckout: {} }] },
    },
    CheckoutFinished: {
      "The checkout succeeded": { effects: [{ ShowMessage: { kind: "thanks" } }] },
      otherwise: { effects: [{ ShowMessage: { kind: "retry" } }] },
    },
  },
  conditions: {
    "The cart is empty": (s) => s.cartIsEmpty,
    "The checkout succeeded": (s) => s.ok === true,
  },
});

// K3: ドメインの部品 (在庫)。問い合わせの値で遷移先が変わり、同じ文が決定表の行と when のキーの両方に現れる
const Urgency = decisionTable({ "Stock is out": { urgent: true }, otherwise: { urgent: false } });
export const Stock = component({
  states: ["AVAILABLE", "RESERVED", "BACKORDERED"],
  init: "AVAILABLE",
  data: { reservedBy: "string" },
  queries: { quantityOnHand: { type: "integer", min: 0, max: 100, around: [1] }, auditing: "boolean" },
  effects: { NotifyWarehouse: { urgent: "boolean", customer: "string" }, Audit: {} },
  decisions: { urgency: Urgency },
  commands: {
    Reserve: {
      input: { customer: "string" },
      from: ["AVAILABLE"],
      when: {
        "Stock is out": { goTo: "BACKORDERED", does: "The warehouse is notified urgently." },
        otherwise: { goTo: "RESERVED", does: "The reservation is remembered." },
      },
    },
    Release: { from: ["RESERVED", "BACKORDERED"], then: { goTo: "AVAILABLE", does: "A backorder is audited when auditing is on." } },
  },
});
bind(Stock, {
  commands: {
    Reserve: {
      "Stock is out": { effects: [{ NotifyWarehouse: { urgent: ref.decision("urgency", "urgent"), customer: ref.input("customer") } }] },
      otherwise: { set: { reservedBy: ref.input("customer") } },
    },
    Release: {
      effects: [
        { Audit: {}, when: ref.was("BACKORDERED") },
        { Audit: {}, when: ref.query("auditing") },
        { NotifyWarehouse: { urgent: false, customer: ref.data("reservedBy") }, when: "Stock is out" },
      ],
    },
  },
  // 同じ文の結び付けは1つ
  conditions: { "Stock is out": (s) => s.quantityOnHand === 0 },
});
