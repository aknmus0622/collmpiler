import type { MemberId } from "../ids.ts";
import { extendOutcome, registerOutcome } from "./outcomes.ts";
import type { ExtendResult, RegisterResult } from "./outcomes.ts";

/**
 * Registry of library members (specification component `members`).
 *
 * Holds the specification's whole state in memory. Nothing is persisted: a
 * new instance starts in the specification's initial state (no members, no
 * extended members). It has no dependencies on the outside world.
 *
 * Entry points:
 * - {@link Members.register} performs command `members.Register`.
 * - {@link Members.extend} performs command `members.Extend`.
 * - {@link Members.isMember} answers query `members.IsMember`.
 * - {@link Members.isExtended} answers query `members.IsExtended`.
 * The commands answer a string result; the queries answer a boolean and
 * never change the state.
 */
export class Members {
  /** Specification state `members`: the set of registered members. */
  readonly #registered: Set<MemberId>;

  /** Specification state `extended`: the set of extended members. */
  readonly #extended: Set<MemberId>;

  /** Creates a registry in the specification's initial state. */
  constructor() {
    this.#registered = new Set();
    this.#extended = new Set();
  }

  /**
   * Command `Register(member)`: asks to register a member.
   *
   * @param member the member to register (specification `member`); any
   *   identifier may be passed.
   * @returns `"registered"` or `"already"`, see {@link RegisterResult}.
   */
  register(member: MemberId): RegisterResult {
    const result = registerOutcome(this.isMember(member));
    if (result === "registered") {
      this.#registered.add(member);
    }
    return result;
  }

  /**
   * Command `Extend(member)`: asks to make a member an extended member.
   *
   * @param member the member to extend (specification `member`); any
   *   identifier may be passed, registered or not.
   * @returns `"extended"` or `"not-member"`, see {@link ExtendResult}.
   */
  extend(member: MemberId): ExtendResult {
    const result = extendOutcome(this.isMember(member));
    if (result === "extended") {
      this.#extended.add(member);
    }
    return result;
  }

  /**
   * Query `IsMember(member)`: whether the member is currently registered
   * (state `members`). Reads the current state only.
   *
   * @param member any member (specification `member`).
   */
  isMember(member: MemberId): boolean {
    return this.#registered.has(member);
  }

  /**
   * Query `IsExtended(member)`: whether the member is currently an extended
   * member (state `extended`). Reads the current state only.
   *
   * @param member any member (specification `member`).
   */
  isExtended(member: MemberId): boolean {
    return this.#extended.has(member);
  }
}
