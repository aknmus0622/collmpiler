import { commands, decisions, effects, input, integer, otherwise, service, states } from "@clp/core";

// The verdict of spec mutation (packages/cli/src/runtime.ts `observability`): before any agent runs, each value of a
// decision table is changed and the specification is run, to see whether any expected outcome changes. A value that
// never shows cannot be verified in an implementation. This component decides, for one value after another, which
// runs to ask for and what to report. Running the specification is not its job: it asks for a run with an effect,
// and the driver answers with what the run showed.
export const State = states({
  IDLE: "No value is being judged.",
  TRYING: "The changed value is being run under one seed after another.",
});

// How many seeds are tried after the verification seed before a value is judged as never showing.
// A single seed misses thresholds that are hard to reach, so a value that shows under no seed at all is an error,
// one that shows only under another seed is a warning.
export const Decision = decisions({ seeds: [otherwise({ extraSeeds: 2 })] });

const Seed = integer({ min: 0, max: 2 });

export const Effect = effects({
  RunTrials: {
    description: "Run the specification with the value changed, under the verification seed (extra 0) or under the verification seed plus extra.",
    input: input({ extra: Seed }),
  },
  Report: {
    description: "The value is reported, with the verdict and how serious it is.",
    input: input({ verdict: ["precondition", "unobserved", "rare"], severity: ["error", "warning"] }),
  },
});

export const BeginInput = input({ kind: ["number", "string", "boolean", "null"] });
export const TriedInput = input({ changed: "boolean", enablementDiffers: "boolean" });

export const Command = commands({
  Begin: {
    input: BeginInput,
    from: State.IDLE,
    does:
      "A value of a decision table is judged next. A null value (a cell a row does not use) is skipped: nothing happens. " +
      "Any other value is run under the verification seed first.",
  },
  Tried: {
    input: TriedInput,
    from: State.TRYING,
    does:
      "A run has finished: whether some expected outcome changed, and whether, in some step, the changed specification would have " +
      "executed a different command (whether a command can be executed changed). " +
      "If an outcome changed under the verification seed, the value shows and nothing is reported. " +
      "If an outcome changed under an extra seed, the value is reported as rare. " +
      "If nothing changed and extra seeds remain (the extra of the run that finished is below extraSeeds), the run with the next extra " +
      "is asked for; the seeds tried are the verification seed, then extra 1 up to extraSeeds. " +
      "If nothing changed under any seed, the value is reported as precondition if in any of the runs of this value, the one that " +
      "has just finished included, whether a command can be executed changed, and as unobserved otherwise. " +
      "A rare value is a warning, and so is any verdict on a boolean value (the mutation gate does not fail on booleans); " +
      "every other verdict is an error. After a value is reported, or shows, the next value can be judged.",
  },
});

export const MutationVerdict = service({
  description:
    "Judges, value by value, whether a changed decision-table value shows in what the specification expects. " +
    "It asks for runs and reports the values that do not show.",
  init: State.IDLE,
  uses: [State, Decision, Effect, Command],
});
