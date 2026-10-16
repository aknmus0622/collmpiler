import { commands, conditions, effects, input, integer, invariants, otherwise, queries, service, states } from "@clp/core";
import { Decision, PlanIf } from "./pipeline.decisions.ts";

const Limit = integer({ min: 1, max: 3 });
const Count = integer({ min: 1, max: 4 });
const Phase = ["design", "wiring", "implementation"] as const;
export const If = conditions({
  checkWasRejectedAttemptsRemain: "The check was rejected and attempts remain in this phase",
  checkWasRejectedNoAttempts: "The check was rejected, no attempts remain in this phase, and rounds remain",
  checkPassed: "The check passed",
  checkPassedExistingCodeBeing: "The check passed and existing code is being changed",
  checkPassedCodeBeingWritten: "The check passed and the code is being written from nothing",
});

export const State = states(["IDLE", "DESIGN", "WIRING", "GRADING", "IMPLEMENTATION", "DONE", "FAILED"]);

export const Query = queries({
  hasProductionCode: "boolean",
  boundaryChanged: { description: "Whether the component's boundary differs from the one the previous run worked from.", output: "boolean" },
  hasAdapter: "boolean",
});

export const Effect = effects({
  StartSession: input({ phase: Phase, round: Count, attempt: Count }),
  GradeCurrentCode: { description: "Grade the production code as it is, without an agent.", input: input({ round: Count }) },
  DiscardCode: input({}),
});

export const Inv = invariants({
  attemptNumberNeverExceedsLimit: "The attempt number never exceeds the limit of attempts per phase",
  roundNumberNeverExceedsLimit: "The round number never exceeds the limit of rounds",
});

export const StartInput = input({ attemptsPerPhase: Limit, rounds: Limit });


// What happens when a phase's check is rejected. The same for every phase, so it is written once and shared.
const rejected = [
  // No goTo: the pipeline stays in the phase
  If.checkWasRejectedAttemptsRemain.then({
    does: "The attempt number goes up by one. A session of the same phase is started with the new attempt number.",
  }),
  If.checkWasRejectedNoAttempts.then({
    goTo: State.DESIGN,
    does:
      "The round number goes up by one and the attempt number goes back to 1. " +
      "The code is discarded if it was being written from nothing. Then a design session is started in the new round.",
  }),
  otherwise({ goTo: State.FAILED }),
];
const Checked = input({ passed: "boolean" });

export const Command = commands({
  Start: {
    description:
      "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
      "Then a session of the plan's phase is started; where the plan has no phase, the current code is graded instead.",
    input: StartInput,
    from: State.IDLE,
    cases: [
      PlanIf.thereNoProductionCodeYet.then({ goTo: State.DESIGN }),
      PlanIf.thereProductionCodeBoundaryDiffers.then({ goTo: State.DESIGN }),
      PlanIf.thereProductionCodeBoundaryUnchanged.then({ goTo: State.WIRING }),
      otherwise({ goTo: State.GRADING }),
    ],
  },

  DesignChecked: {
    input: Checked,
    from: State.DESIGN,
    cases: [If.checkPassed.then({ goTo: State.WIRING, does: "The attempt number goes back to 1. A wiring session is started." }), ...rejected],
  },

  WiringChecked: {
    input: Checked,
    from: State.WIRING,
    cases: [
      If.checkPassedExistingCodeBeing.then({ goTo: State.GRADING, does: "The attempt number goes back to 1. The current code is graded." }),
      If.checkPassedCodeBeingWritten.then({ goTo: State.IMPLEMENTATION, does: "The attempt number goes back to 1. An implementation session is started." }),
      ...rejected,
    ],
  },

  // The grade of the code as it was before any implementation session of this round
  CurrentCodeGraded: {
    input: Checked,
    from: State.GRADING,
    cases: [
      If.checkPassed.then({ goTo: State.DONE, does: "Nothing: there is nothing to implement." }),
      otherwise({ goTo: State.IMPLEMENTATION, does: "An implementation session is started (attempt 1)." }),
    ],
  },

  ImplementationChecked: { input: Checked, from: State.IMPLEMENTATION, cases: [If.checkPassed.then({ goTo: State.DONE }), ...rejected] },
});

// The pipeline that reconciles one component: design → wiring → implementation, each an agent session
// followed by a check. This is the framework's own loop (packages/cli/src/loop.ts) written as a spec.
export const Pipeline = service({
  description:
    "Reconciles one component with its specification in up to three phases (design, wiring, implementation). " +
    "Each phase is an agent session followed by a check. A rejected check repeats the phase; a phase that runs out of " +
    "attempts restarts the pipeline from design, until the rounds run out.",
  init: State.IDLE,
  // What the output directory holds (queries), the sessions and grades it asks for (effects), the plan, and
  // properties that must hold after every command
  uses: [State, Query, Effect, Decision, PlanIf, If, Inv, Command],
});
