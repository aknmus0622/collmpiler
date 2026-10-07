import { bind, ref } from "@clp/core";
import { Pipeline } from "./pipeline.component.ts";

const remembered = {
  maxAttempts: ref.input("attemptsPerPhase"),
  maxRounds: ref.input("rounds"),
  incremental: ref.decision("plan", "incremental"),
  round: 1,
  attempt: 1,
} as const;
const planned = {
  set: remembered,
  effects: [{ StartSession: { phase: ref.decision("plan", "phase"), round: 1, attempt: 1 } }],
} as const;

const retry = (phase: "design" | "wiring" | "implementation") =>
  ({
    set: { attempt: ref.calculation("nextAttempt") },
    effects: [{ StartSession: { phase, round: ref.data("round"), attempt: ref.calculation("nextAttempt") } }],
  }) as const;
const restart = {
  set: { round: ref.calculation("nextRound"), attempt: 1 },
  effects: [
    { DiscardCode: {}, when: "The code is being written from nothing" },
    { StartSession: { phase: "design", round: ref.calculation("nextRound"), attempt: 1 } },
  ],
} as const;

export const Binding = bind(Pipeline, {
  commands: {
    Start: {
      "There is no production code yet": planned,
      "There is production code, and the boundary differs from the previous run": planned,
      "There is production code, the boundary is unchanged, and there is no adapter": planned,
      otherwise: { set: remembered, effects: [{ GradeCurrentCode: { round: 1 } }] },
    },

    DesignChecked: {
      "The check passed": {
        set: { attempt: 1 },
        effects: [{ StartSession: { phase: "wiring", round: ref.data("round"), attempt: 1 } }],
      },
      "The check was rejected and attempts remain in this phase": retry("design"),
      "The check was rejected, no attempts remain in this phase, and rounds remain": restart,
      otherwise: {},
    },

    WiringChecked: {
      "The check passed and existing code is being changed": {
        set: { attempt: 1 },
        effects: [{ GradeCurrentCode: { round: ref.data("round") } }],
      },
      "The check passed and the code is being written from nothing": {
        set: { attempt: 1 },
        effects: [{ StartSession: { phase: "implementation", round: ref.data("round"), attempt: 1 } }],
      },
      "The check was rejected and attempts remain in this phase": retry("wiring"),
      "The check was rejected, no attempts remain in this phase, and rounds remain": restart,
      otherwise: {},
    },

    CurrentCodeGraded: {
      "The check passed": {},
      otherwise: { effects: [{ StartSession: { phase: "implementation", round: ref.data("round"), attempt: 1 } }] },
    },

    ImplementationChecked: {
      "The check passed": {},
      "The check was rejected and attempts remain in this phase": retry("implementation"),
      "The check was rejected, no attempts remain in this phase, and rounds remain": restart,
      otherwise: {},
    },
  },

  conditions: {
    "There is no production code yet": (state) => !state.hasProductionCode,
    "There is production code, and the boundary differs from the previous run": (state) =>
      state.hasProductionCode && state.boundaryChanged,
    "There is production code, the boundary is unchanged, and there is no adapter": (state) =>
      state.hasProductionCode && !state.boundaryChanged && !state.hasAdapter,

    "The check passed": (state) => state.passed === true,
    "The check passed and existing code is being changed": (state) => state.passed === true && state.incremental === true,
    "The check passed and the code is being written from nothing": (state) => state.passed === true && state.incremental === false,
    "The check was rejected and attempts remain in this phase": (state) =>
      !state.passed && (state.attempt ?? 1) < (state.maxAttempts ?? 1),
    "The check was rejected, no attempts remain in this phase, and rounds remain": (state) =>
      !state.passed && (state.attempt ?? 1) >= (state.maxAttempts ?? 1) && (state.round ?? 1) < (state.maxRounds ?? 1),

    "The code is being written from nothing": (state) => state.incremental === false,
  },

  calculations: {
    nextAttempt: (state) => (state.attempt ?? 0) + 1,
    nextRound: (state) => (state.round ?? 0) + 1,
  },

  invariants: {
    "The attempt number never exceeds the limit of attempts per phase": (state) =>
      state.status === "IDLE" || (state.attempt ?? 0) <= (state.maxAttempts ?? 0),
    "The round number never exceeds the limit of rounds": (state) =>
      state.status === "IDLE" || (state.round ?? 0) <= (state.maxRounds ?? 0),
  },
});
