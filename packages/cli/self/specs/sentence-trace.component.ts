import { service, value } from "@clp/core";

// Sentence tracing (packages/cli/src/v1/trace.ts, used by the reader in v1/build.ts, DSL.md §17.8 ④): every sentence of a
// component's description becomes something, when the interpretation made up commands or queries Layer 1 did not name.
export const SentenceTrace = service("Decides whether every sentence Layer 1 wrote became something, and whether what the interpretation traces exists.", {
  queries: {
    Sentence(covered: boolean, added: boolean): "none" | "sentence-unused" {
      return value.sentence(
        "A sentence of a component's description: whether a key of the interpretation's trace is part of it, and whether the " +
          "interpretation added commands or queries Layer 1 did not name. It is unused when they were added and it is not covered.",
      );
    },
    Key(inDescription: boolean): "none" | "unknown-sentence" {
      return value.key("A key of the interpretation's trace: it must be part of a sentence of the description, or it is an unknown sentence.");
    },
    Target(exists: boolean): "none" | "unknown-name" {
      return value.target("A name a key of the trace points to: it must exist, or it is an unknown name.");
    },
    Embedded(isComponent: boolean, used: boolean): "none" | "unknown-name" | "embedded-unused" {
      return value.embedded(
        "Something embedded in a description as ${X}: it must be a component (otherwise an unknown name), and some body of the " +
          "component must use it (otherwise it is unused).",
      );
    },
  },
});
