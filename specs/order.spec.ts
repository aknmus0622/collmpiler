import { defineBehaviors, applyDecision } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import type { OrderStates, DomainCommand } from "./vocabulary.ts";

export const behaviors = defineBehaviors<OrderStates, DomainCommand>({
  Checkout: {
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
      }
    }
  }
});
