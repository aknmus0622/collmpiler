import { defineBehaviors, applyDecision } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import { CancelRules } from "./cancel.dmn.ts";
import { ShippingRules } from "./shipping.dmn.ts";
import type { OrderModel } from "./order.model.ts";

export const behaviors = defineBehaviors<typeof OrderModel>({
  PlaceOrder: {
    from: ["DRAFT"],
    cases: {
      "Placed": (state) => state.PENDING({
        event: "Order placed",
        // 入力の会員ランクを注文に覚えさせる（決済と出荷で使う）
        set: { rank: state.customerRank },
        effects: [{ action: "SendOrderConfirmation", payload: {} }]
      })
    }
  },
  Checkout: {
    from: ["PENDING"],
    where: ["外部決済モジュールが有効な場合"],
    cases: {
      "PaymentSuccess": (state) => {
        // ロジックは持たず、表データ(DMN)を適用（applyDecision）し、その結果をマッピングするのみ
        const campaign = applyDecision(CampaignRules, state);

        return state.PAID({
          event: "Payment completed",
          effects: [
            { action: "SendReceipt", payload: { discount: campaign.discount } },
            ...campaign.effects
          ]
        });
      },
      "PaymentFailure": (state) => state.PENDING({
        event: "Payment failed",
        effects: [{ action: "NotifyPaymentFailure", payload: {} }]
      })
    }
  },
  Ship: {
    from: ["PAID"],
    cases: {
      "Shipped": (state) => {
        const shipping = applyDecision(ShippingRules, state);

        return state.SHIPPED({
          event: "Order shipped",
          effects: [{ action: "SendShippingNotice", payload: { priority: shipping.priority } }]
        });
      }
    }
  },
  Cancel: {
    from: ["PENDING", "PAID"],
    cases: {
      "Cancelled": (state) => {
        const cancel = applyDecision(CancelRules, state);

        return state.CANCELLED({ event: "Order cancelled", effects: [...cancel.effects] });
      }
    }
  }
});
