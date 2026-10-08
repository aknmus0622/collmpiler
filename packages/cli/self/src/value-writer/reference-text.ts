import type { Reference, ReferenceTarget } from "./types.ts";

/**
 * Pure decision. Corresponds to the `prefix` column of the specification's `form` decision table.
 *
 * @param target what kind of thing the reference refers to
 * @returns the value of the `prefix` column
 */
export function referencePrefix(target: ReferenceTarget): string {
  if (target === "calculation") return "calculation:";
  if (target === "query") return "query:";
  if (target === "input") return "input:";
  if (target === "data") return "data:";
  return "decision:";
}

/**
 * Pure calculation. Corresponds to the specification's `referenceText`.
 *
 * @param reference the reference to write (the input of the `Reference` command)
 */
export function referenceText(reference: Reference): string {
  const referredTo =
    reference.target === "decision" ? reference.table + "." + reference.column : reference.name;
  return referencePrefix(reference.target) + referredTo;
}
