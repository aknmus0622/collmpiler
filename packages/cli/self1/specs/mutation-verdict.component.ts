import { answer, decisions, does, external, failed, init, is, otherwise, requires, service, value } from "@clp/core/v1";
import type { Int, Json } from "@clp/core/v1";

export const Runs = external("What the verdict asks for (a run of the changed specification) and reports.", {
  commands: {
    /** Run the specification with the value changed, under the verification seed (extra 0) or under the verification seed plus extra. */
    RunTrials(extra: Int) {},
    /** The value is reported, with the verdict and how serious it is. */
    Report(verdict: "precondition" | "unobserved" | "rare", severity: "error" | "warning") {},
  },
});

export const Seeds = decisions("seeds", () => [
  [otherwise, { extraSeeds: 2 }],
]);

export const MutationVerdict = service("Judges, value by value, whether a changed decision-table value shows in what the specification expects. It asks for runs and reports the values that do not show.", {
  state: {
    status: init<"IDLE" | "TRYING">("IDLE"),
  },
  commands: {
    Begin(kind: "number" | "string" | "boolean" | "null") {
      requires(this.status === "IDLE");
      does.begin("A value of a decision table is judged next. A null value (a cell a row does not use) is skipped: nothing happens. Any other value is run under the verification seed first.");
    },
    Tried(changed: boolean, enablementDiffers: boolean) {
      requires(this.status === "TRYING");
      does.tried("A run has finished: whether some expected outcome changed, and whether, in some step, the changed specification would have executed a different command (whether a command can be executed changed). If an outcome changed under the verification seed, the value shows and nothing is reported. If an outcome changed under an extra seed, the value is reported as rare. If nothing changed and extra seeds remain (the extra of the run that finished is below extraSeeds), the run with the next extra is asked for; the seeds tried are the verification seed, then extra 1 up to extraSeeds. If nothing changed under any seed, the value is reported as precondition if in any of the runs of this value, the one that has just finished included, whether a command can be executed changed, and as unobserved otherwise. A rare value is a warning, and so is any verdict on a boolean value (the mutation gate does not fail on booleans); every other verdict is an error. After a value is reported, or shows, the next value can be judged.");
    },
  },
});
