import { component, compose, description, does, from, goTo, input, otherwise, output, when } from "@clp/core";
import { Plan } from "./pipeline.decisions.ts";

const Limit = { type: "integer", min: 1, max: 3 } as const;
const Count = { type: "integer", min: 1, max: 4 } as const;
const Phase = ["design", "wiring", "implementation"] as const;

// What happens when a phase's check is rejected. The same for every phase, so it is written once and shared.
const rejected = compose(
  // No goTo: the pipeline stays in the phase
  when(
    "The check was rejected and attempts remain in this phase",
    does("The attempt number goes up by one. A session of the same phase is started with the new attempt number."),
  ),
  when(
    "The check was rejected, no attempts remain in this phase, and rounds remain",
    goTo("DESIGN"),
    does(
      "The round number goes up by one and the attempt number goes back to 1. " +
        "The code is discarded if it was being written from nothing. Then a design session is started in the new round.",
    ),
  ),
  otherwise(goTo("FAILED")),
);
const checked = input({ passed: "boolean" });

// The pipeline that reconciles one component: design → wiring → implementation, each an agent session
// followed by a check. This is the framework's own loop (packages/cli/src/loop.ts) written as a spec.
export const Pipeline = component({
  description:
    "Reconciles one component with its specification in up to three phases (design, wiring, implementation). " +
    "Each phase is an agent session followed by a check. A rejected check repeats the phase; a phase that runs out of " +
    "attempts restarts the pipeline from design, until the rounds run out.",

  states: ["IDLE", "DESIGN", "WIRING", "GRADING", "IMPLEMENTATION", "DONE", "FAILED"],
  init: "IDLE",

  // What the output directory holds
  queries: {
    hasProductionCode: output("boolean"),
    boundaryChanged: compose(description("Whether the component's boundary differs from the one the previous run worked from."), output("boolean")),
    hasAdapter: output("boolean"),
  },

  effects: {
    StartSession: input({ phase: Phase, round: Count, attempt: Count }),
    GradeCurrentCode: compose(description("Grade the production code as it is, without an agent."), input({ round: Count })),
    DiscardCode: input({}),
  },

  decisions: { plan: Plan },

  invariants: [
    "The attempt number never exceeds the limit of attempts per phase",
    "The round number never exceeds the limit of rounds",
  ],

  commands: {
    Start: compose(
      description(
        "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
          "Then a session of the plan's phase is started; where the plan has no phase, the current code is graded instead.",
      ),
      input({ attemptsPerPhase: Limit, rounds: Limit }),
      from("IDLE"),
      when("There is no production code yet", goTo("DESIGN")),
      when("There is production code, and the boundary differs from the previous run", goTo("DESIGN")),
      when("There is production code, the boundary is unchanged, and there is no adapter", goTo("WIRING")),
      otherwise(goTo("GRADING")),
    ),

    DesignChecked: compose(
      checked,
      from("DESIGN"),
      when("The check passed", goTo("WIRING"), does("The attempt number goes back to 1. A wiring session is started.")),
      rejected,
    ),

    WiringChecked: compose(
      checked,
      from("WIRING"),
      when(
        "The check passed and existing code is being changed",
        goTo("GRADING"),
        does("The attempt number goes back to 1. The current code is graded."),
      ),
      when(
        "The check passed and the code is being written from nothing",
        goTo("IMPLEMENTATION"),
        does("The attempt number goes back to 1. An implementation session is started."),
      ),
      rejected,
    ),

    // The grade of the code as it was before any implementation session of this round
    CurrentCodeGraded: compose(
      checked,
      from("GRADING"),
      when("The check passed", goTo("DONE"), does("Nothing: there is nothing to implement.")),
      otherwise(goTo("IMPLEMENTATION"), does("An implementation session is started (attempt 1).")),
    ),

    ImplementationChecked: compose(checked, from("IMPLEMENTATION"), when("The check passed", goTo("DONE")), rejected),
  },
});
