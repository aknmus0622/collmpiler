// 型の検査。さまざまな種類の部品が、同じ形 (コンポーネント + 結び付け) で書けることを確かめる。
// 実行するテストではなく、pnpm typecheck が通ること自体が確認になる。
import { asked, bind, component, decided, decisionTable, given, remembered, was } from "../index.ts";

// K1: 最小の部品。語彙も決定表も無い
export const Toggle = component({
  states: ["OFF", "ON"],
  startsIn: "OFF",
  actions: {
    Flip: {
      when: {
        "It is on": { goTo: "OFF", does: "It turns off." },
        otherwise: { goTo: "ON", does: "It turns on." },
      },
    },
  },
});
bind(Toggle, {
  actions: { Flip: { "It is on": {}, otherwise: {} } },
  conditions: { "It is on": (s) => s.status === "ON" },
});

// K2: UI 部品 (カートのボタン)。指示 = ユースケースの呼び出しと表示の更新、問い合わせ = 画面の状態
export const CheckoutButton = component({
  states: ["IDLE", "SUBMITTING", "DONE", "FAILED"],
  startsIn: "IDLE",
  asks: { cartIsEmpty: "boolean" },
  tells: { RequestCheckout: {}, ShowMessage: { kind: ["empty-cart", "thanks", "retry"] } },
  actions: {
    Click: {
      allowedIn: ["IDLE", "FAILED"],
      when: {
        "The cart is empty": { goTo: "IDLE", does: "A message says the cart is empty." },
        otherwise: { goTo: "SUBMITTING", does: "The checkout is requested." },
      },
    },
    CheckoutFinished: {
      takes: { ok: "boolean" },
      allowedIn: ["SUBMITTING"],
      when: {
        "The checkout succeeded": { goTo: "DONE", does: "A thank-you message is shown." },
        otherwise: { goTo: "FAILED", does: "A message invites the user to retry." },
      },
    },
  },
});
bind(CheckoutButton, {
  actions: {
    Click: {
      "The cart is empty": { tell: [{ ShowMessage: { kind: "empty-cart" } }] },
      otherwise: { tell: [{ RequestCheckout: {} }] },
    },
    CheckoutFinished: {
      "The checkout succeeded": { tell: [{ ShowMessage: { kind: "thanks" } }] },
      otherwise: { tell: [{ ShowMessage: { kind: "retry" } }] },
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
  startsIn: "AVAILABLE",
  remembers: { reservedBy: "string" },
  asks: { quantityOnHand: { type: "integer", min: 0, max: 100, around: [1] }, auditing: "boolean" },
  tells: { NotifyWarehouse: { urgent: "boolean", customer: "string" }, Audit: {} },
  decisions: { urgency: Urgency },
  actions: {
    Reserve: {
      takes: { customer: "string" },
      allowedIn: ["AVAILABLE"],
      when: {
        "Stock is out": { goTo: "BACKORDERED", does: "The warehouse is notified urgently." },
        otherwise: { goTo: "RESERVED", does: "The reservation is remembered." },
      },
    },
    Release: { allowedIn: ["RESERVED", "BACKORDERED"], then: { goTo: "AVAILABLE", does: "A backorder is audited when auditing is on." } },
  },
});
bind(Stock, {
  actions: {
    Reserve: {
      "Stock is out": { tell: [{ NotifyWarehouse: { urgent: decided("urgency", "urgent"), customer: given("customer") } }] },
      otherwise: { remember: { reservedBy: given("customer") } },
    },
    Release: {
      tell: [
        { Audit: {}, when: was("BACKORDERED") },
        { Audit: {}, when: asked("auditing") },
        { NotifyWarehouse: { urgent: false, customer: remembered("reservedBy") }, when: "Stock is out" },
      ],
    },
  },
  // 同じ文の結び付けは1つ
  conditions: { "Stock is out": (s) => s.quantityOnHand === 0 },
});
