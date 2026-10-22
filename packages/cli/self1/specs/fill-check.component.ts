import { service, value } from "@clp/core/v1";

// What a prose fragment inside a body becomes (packages/cli/src/v1/fills.ts, used by the reader in v1/build.ts): a fragment
// is a condition (`is.name("…", expr?)`), something that happens (`does.name("…")`) or a value (`value.name("…")`); its
// content is the expression written with it, or the entry of that name under its heading (conditions, does, calcs).
export const FillCheck = service("Decides what a prose fragment inside a body becomes.", {
  queries: {
    Fragment(
      kind: "is" | "does" | "value",
      inline: boolean,
      entry: "none" | "elsewhere" | "prose" | "method" | "expression",
      byInterpretation: boolean,
    ): "inline" | "fill" | "prose-left" | "overwrite" | "clash" | "not-a-method" {
      return value.fragment(
        "A fragment, given its kind; whether its expression is written with it (inline); what is under its name: nothing, " +
          "something under another heading Layer 1 wrote (elsewhere), prose, a method, or an expression; and whether that entry " +
          "was written by the interpretation. A name used elsewhere is a clash: one component has one namespace. An inline " +
          "expression is used (inline), but the interpretation writing an entry for it too is an overwrite. Without an inline " +
          "expression: nothing or prose under the name leaves the fragment as prose (prose-left); a method is its content " +
          "(fill); an expression is the content of a condition (fill), but not of something that happens or a value, which " +
          "must be methods (not-a-method).",
      );
    },
  },
});
