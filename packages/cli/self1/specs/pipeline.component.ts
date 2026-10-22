import { answer, decisions, does, external, init, is, otherwise, requires, service } from "@clp/core/v1";
import type { Int } from "@clp/core/v1";

// The pipeline that reconciles one component: design → wiring → implementation, each an agent session followed by a check.
// This is the framework's own loop (packages/cli/src/loop.ts) written as a spec. The procedure turned inside out: the
// machine asks for work through `PipelineDriver`, and the driver answers with a command.
export type Phase = "design" | "wiring" | "implementation";
export type Status = "IDLE" | "DESIGN" | "WIRING" | "GRADING" | "IMPLEMENTATION" | "DONE" | "FAILED";

export const Output = external("What the output directory holds.", {
  queries: {
    HasProductionCode: (): boolean => answer(),
    /** Whether the component's boundary differs from the one the previous run worked from. */
    BoundaryChanged: (): boolean => answer(),
    HasAdapter: (): boolean => answer(),
  },
});
export const PipelineDriver = external("The driver: it runs what the pipeline asks for, and answers with a command.", {
  commands: {
    StartSession(phase: Phase, round: Int, attempt: Int) {},
    /** Grade the production code as it is, without an agent. */
    GradeCurrentCode(round: Int) {},
    DiscardCode() {},
  },
});

// Where the pipeline starts, from what the output directory holds
export const Plan = decisions("The plan: where the pipeline starts", () => [
  [is.nothingYet("There is no production code yet"), { phase: "design", next: "DESIGN", incremental: false }],
  [is.boundaryDiffers("There is production code, and the boundary differs from the previous run"), { phase: "design", next: "DESIGN", incremental: true }],
  [is.noAdapter("There is production code, the boundary is unchanged, and there is no adapter"), { phase: "wiring", next: "WIRING", incremental: true }],
  [otherwise, { phase: null, next: "GRADING", incremental: true }],
]);

export const Pipeline = service(
  "Reconciles one component with its specification in up to three phases (design, wiring, implementation). Each phase is an agent " +
    "session followed by a check. A rejected check repeats the phase; a phase that runs out of attempts restarts the pipeline from " +
    "design, until the rounds run out.",
  {
    state: {
      status: init<Status>("IDLE"),
      memory: "The two limits, whether the plan is incremental, the round and the attempt",
    },
    commands: {
      Start(attemptsPerPhase: Int, rounds: Int) {
        requires(this.status === "IDLE" && attemptsPerPhase >= 1 && attemptsPerPhase <= 3 && rounds >= 1 && rounds <= 3);
        this.status = Plan().next;
        does.start(
          "The pipeline remembers the two limits and whether the plan is incremental, and that this is round 1, attempt 1. " +
            "Then a session of the plan's phase is started; where the plan has no phase, the current code is graded instead.",
        );
      },
      DesignChecked(passed: boolean) {
        requires(this.status === "DESIGN");
        if (passed) {
          this.status = "WIRING";
          does.toWiring("The attempt number goes back to 1. A wiring session is started.");
          return;
        }
        does.rejected(
          "The check rejected the phase. If attempts remain in this phase, the attempt number goes up by one and a session of the same " +
            "phase is started. Otherwise, if rounds remain, the round number goes up by one and the attempt number goes back to 1: the " +
            "code is discarded first if it was being written from nothing, the pipeline goes back to design, and a design session is " +
            "started in the new round. Otherwise the pipeline has failed.",
        );
      },
      WiringChecked(passed: boolean) {
        requires(this.status === "WIRING");
        if (passed) {
          does.afterWiring(
            "The attempt number goes back to 1. When existing code is being changed (the code was not written from nothing), the " +
              "current code is graded; otherwise an implementation session is started.",
          );
          return;
        }
        does.rejected("The check rejected the phase (as for DesignChecked).");
      },
      // The grade of the code as it was before any implementation session of this round
      CurrentCodeGraded(passed: boolean) {
        requires(this.status === "GRADING");
        if (passed) {
          this.status = "DONE";
          return;
        }
        this.status = "IMPLEMENTATION";
        does.implement("An implementation session is started (attempt 1).");
      },
      ImplementationChecked(passed: boolean) {
        requires(this.status === "IMPLEMENTATION");
        if (passed) {
          this.status = "DONE";
          return;
        }
        does.rejected("The check rejected the phase (as for DesignChecked).");
      },
    },
    queries: {
      Status(): Status {
        return this.status;
      },
    },
    rules: {
      attemptsWithinLimit: "The attempt number never exceeds the limit of attempts per phase",
      roundsWithinLimit: "The round number never exceeds the limit of rounds",
    },
  },
);
