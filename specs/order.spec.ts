import { defineBehaviors, applyDecision, applyFormula } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import { CancelRules } from "./cancel.dmn.ts";
import { ShippingRules } from "./shipping.dmn.ts";
import { OrderModel } from "./order.model.ts";

export const behaviors = defineBehaviors<typeof OrderModel>({
  PlaceOrder: {
    from: ["DRAFT"],
    cases: {
      "default": (state) => state.PENDING({
        event: "Order placed",
        // 入力の会員ランクと価格を注文に覚えさせる（決済と出荷で使う）
        set: { rank: state.customerRank, price: state.listPrice },
        effects: [{ action: "SendOrderConfirmation", payload: {} }]
      })
    }
  },
  Checkout: {
    from: ["PENDING"],
    where: ["外部決済モジュールが有効な場合"],
    cases: {
      "決済に成功した場合": (state) => {
        // ロジックは持たず、表データ(DMN)と計算を適用し、その結果をマッピングするのみ
        const campaign = applyDecision(CampaignRules, state);
        const amount = applyFormula(OrderModel, "請求金額（価格 ×（100 − 割引率）÷ 100、1円未満切り捨て）", state);

        return state.PAID({
          event: "Payment completed",
          effects: [
            { action: "SendReceipt", payload: { discountPercent: campaign.discountPercent, amount } },
            ...campaign.effects
          ]
        });
      },
      "default": (state) => state.PENDING({
        event: "Payment failed",
        effects: [{ action: "NotifyPaymentFailure", payload: {} }]
      })
    }
  },
  Ship: {
    from: ["PAID"],
    cases: {
      "default": (state) => {
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
      "default": (state) => {
        const cancel = applyDecision(CancelRules, state);

        return state.CANCELLED({ event: "Order cancelled", effects: [...cancel.effects] });
      }
    }
  }
});
