// What a prose fragment inside a body becomes (1.0): the Stage 0 of fill-check. A fragment is `is.name("…", expr?)`,
// `does.name("…")` or `value.name("…")`; its content is the expression written with it, or the entry of that name the
// interpretation (or Layer 1) wrote under its heading (`conditions`, `does`, `calcs`).

export type FillFacts = {
  kind: "is" | "does" | "value";
  /** Whether the expression is written with the fragment itself (`is.name("…", expr)`). */
  inline: boolean;
  /** What is under the fragment's name: nothing, something under another heading, prose, a method, or an expression. */
  entry: "none" | "elsewhere" | "prose" | "method" | "expression";
  /** Whether that entry was written by the interpretation. */
  byInterpretation: boolean;
};
export type FillDecision = "inline" | "fill" | "prose-left" | "overwrite" | "clash" | "not-a-method";

export function fillStage0({ kind, inline, entry, byInterpretation }: FillFacts): FillDecision {
  if (entry === "elsewhere") return "clash";
  if (inline) return entry !== "none" && byInterpretation ? "overwrite" : "inline";
  if (entry === "none" || entry === "prose") return "prose-left";
  if (entry === "method") return "fill";
  return kind === "is" ? "fill" : "not-a-method";
}
