import type { MemberId } from "../ids.ts";
import { balanceAfterCharge } from "./lateFee.ts";

/**
 * Ledger of late-return fines, per member (specification component `fines`).
 *
 * Holds the specification's whole state `owed` (a map from member to amount)
 * in memory. Nothing is persisted: a new instance starts in the
 * specification's initial state. It has no dependencies on the outside world.
 *
 * Entry points:
 * - {@link Fines.charge} performs command `fines.Charge`.
 * - {@link Fines.pay} performs command `fines.Pay`.
 * - {@link Fines.owed} answers query `fines.Owed`.
 * The commands answer nothing; only the query returns a value.
 */
export class Fines {
  /**
   * Specification state `owed`: for each member that has an entry, the
   * amount (whole yen) recorded against them. A member absent from this map
   * is absent from the specification's map too.
   */
  readonly #balances: Map<MemberId, number>;

  /** Creates a ledger in the specification's initial state. */
  constructor() {
    this.#balances = new Map();
  }

  /**
   * Command `Charge(days, member)`: records the fine for one late return
   * against a member.
   *
   * @param member the member who returned late (specification `member`).
   * @param daysLate how many days late the return was (specification `days`).
   *   Values outside the specification's `requires` are never passed.
   */
  charge(member: MemberId, daysLate: number): void {
    this.#balances.set(member, balanceAfterCharge(this.owed(member), daysLate));
  }

  /**
   * Command `Pay(member)`: the member settles their fines in full.
   *
   * @param member the paying member (specification `member`). Any member may
   *   be passed, including one with nothing recorded.
   */
  pay(member: MemberId): void {
    this.#balances.delete(member);
  }

  /**
   * Query `Owed(member)`: how much the member currently owes, in whole yen.
   * Reads the current state only; never changes it.
   *
   * @param member any member (specification `member`), known to the ledger or not.
   */
  owed(member: MemberId): number {
    return this.#balances.get(member) ?? 0;
  }
}
