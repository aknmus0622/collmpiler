// Sentence tracing (1.0, DSL.md §17.8 ④): the Stage 0 of sentence-trace. Each fact is about one thing: a sentence of a
// component's description, a key of the interpretation's `trace`, a name it points to, or a component embedded in the
// description as `${X}`.

export type TraceFacts =
  | { kind: "sentence"; covered: boolean; added: boolean }
  | { kind: "key"; inDescription: boolean }
  | { kind: "target"; exists: boolean }
  | { kind: "embedded"; isComponent: boolean; used: boolean };
export type TraceProblem = "none" | "sentence-unused" | "unknown-sentence" | "unknown-name" | "embedded-unused";

export function traceStage0(facts: TraceFacts): TraceProblem {
  switch (facts.kind) {
    // a sentence must become something only when the interpretation added commands or queries Layer 1 did not name
    case "sentence":
      return facts.added && !facts.covered ? "sentence-unused" : "none";
    case "key":
      return facts.inDescription ? "none" : "unknown-sentence";
    case "target":
      return facts.exists ? "none" : "unknown-name";
    case "embedded":
      return !facts.isComponent ? "unknown-name" : facts.used ? "none" : "embedded-unused";
  }
}
