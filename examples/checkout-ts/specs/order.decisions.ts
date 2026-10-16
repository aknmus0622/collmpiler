import { conditions, decisions, otherwise } from "@clp/core";
export const CampaignIf = conditions({
  customerGoldMemberMonthEnd: "The customer is a Gold member and it is month-end",
  customerSilverMember: "The customer is a Silver member",
});

export const ShippingIf = conditions({
  customerGoldMemberOrder10: "The customer is a Gold member, or the order is 10,000 yen or more",
});

// Decision tables: a condition in natural language selects a row of values.
// `otherwise` is mandatory and every row has the same columns. Cells hold values only;
// `null` means the row gives no value for that column (it must not be used when that row applies).
// The name of a table (`campaign`) is the key it is declared under; its columns are `Decision.campaign.discountPercent`.
export const Decision = decisions({
  // The discount is a whole-number percentage (fractions would make the amount calculation inexact).
  campaign: [
    CampaignIf.customerGoldMemberMonthEnd.then({ discountPercent: 20, grantsCoupon: true, coupon: "Premium" }),
    CampaignIf.customerSilverMember.then({ discountPercent: 5, grantsCoupon: false, coupon: null }),
    otherwise({ discountPercent: 0, grantsCoupon: false, coupon: null }),
  ],
  shipping: [ShippingIf.customerGoldMemberOrder10.then({ priority: true }), otherwise({ priority: false })],
});
