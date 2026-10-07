import { decisionTable } from "@aac/core";

// Decision tables: a condition in natural language selects a row of values.
// `otherwise` is mandatory and every row has the same columns. Cells hold values only;
// `null` means the row gives no value for that column (it must not be used when that row applies).

// The discount is a whole-number percentage (fractions would make the amount calculation inexact).
export const Campaign = decisionTable({
  "The customer is a Gold member and it is month-end": { discountPercent: 20, grantsCoupon: true, coupon: "Premium" },
  "The customer is a Silver member": { discountPercent: 5, grantsCoupon: false, coupon: null },
  otherwise: { discountPercent: 0, grantsCoupon: false, coupon: null },
});

export const Shipping = decisionTable({
  "The customer is a Gold member, or the order is 10,000 yen or more": { priority: true },
  otherwise: { priority: false },
});
