// 型の検査。さまざまな種類の部品が、同じ形 (境界と構造 + case + 結び付け) で書けることを確かめる。
// 実行するテストではなく、tsc が通ること自体が確認になる。
import { applyDecision, bindSpecification, defineComponent } from "../index.ts";
import type { DecisionTable } from "../index.ts";

// K1: 最小のコンポーネント。data / queries / commands / formulas / invariants をすべて省略し、1つの式で書く
export const Toggle = defineComponent({
  initial: "OFF",
  states: ["OFF", "ON"],
  actions: { Flip: {} },
}).cases({
  Flip: { "It is on": (s) => s.OFF(), default: (s) => s.ON() },
});
bindSpecification(Toggle, { conditions: { "It is on": (s) => s.status === "ON" } });

// K2: UI 部品 (カートのボタン)。指示 = ユースケースの呼び出しと表示の更新、問い合わせ = 画面の入力
export const CheckoutButton = defineComponent({
  initial: "IDLE",
  states: ["IDLE", "SUBMITTING", "DONE", "FAILED"],
  data: { attempts: { type: "integer", min: 0, max: 3 } },
  queries: { cartIsEmpty: "boolean" },
  commands: { RequestCheckout: {}, ShowMessage: { kind: ["empty-cart", "thanks", "retry"] } },
  actions: {
    Click: { from: ["IDLE", "FAILED"] },
    CheckoutFinished: { input: { ok: "boolean" }, from: ["SUBMITTING"] },
  },
}).cases({
  Click: {
    "The cart is empty": (s) => s.IDLE({ effects: [{ action: "ShowMessage", payload: { kind: "empty-cart" } }] }),
    default: (s) => s.SUBMITTING({ effects: [{ action: "RequestCheckout", payload: {} }] }),
  },
  CheckoutFinished: {
    "The checkout succeeded": (s) => s.DONE({ effects: [{ action: "ShowMessage", payload: { kind: "thanks" } }] }),
    default: (s) => s.FAILED({ effects: [{ action: "ShowMessage", payload: { kind: "retry" } }] }),
  },
});
bindSpecification(CheckoutButton, {
  conditions: {
    "The cart is empty": (s) => s.cartIsEmpty,
    "The checkout succeeded": (s) => s.ok === true,
  },
});

// K3: ドメインの部品 (在庫)。状態によって次の状態が変わる (以前の outcome では書けなかった形)
const StockBoundary = defineComponent({
  initial: "AVAILABLE",
  states: ["AVAILABLE", "RESERVED", "BACKORDERED"],
  queries: { quantityOnHand: { type: "integer", min: 0, max: 100, around: [1] } },
  commands: { NotifyWarehouse: { urgent: "boolean" } },
  actions: { Reserve: { from: ["AVAILABLE"] }, Release: { from: ["RESERVED", "BACKORDERED"] } },
});
const UrgencyRules = {
  "Stock is out": { urgent: true },
  default: { urgent: false },
} as const satisfies DecisionTable<{ urgent: boolean }>;
export const Stock = StockBoundary.cases({
  Reserve: {
    "Stock is out": (s) => s.BACKORDERED({ effects: [{ action: "NotifyWarehouse", payload: { urgent: applyDecision(UrgencyRules, s).urgent } }] }),
    default: (s) => s.RESERVED(),
  },
  Release: (s) => s.AVAILABLE(),
});
// 同じ文 ("Stock is out") が case のキーと決定表の行の両方に現れる。結び付けは1つ
bindSpecification(Stock, { tables: { UrgencyRules }, conditions: { "Stock is out": (s) => s.quantityOnHand === 0 } });

// K4: 値オブジェクト的な部品 (金額)。状態を持たず、操作が値を返す。現在の枠組みでは「指示」としてしか結果を出せない
export const Money = defineComponent({
  initial: "VALID",
  states: ["VALID"],
  commands: { Result: { amount: "integer" } },
  formulas: { "Sum of the two amounts": "integer" },
  actions: { Add: { input: { a: { type: "integer", min: 0 }, b: { type: "integer", min: 0 } } } },
}).cases({
  Add: (s) => s.VALID({ effects: [{ action: "Result", payload: { amount: s.a + s.b } }] }),
});
bindSpecification(Money, { conditions: {}, formulas: { "Sum of the two amounts": (s) => (s.a ?? 0) + (s.b ?? 0) } });
