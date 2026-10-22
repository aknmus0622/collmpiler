import { answer, does, external, List, service, value } from "@clp/core";
import type { Id } from "@clp/core";

// Which case of a command happens (packages/cli/src/choose.ts `chooseCaseStage0`, used by `chooseEvent` in v1/eval.ts): the
// cases a command's body splits into are named after their conditions; at most one may hold, and when none does the
// `otherwise` case happens. Walking the specification is not this component's job: it is given the names one at a time and
// asks whether each one's condition holds (evaluating it is the caller's: the oracle evaluates the expression).
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): what it decides is a value of the oracle's run, so in use it
// must agree with Stage 0 (R4).
export type CaseName = Id<"the name of a case">;

export const Oracle = external("The oracle, which evaluates a case's condition in the situation being considered.", {
  queries: { Holds: (name: CaseName): boolean => answer() },
});

export const StepChoice = service("Chooses which case of a command happens.", {
  state: { hits: List<CaseName>() },
  commands: {
    BeginCases() {
      does.begin("A case is chosen next. No case has been given yet.");
    },
    Case(name: CaseName) {
      does.case("A case, named by its condition. It is asked about (whether its condition holds), even when another one already holds.");
    },
  },
  queries: {
    Decision(): { chosen: CaseName | null; otherwise: boolean; conflict: CaseName[] } {
      return value.decision(
        "Which case happens. If exactly one case's condition holds, that case. If none holds, the otherwise case (chosen is null " +
          "and otherwise is true). If more than one holds, none is chosen and the conflict lists those cases in the order given; " +
          "otherwise the conflict is empty.",
      );
    },
  },
});
