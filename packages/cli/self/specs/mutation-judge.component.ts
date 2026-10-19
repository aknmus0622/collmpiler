import { commands, data, effects, input, service, states } from "@clp/core";

// The pass rule of the mutation gate (packages/cli/src/mutation.ts `judge`): after the production code was broken in many
// places and the tests were run against each break (mutant), is a decision really made in production code? This component
// is given the decision-table values one at a time, each followed by whether each of its sites was killed, then every
// mutant, then whether the code is shared. It reports what fails the gate. Breaking code and running the tests are not its job.
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): it is always graded by Stage 0, and in use its verdicts are
// combined with Stage 0's, the stricter way.
export const State = states({
  VALUES: "Values are being judged, one after another.",
  IN_VALUE: "The sites of one value are being given.",
  MUTANTS: "Every mutant is being given.",
  DONE: { description: "The judgement is over.", final: true },
});

export const Data = data({
  sawSite: { type: "boolean", initially: false, description: "Whether the value being judged has a site (a place in production code where it was broken)." },
  siteKilled: { type: "boolean", initially: false, description: "Whether some site of the value being judged was killed (breaking it made the tests fail)." },
  valueInAdapter: { type: "boolean", initially: false, description: "Whether the value being judged is a number that appears in the adapter." },
  located: { type: "boolean", initially: false, description: "Whether some value so far had a site." },
  anyKilled: { type: "boolean", initially: false, description: "Whether some mutant so far was killed." },
});

export const Effect = effects({
  Survived: "The value being judged has sites, and none was killed: it is not decided by production code.",
  InAdapter: "The value being judged has no site in production code, but appears in the adapter: the decision was put in the adapter.",
  Ineffective: "No decision-table value was found in production code, and no mutant at all was killed: the tested behaviour does not come from production code.",
});

export const BeginValueInput = input({ numeric: "boolean", inAdapter: "boolean" });
export const KilledInput = input({ killed: "boolean" });
export const FinishInput = input({ shared: "boolean" });

export const Command = commands({
  BeginValue: {
    input: BeginValueInput,
    from: State.VALUES,
    goTo: State.IN_VALUE,
    does: "A decision-table value is judged next: whether it is a number, and whether it appears in the adapter as a number. None of its sites has been given yet.",
  },
  Site: {
    input: KilledInput,
    from: State.IN_VALUE,
    does: "A site of the value: a place in production code where the value was changed, and whether that made the tests fail (killed).",
  },
  EndValue: {
    from: State.IN_VALUE,
    goTo: State.VALUES,
    does:
      "The value's sites are over. If it had a site, a value is located in production code (for the rest of the judgement), and if " +
      "none of its sites was killed, it survived. If it had no site, and it is a number that appears in the adapter, it is in the adapter.",
  },
  Mutant: {
    input: KilledInput,
    from: [State.VALUES, State.MUTANTS],
    goTo: State.MUTANTS,
    does: "A mutant (every one, the sites of values included) and whether it was killed.",
  },
  Finish: {
    input: FinishInput,
    from: [State.VALUES, State.MUTANTS],
    goTo: State.DONE,
    does:
      "The judgement is over. If no value was located in production code, no mutant was killed, and the production code is not " +
      "shared with other components in a way that could not be narrowed (shared), the mutation is ineffective.",
  },
});

export const MutationJudge = service({
  description: "Decides whether a mutation report passes the mutation gate, value by value and as a whole.",
  init: State.VALUES,
  uses: [State, Data, Effect, Command],
});
