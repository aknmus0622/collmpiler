// Laying an interpretation over Layer 1 (1.0): the Stage 0 of overlay-check. For one entry the interpretation writes,
// what is already there decides what happens. Collecting the facts and wording the problem are the reader's (read.ts).

export type OverlayFacts = {
  /** What is under that name already: nothing, Layer 1's prose, Layer 1's code, or the interpretation's own entry. */
  existing: "none" | "prose" | "code" | "interpretation";
  /** Whether the existing entry is under the same heading. */
  sameHeading: boolean;
  /** Whether Layer 1 wrote this heading and it is closed to new entries (commands and queries). */
  closedHeading: boolean;
  /** Whether the heading is one only Layer 1 writes (examples, components). */
  layer1Only: boolean;
};
export type OverlayDecision = "fill" | "add" | "wrong-heading" | "twice" | "overwrite" | "closed-heading" | "layer1-only";

export function overlayStage0({ existing, sameHeading, closedHeading, layer1Only }: OverlayFacts): OverlayDecision {
  if (existing !== "none") {
    if (!sameHeading) return "wrong-heading";
    if (existing === "interpretation") return "twice";
    if (existing === "code") return "overwrite";
    return "fill";
  }
  if (closedHeading) return "closed-heading";
  if (layer1Only) return "layer1-only";
  return "add";
}
