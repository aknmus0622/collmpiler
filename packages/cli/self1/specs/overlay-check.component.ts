import { service, value } from "@clp/core/v1";

// Laying an interpretation over Layer 1 (packages/cli/src/v1/overlay.ts, used by `readProgram` in v1/read.ts): for one
// entry the interpretation writes under a heading, what is already under that name decides whether it fills Layer 1's
// prose, adds something new, or is a problem. Finding the entries and wording the problems is the reader's.
export const OverlayCheck = service("Decides what happens with each entry an interpretation writes.", {
  queries: {
    Entry(
      existing: "none" | "prose" | "code" | "interpretation",
      sameHeading: boolean,
      closedHeading: boolean,
      layer1Only: boolean,
    ): "fill" | "add" | "wrong-heading" | "twice" | "overwrite" | "closed-heading" | "layer1-only" {
      return value.entry(
        "An entry of the interpretation, given what is already under its name: nothing, prose Layer 1 wrote, code Layer 1 wrote, or " +
          "an entry of the interpretation itself; whether that is under the same heading; whether the heading is closed to new " +
          "entries (Layer 1 wrote the commands or queries heading); and whether only Layer 1 may write the heading (examples, " +
          "components). When something is there: under another heading it is wrong-heading; the interpretation's own entry " +
          "written again is twice; Layer 1's code cannot be overwritten (overwrite); Layer 1's prose is filled. When nothing is " +
          "there: a closed heading refuses it (closed-heading), a heading only Layer 1 writes refuses it (layer1-only), and " +
          "otherwise it is added.",
      );
    },
  },
});
