/**
 * Decides what happens with one entry an interpretation writes.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `overlay-check`.
 */

/**
 * What is already under the entry's name. Specification name: parameter
 * `existing`; the values are the specification's own.
 *
 * - `"none"`: nothing.
 * - `"prose"`: prose Layer 1 wrote.
 * - `"code"`: code Layer 1 wrote.
 * - `"interpretation"`: an entry of the interpretation itself.
 */
export type ExistingEntry = "none" | "prose" | "code" | "interpretation";

/**
 * What happens with the entry. Specification name: the result of the query
 * `Entry`; the values are the specification's own.
 *
 * - `"fill"`: the entry is taken in, filling what is under its name.
 * - `"add"`: the entry is taken in as a new one.
 * - `"wrong-heading"`: the entry is refused as being under the wrong heading.
 * - `"twice"`: the entry is refused as written twice.
 * - `"overwrite"`: the entry is refused as overwriting what is under its name.
 * - `"closed-heading"`: the entry is refused because of a closed heading.
 * - `"layer1-only"`: the entry is refused because of a heading reserved to Layer 1.
 */
export type EntryOutcome =
  | "fill"
  | "add"
  | "wrong-heading"
  | "twice"
  | "overwrite"
  | "closed-heading"
  | "layer1-only";

/**
 * Everything known about one entry. The field names are the specification's
 * parameter names.
 */
export interface EntryFacts {
  /** What is already under the entry's name (specification parameter `existing`). */
  existing: ExistingEntry;
  /** Whether what is there is under the same heading as the entry (specification parameter `sameHeading`). */
  sameHeading: boolean;
  /** Whether the entry's heading is closed to new entries (specification parameter `closedHeading`). */
  closedHeading: boolean;
  /** Whether only Layer 1 may write the entry's heading (specification parameter `layer1Only`). */
  layer1Only: boolean;
}

/**
 * Performs the specification's query `Entry` (`overlay-check.Entry`).
 *
 * Accepts any combination of the four facts and always answers. Reads no state,
 * so the same facts always give the same answer. Ask once per entry.
 *
 * @param facts the entry's four facts, one field per specification parameter.
 * @returns what happens with the entry.
 */
export function decideEntry(facts: EntryFacts): EntryOutcome {
  const { existing, sameHeading, closedHeading, layer1Only } = facts;

  if (existing === "none") {
    if (closedHeading) return "closed-heading";
    if (layer1Only) return "layer1-only";
    return "add";
  }

  if (!sameHeading) return "wrong-heading";
  if (existing === "interpretation") return "twice";
  if (existing === "code") return "overwrite";
  return "fill";
}
