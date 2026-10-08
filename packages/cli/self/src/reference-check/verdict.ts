import type { ReferenceCheckVerdict } from "./types.ts";

/**
 * Pure decision. Chooses the outcome of the specification's `Finish` command.
 *
 * @param reported the specification's `data.reported`
 * @returns the state the `Finish` command goes to
 */
export function verdictOf(reported: boolean): ReferenceCheckVerdict {
  return reported ? "rejected" : "accepted";
}
