/**
 * The business decisions of the value writer as pure functions: they take plain values, return plain
 * values, and touch no dependency. The `ValueWriter` class (see `value-writer.ts`) gathers the inputs, calls
 * these, and carries out what they return.
 *
 * The rules themselves are in the specification, not in these comments.
 */

import type { Reference, ReferenceTarget } from "./value-writer-types.ts";

/**
 * The specification's decision table `form`, column `prefix`.
 *
 * @param target the kind of thing the reference refers to (the `Reference` command's `target` input).
 * @returns the prefix the table gives for that kind of reference.
 */
export function referencePrefix(target: ReferenceTarget): string {
  switch (target) {
    case "calculation":
      return "calculation:";
    case "query":
      return "query:";
    case "input":
      return "input:";
    case "data":
      return "data:";
    default:
      return "decision:";
  }
}

/**
 * The specification's calculation `referenceText`.
 *
 * @param reference the reference handed to the writer (the input of the `Reference` command).
 * @returns the reference as one text (the `text` payload field of the `WriteReference` effect).
 */
export function referenceText(reference: Reference): string {
  const prefix = referencePrefix(reference.target);
  if (reference.target === "decision") {
    return prefix + reference.table + "." + reference.column;
  }
  return prefix + reference.name;
}
