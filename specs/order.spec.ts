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
        // Remember the rank and the price; checkout and shipping depend on them.
        set: { rank: state.customerRank, price: state.listPrice },
        effects: [{ action: "SendOrderConfirmation", payload: {} }]
      })
    }
  },
  Checkout: {
    from: ["PENDING"],
    where: ["The external payment module is active"],
    cases: {
      "The payment succeeded": (state) => {
        // No logic here: apply the decision table and the formula, then map their results.
        const campaign = applyDecision(CampaignRules, state);
        const amount = applyFormula(OrderModel, "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen", state);

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
