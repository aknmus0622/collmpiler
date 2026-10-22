/**
 * Pure business rules of the members component, kept apart from the stateful
 * `Members` registry so they can be reasoned about on their own.
 */

/**
 * What command `Register` answers (specification output of `members.Register`).
 * - `"already"`: the member was already registered; nothing changed.
 * - `"registered"`: the member is now registered.
 */
export type RegisterResult = "already" | "registered";

/**
 * What command `Extend` answers (specification output of `members.Extend`).
 * - `"not-member"`: the member is not registered; nothing changed.
 * - `"extended"`: the member is now an extended member.
 */
export type ExtendResult = "not-member" | "extended";

/**
 * Decides the answer of a registration request.
 *
 * @param alreadyRegistered whether the member is registered before the
 *   request, exactly as `Members.isMember` answers for them at that moment.
 * @returns the answer of `Register`; `"registered"` means the caller must
 *   record the member as registered.
 */
export function registerOutcome(alreadyRegistered: boolean): RegisterResult {
  return alreadyRegistered ? "already" : "registered";
}

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
