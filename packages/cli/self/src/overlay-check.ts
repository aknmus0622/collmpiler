/**
 * Overlay check: decides what happens with each entry an interpretation writes.
 *
 * Corresponds to the specification component `overlay-check`. It has no state
 * and no dependencies; its only entry is the query `Entry`, implemented here
 * by the pure function {@link overlayCheck}.
 */

/**
 * Specification query `overlay-check.Entry` (calculation `entry`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 *
 * @param entry one entry the interpretation writes and what is known about the
 *              place it is written to (the specification's parameters, as one record).
 * @returns what happens with the entry (the specification's result).
 */
export function overlayCheck(entry: OverlayEntry): OverlayOutcome {
  if (entry.existing !== "none") {
    if (!entry.sameHeading) return "wrong-heading";
    if (entry.existing === "interpretation") return "twice";
    if (entry.existing === "code") return "overwrite";
    return "fill";
  }
  if (entry.closedHeading) return "closed-heading";
  if (entry.layer1Only) return "layer1-only";
  return "add";
}

/**
 * The input of the `Entry` query: one entry of the interpretation.
 * Each field is the specification parameter of the same name.
 */
export interface OverlayEntry {
  /** What is already under the entry's name (specification parameter `existing`). */
  existing: OverlayExisting;
  /**
   * Whether what is already under the name is under the same heading as the
   * entry (specification parameter `sameHeading`). Only meaningful when
   * something is there.
   */
  sameHeading: boolean;
  /**
   * Whether the entry's heading is closed to new entries, because Layer 1
   * wrote that heading (specification parameter `closedHeading`).
   */
  closedHeading: boolean;
  /**
   * Whether the entry's heading is one only Layer 1 may write, such as
   * examples or components (specification parameter `layer1Only`).
   */
  layer1Only: boolean;
}

/**
 * What is already under the entry's name (specification parameter `existing`).
 *
 * - `"none"`: nothing.
 * - `"prose"`: prose Layer 1 wrote.
 * - `"code"`: code Layer 1 wrote.
 * - `"interpretation"`: an entry the interpretation itself wrote.
 */
export type OverlayExisting = "none" | "prose" | "code" | "interpretation";

/**
 * What happens with the entry (the specification's result of `Entry`).
 *
 * - `"fill"`: it fills the prose under its name.
 * - `"add"`: it is added.
 * - `"wrong-heading"`: its name is already used under another heading.
 * - `"twice"`: the interpretation wrote the same entry again.
 * - `"overwrite"`: it would overwrite Layer 1's code, which is refused.
 * - `"closed-heading"`: its heading is closed to new entries, so it is refused.
 * - `"layer1-only"`: its heading is written only by Layer 1, so it is refused.
 */
export type OverlayOutcome =
  | "fill"
  | "add"
  | "wrong-heading"
  | "twice"
  | "overwrite"
  | "closed-heading"
  | "layer1-only";
