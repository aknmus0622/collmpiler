import { component } from "@clp/core";
import { Plan } from "./pipeline.decisions.ts";

const Limit = { type: "integer", min: 1, max: 3 } as const;
const Count = { type: "integer", min: 1, max: 4 } as const;
const Phase = ["design", "wiring", "implementation"] as const;

// The pipeline that reconciles one component: design → wiring → implementation, each an agent session
// followed by a check. This is the framework's own loop (packages/cli/src/loop.ts) written as a spec.
// A rejected check repeats the phase; a phase that runs out of attempts restarts the pipeline from design.
export const Pipeline = component({
  states: ["IDLE", "DESIGN", "WIRING", "GRADING", "IMPLEMENTATION", "DONE", "FAILED"],
  init: "IDLE",

  data: {
    // Whether production code existed when the run started
    incremental: "boolean",
    attempt: Count,
    round: Count,
    maxAttempts: Limit,
    maxRounds: Limit,
  },

  // What the output directory holds
  queries: {
    hasProductionCode: "boolean",
    boundaryChanged: "boolean",
    hasAdapter: "boolean",
  },

  effects: {
    StartSession: { phase: Phase, round: Count, attempt: Count },
    // Grade the production code as it is, without an agent
    GradeCurrentCode: { round: Count },
    DiscardCode: {},
  },

  decisions: { plan: Plan },

  calculations: {
    nextAttempt: { is: "the current attempt number plus one", type: "integer" },
    nextRound: { is: "the current round number plus one", type: "integer" },
  },

  invariants: [
    "The attempt number never exceeds the limit of attempts per phase",
    "The round number never exceeds the limit of rounds",
  ],

  commands: {
    Start: {
      input: { attemptsPerPhase: Limit, rounds: Limit },
      from: ["IDLE"],
      when: {
        "There is no production code yet": {
          goTo: "DESIGN",
          does:
            "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
            "A session of the plan's phase is started.",
        },
        "There is production code, and the boundary differs from the previous run": {
          goTo: "DESIGN",
          does:
            "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
            "A session of the plan's phase is started.",
        },
        "There is production code, the boundary is unchanged, and there is no adapter": {
          goTo: "WIRING",
          does:
            "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
            "A session of the plan's phase is started.",
        },
        otherwise: {
          goTo: "GRADING",
          does:
            "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
            "The current code is graded.",
        },
      },
    },

    DesignChecked: {
      input: { passed: "boolean" },
      from: ["DESIGN"],
      when: {
        "The check passed": {
          goTo: "WIRING",
          does: "The attempt number goes back to 1. A wiring session is started.",
        },
        "The check was rejected and attempts remain in this phase": {
          goTo: "DESIGN",
          does: "The attempt number goes up by one. A design session is started with the new attempt number.",
        },
        "The check was rejected, no attempts remain in this phase, and rounds remain": {
          goTo: "DESIGN",
          does:
            "The round number goes up by one and the attempt number goes back to 1. " +
            "The code is discarded if it was being written from nothing. Then a design session is started in the new round.",
        },
        otherwise: { goTo: "FAILED", does: "Nothing." },
      },
    },

    WiringChecked: {
      input: { passed: "boolean" },
      from: ["WIRING"],
      when: {
        "The check passed and existing code is being changed": {
          goTo: "GRADING",
          does: "The attempt number goes back to 1. The current code is graded.",
        },
        "The check passed and the code is being written from nothing": {
          goTo: "IMPLEMENTATION",
          does: "The attempt number goes back to 1. An implementation session is started.",
        },
        "The check was rejected and attempts remain in this phase": {
          goTo: "WIRING",
          does: "The attempt number goes up by one. A wiring session is started with the new attempt number.",
        },
        "The check was rejected, no attempts remain in this phase, and rounds remain": {
          goTo: "DESIGN",
          does:
            "The round number goes up by one and the attempt number goes back to 1. " +
            "The code is discarded if it was being written from nothing. Then a design session is started in the new round.",
        },
        otherwise: { goTo: "FAILED", does: "Nothing." },
      },
    },

    // The grade of the code as it was before any implementation session of this round
    CurrentCodeGraded: {
      input: { passed: "boolean" },
      from: ["GRADING"],
      when: {
        "The check passed": { goTo: "DONE", does: "Nothing: there is nothing to implement." },
        otherwise: { goTo: "IMPLEMENTATION", does: "An implementation session is started (attempt 1)." },
      },
    },

    ImplementationChecked: {
      input: { passed: "boolean" },
      from: ["IMPLEMENTATION"],
      when: {
        "The check passed": { goTo: "DONE", does: "Nothing." },
        "The check was rejected and attempts remain in this phase": {
          goTo: "IMPLEMENTATION",
          does: "The attempt number goes up by one. An implementation session is started with the new attempt number.",
        },
        "The check was rejected, no attempts remain in this phase, and rounds remain": {
          goTo: "DESIGN",
          does:
            "The round number goes up by one and the attempt number goes back to 1. " +
            "The code is discarded if it was being written from nothing. Then a design session is started in the new round.",
        },
        otherwise: { goTo: "FAILED", does: "Nothing." },
      },
    },
  },
});
