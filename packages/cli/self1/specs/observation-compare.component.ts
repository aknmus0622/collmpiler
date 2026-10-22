import { answer, decisions, does, external, failed, init, is, otherwise, requires, service, value } from "@clp/core/v1";
import type { Id, Int, Json } from "@clp/core/v1";

// A leaf of an observation: one string per value inside it, `path|kind|text`. Opaque here: only compared for equality.
export type Leaf = Id<"a leaf of an observation">;

export const ObservationCompare = service("Decides whether the observation of the system after a command equals the one the specification expects.", {
  state: {
    // The leaves of the expected observation given so far.
    expected: init<Leaf[]>([]),
    // The leaves of the actual observation given so far.
    actual: init<Leaf[]>([]),
    // Whether the command answers (the specification declares an output) but the system answered nothing.
    answerAbsent: init<boolean>(false),
  },
  commands: {
    Begin(answers: boolean, answered: boolean) {
      does.begin("Two observations are compared next; no leaf has been given yet. Whether the command answers (declares an output), and whether the system answered something, are remembered: a command that answers but answered nothing counts as answering null.");
    },
    Expected(leaf: Leaf) {
      does.expectedLeaf("A leaf of the expected observation.");
    },
    Actual(leaf: Leaf) {
      does.actualLeaf("A leaf of the actual observation.");
    },
  },
  queries: {
    Decide(): boolean {
      return value.decide("The answer is whether the two observations are equal: whether they have the same leaves (in any order of giving; a leaf given twice counts once), where, if the command answers and the system answered nothing, the actual observation also has the leaf `\"output\"|null|null`. Nothing is forgotten until the next Begin.");
    },
  },
});
