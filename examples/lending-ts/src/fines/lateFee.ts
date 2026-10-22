/**
 * Pure business rules of the fines component, kept apart from the stateful
 * `Fines` ledger so they can be reasoned about on their own.
 */

/** Fine per day late, in whole yen. */
const FEE_PER_DAY_YEN = 10;

/**
 * The fine incurred by one late return.
 *
 * @param daysLate how many days after the due date the item came back
 *   (specification: `days` of command `Charge`); callers only pass values
 *   the specification allows for that parameter.
 * @returns the amount (whole yen) that this return adds to the member's balance.
 */
export function lateFee(daysLate: number): number {
  return daysLate * FEE_PER_DAY_YEN;
}

/**
 * The balance a member owes after one more late return is charged.
 *
 * @param currentBalance what the member owed before the charge, exactly as
 *   `Fines.owed` answers for them at that moment.
 * @param daysLate as for {@link lateFee}.
 * @returns the new balance to record for the member.
 */
export function balanceAfterCharge(currentBalance: number, daysLate: number): number {
  return currentBalance + lateFee(daysLate);
}
