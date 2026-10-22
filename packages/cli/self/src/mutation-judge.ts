/**
 * Mutation judge: decides whether a mutation report passes the mutation gate,
 * value by value and as a whole.
 *
 * Corresponds to the specification component `mutation-judge`. Nothing it keeps
 * is durable, and it serves no HTTP routes. Its state is
 * {@link MutationJudgeState}; it relies on one dependency, the verdict
 * ({@link MutationVerdictSink}, specification component `verdict`), which is told
 * what the judgement reports.
 *
 * Each specification command is a pure step function (`*Step`) that takes the
 * state before the command and answers the state after it together with the
 * verdict calls to make, in order ({@link JudgeStep}). {@link MutationJudge} keeps
 * the state, runs those step functions and makes the calls on its verdict.
 *
 * A report is fed in this order: for each decision-table value, `beginValue`,
 * then one `site` per place in production code where that value was changed,
 * then `endValue`; after the values, one `mutant` per mutant; finally `finish`.
 * Commands are only sent in the phase stated for each method; other inputs are
 * never sent and need no handling.
 */

/**
 * Where the judgement is (specification state field `phase`). The names are the
 * specification's.
 *
 * - `"VALUES"`: between values; the next value, the first mutant or the end may come.
 * - `"IN_VALUE"`: a value is being judged; its sites, or its end, may come.
 * - `"MUTANTS"`: the values are over and mutants are being given; more mutants, or the end, may come.
 * - `"DONE"`: the judgement is over.
 */
export type JudgePhase = "VALUES" | "IN_VALUE" | "MUTANTS" | "DONE";

/**
 * Everything the judge remembers (the specification's `state`). Each field has
 * the name of the specification state field it holds.
 */
export interface MutationJudgeState {
  /** Whether some mutant so far was killed (state `anyKilled`). */
  readonly anyKilled: boolean;
  /** Whether some value so far had a site (state `located`). */
  readonly located: boolean;
  /** Where the judgement is (state `phase`). */
  readonly phase: JudgePhase;
  /** Whether the value being judged has a site so far (state `sawSite`). */
  readonly sawSite: boolean;
  /** Whether some site of the value being judged was killed so far (state `siteKilled`). */
  readonly siteKilled: boolean;
  /** Whether the value being judged is a number that appears in the adapter (state `valueInAdapter`). */
  readonly valueInAdapter: boolean;
}

/** The state the judge starts from (the specification's `init`). */
export function initialMutationJudgeState(): MutationJudgeState {
  return {
    anyKilled: false,
    located: false,
    phase: "VALUES",
    sawSite: false,
    siteKilled: false,
    valueInAdapter: false,
  };
}

/**
 * The verdict (specification component `verdict`, external): it is told what the
 * judgement reports. Each method is one of its specification commands; the judge
 * calls them, in order, during one of its own commands. None of them answers
 * anything.
 */
export interface MutationVerdictSink {
  /** The value just ended is a number that appears in the adapter (specification `InAdapter`). */
  inAdapter(): void;
  /** The mutation as a whole is ineffective (specification `Ineffective`). */
  ineffective(): void;
  /** The value just ended survived: none of its sites was killed (specification `Survived`). */
  survived(): void;
}

/**
 * One call the judge makes on its verdict: `call` names the
 * {@link MutationVerdictSink} method (none takes arguments).
 */
export type VerdictCall =
  | { readonly call: "inAdapter" }
  | { readonly call: "ineffective" }
  | { readonly call: "survived" };

/** Makes one call on the verdict. */
export function callVerdict(verdict: MutationVerdictSink, call: VerdictCall): void {
  switch (call.call) {
    case "inAdapter":
      verdict.inAdapter();
      return;
    case "ineffective":
      verdict.ineffective();
      return;
    case "survived":
      verdict.survived();
      return;
  }
}

/** The result of a step function: the state after the command and the verdict calls to make, in order. */
export interface JudgeStep {
  readonly state: MutationJudgeState;
  readonly calls: readonly VerdictCall[];
}

/** The facts about a decision-table value about to be judged (parameters of specification `BeginValue`). */
export interface JudgedValue {
  /** Whether the value is a number (specification parameter `numeric`). */
  readonly numeric: boolean;
  /** Whether the value appears in the adapter as a number (specification parameter `inAdapter`). */
  readonly inAdapter: boolean;
}

// ---------------------------------------------------------------------------
// Step functions: one per specification command, pure

/** Specification command `BeginValue`: a value is judged next. Sent only in phase `"VALUES"`. */
export function beginValueStep(state: MutationJudgeState, value: JudgedValue): JudgeStep {
  return {
    state: {
      ...state,
      phase: "IN_VALUE",
      sawSite: false,
      siteKilled: false,
      valueInAdapter: value.numeric && value.inAdapter,
    },
    calls: [],
  };
}

/**
 * Specification command `Site`: a site of the value being judged. Sent only in phase `"IN_VALUE"`.
 *
 * @param killed whether changing the value there made the tests fail (specification parameter `killed`).
 */
export function siteStep(state: MutationJudgeState, killed: boolean): JudgeStep {
  return {
    state: { ...state, sawSite: true, siteKilled: state.siteKilled || killed },
    calls: [],
  };
}

/** Specification command `EndValue`: the value's sites are over. Sent only in phase `"IN_VALUE"`. */
export function endValueStep(state: MutationJudgeState): JudgeStep {
  const calls: VerdictCall[] = [];
  if (state.sawSite && !state.siteKilled) calls.push({ call: "survived" });
  if (!state.sawSite && state.valueInAdapter) calls.push({ call: "inAdapter" });
  return {
    state: { ...state, located: state.located || state.sawSite, phase: "VALUES" },
    calls,
  };
}

/**
 * Specification command `Mutant`: one mutant of the report. Sent only in phase `"VALUES"` or `"MUTANTS"`.
 *
 * @param killed whether the mutant was killed (specification parameter `killed`).
 */
export function mutantStep(state: MutationJudgeState, killed: boolean): JudgeStep {
  return {
    state: { ...state, anyKilled: state.anyKilled || killed, phase: "MUTANTS" },
    calls: [],
  };
}

/**
 * Specification command `Finish`: the judgement is over. Sent only in phase `"VALUES"` or `"MUTANTS"`.
 *
 * @param shared whether the production code is shared with other components in a way
 *               that could not be narrowed (specification parameter `shared`).
 */
export function finishStep(state: MutationJudgeState, shared: boolean): JudgeStep {
  const calls: VerdictCall[] = [];
  if (!state.located && !state.anyKilled && !shared) calls.push({ call: "ineffective" });
  return { state: { ...state, phase: "DONE" }, calls };
}

// ---------------------------------------------------------------------------
// The component

/**
 * The judgement of one mutation report. It starts in the initial state, keeps its
 * state between commands, and makes its verdict calls synchronously, in order,
 * before the command method returns. No command answers anything; read
 * {@link MutationJudge.state} to see where the judgement is.
 */
export class MutationJudge {
  private readonly verdict: MutationVerdictSink;
  private current: MutationJudgeState = initialMutationJudgeState();

  /** @param verdict the verdict the judge tells what it reports (specification `verdict`). */
  constructor(verdict: MutationVerdictSink) {
    this.verdict = verdict;
  }

  /** The current state (all specification state fields, with the same names). */
  get state(): MutationJudgeState {
    return this.current;
  }

  /** Moves to the step's state, then makes its verdict calls in order. */
  private run(step: JudgeStep): void {
    this.current = step.state;
    for (const call of step.calls) callVerdict(this.verdict, call);
  }

  /**
   * A decision-table value is judged next (specification `BeginValue`). Sent only in phase `"VALUES"`.
   *
   * @param value whether the value is a number and whether it appears in the adapter as one.
   */
  beginValue(value: JudgedValue): void {
    this.run(beginValueStep(this.current, value));
  }

  /**
   * A site of the value being judged (specification `Site`). Sent only in phase `"IN_VALUE"`.
   *
   * @param killed whether changing the value there made the tests fail (specification parameter `killed`).
   */
  site(killed: boolean): void {
    this.run(siteStep(this.current, killed));
  }

  /**
   * The value's sites are over (specification `EndValue`). Sent only in phase `"IN_VALUE"`.
   * The verdict may be told `survived` or `inAdapter` for this value.
   */
  endValue(): void {
    this.run(endValueStep(this.current));
  }

  /**
   * One mutant of the report, the sites of values included (specification
   * `Mutant`). Sent only in phase `"VALUES"` or `"MUTANTS"`.
   *
   * @param killed whether the mutant was killed (specification parameter `killed`).
   */
  mutant(killed: boolean): void {
    this.run(mutantStep(this.current, killed));
  }

  /**
   * The judgement is over (specification `Finish`). Sent only in phase `"VALUES"` or `"MUTANTS"`.
   * The verdict may be told `ineffective`.
   *
   * @param shared whether the production code is shared with other components in a way
   *               that could not be narrowed (specification parameter `shared`).
   */
  finish(shared: boolean): void {
    this.run(finishStep(this.current, shared));
  }
}
