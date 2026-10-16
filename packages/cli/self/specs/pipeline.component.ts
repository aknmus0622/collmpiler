import { all, commands, conditions, effects, input, integer, invariants, not, otherwise, queries, service } from "@clp/core";
import { Decision, PlanIf, State } from "./pipeline.decisions.ts";

export { State };

const Limit = integer({ min: 1, max: 3 });
const Count = integer({ min: 1, max: 4 });
const Phase = ["design", "wiring", "implementation"] as const;

// What a check's result means; the combinations below are named once and used as cases
export const If = conditions({
  checkPassed: "The check passed",
  existingCode: "Existing code is being changed (the code was not written from nothing)",
  attemptsRemain: "Attempts remain in this phase",
  roundsRemain: "Rounds remain",
});
export const When = conditions({
  passedExistingCode: all(If.checkPassed, If.existingCode),
  passedNewCode: all(If.checkPassed, not(If.existingCode)),
  retry: all(not(If.checkPassed), If.attemptsRemain),
  restart: all(not(If.checkPassed), not(If.attemptsRemain), If.roundsRemain),
});

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
const Checked = input({ passed: "boolean" });

// What happens when a phase's check is rejected. The same for every phase, so it is written once and shared.
const rejected = [
  // No goTo: the pipeline stays in the phase
  When.retry.then({ does: "The attempt number goes up by one. A session of the same phase is started with the new attempt number." }),
  When.restart.then({
    goTo: State.DESIGN,
    does:
      "The round number goes up by one and the attempt number goes back to 1. " +
      "The code is discarded if it was being written from nothing. Then a design session is started in the new round.",
  }),
  otherwise({ goTo: State.FAILED }),
];

export const Command = commands({
  Start: {
    description:
      "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
      "Then a session of the plan's phase is started; where the plan has no phase, the current code is graded instead.",
    input: StartInput,
    from: State.IDLE,
    goTo: Decision.plan.next,
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
      When.passedExistingCode.then({ goTo: State.GRADING, does: "The attempt number goes back to 1. The current code is graded." }),
      When.passedNewCode.then({ goTo: State.IMPLEMENTATION, does: "The attempt number goes back to 1. An implementation session is started." }),
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
  uses: [State, Query, Effect, Decision, PlanIf, If, When, Inv, Command],
});
