/**
 * Pure business rules of the members component, kept apart from the stateful
 * `Members` registry so they can be reasoned about on their own.
 */

/**
 * What command `Extend` answers (specification output of `members.Extend`).
 * - `"not-member"`: the member is not registered; nothing changed.
 * - `"extended"`: the member is now an extended member.
 */
export type ExtendResult = "not-member" | "extended";

/**
 * Decides the answer of an extension request.
 *
 * @param isRegistered whether the member is registered before the request,
 *   exactly as `Members.isMember` answers for them at that moment.
 * @returns the answer of `Extend`; `"extended"` means the caller must record
 *   the member as extended.
 */
export function extendOutcome(isRegistered: boolean): ExtendResult {
  return isRegistered ? "extended" : "not-member";
}
