import { defineBehaviors, applyDecision } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import { CancelRules } from "./cancel.dmn.ts";
import type { OrderStates, DomainCommand } from "./order.model.ts";

export const behaviors = defineBehaviors<OrderStates, DomainCommand>({
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
      "Shipped": (state) => state.SHIPPED({
        event: "Order shipped",
        effects: [{ action: "SendShippingNotice", payload: {} }]
      })
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
