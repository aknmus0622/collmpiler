import { applyDecision, bindSpecification } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import { CancelRules } from "./cancel.dmn.ts";
import { ShippingRules } from "./shipping.dmn.ts";
import { OrderModel } from "./order.model.ts";

// Binds every natural-language name in the spec to a function.
// The same sentence means the same thing wherever it appears.
export const Specification = bindSpecification(OrderModel, {
  // A missing binding for any row of these tables is a compile error.
  tables: { CampaignRules, CancelRules, ShippingRules },

  // Conditions: decision-table rows, preconditions (where), and the keys of cases.
  // At most one may hold at a time; more than one is a RuleConflictError (hit policy: unique).
  conditions: {
    "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
    "The customer is a Silver member": (state) => state.rank === "Silver",
    "The order has been paid": (state) => state.status === "PAID",
    "The customer is a Gold member, or the order is 10,000 yen or more": (state) => state.rank === "Gold" || (state.price ?? 0) >= 10_000,
    "The external payment module is active": (state) => state.paymentModuleActive,
    "The payment succeeded": (state) => state.paymentResult === "succeeded"
  },

  // Formulas
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": (state) =>
      Math.floor(((state.price ?? 0) * (100 - applyDecision(CampaignRules, state).discountPercent)) / 100)
  },

  // Invariants: these check the spec itself, not the implementation.
  invariants: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined)
  }
});
