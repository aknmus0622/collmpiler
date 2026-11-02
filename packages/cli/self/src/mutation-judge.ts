/**
 * Judges a mutation report, value by value and as a whole. The caller walks the
 * report and feeds it in as a sequence of calls; the judge remembers what it needs
 * and tells a `JudgementReporter` what it finds.
 *
 * The whole conversation is: call a command of `MutationJudge`, see which
 * `JudgementReporter` methods it called, and call the next command.
 *
 * It corresponds to the specification's component `mutation-judge`; the reporter
 * corresponds to its external component `verdict`. It keeps nothing across a
 * restart: a new instance starts over.
 */

/**
 * Where the judgement stands. Specification name: state field `phase`; the values
 * are the specification's own.
 *
 * - `"VALUES"`: no value is open; the decision-table values are being gone through.
 * - `"IN_VALUE"`: a value is open; its sites are being given.
 * - `"MUTANTS"`: the mutants are being given.
 * - `"DONE"`: the judgement is over.
 */
export type MutationJudgePhase = "VALUES" | "IN_VALUE" | "MUTANTS" | "DONE";

/**
 * Everything the judge remembers, one field per state field of the specification,
 * under the same names.
 */
export interface MutationJudgeState {
  /** Whether some mutant so far was killed (`anyKilled`). */
  anyKilled: boolean;
  /** Whether some value so far had a site (`located`). */
  located: boolean;
  /** Where the judgement stands (`phase`). */
  phase: MutationJudgePhase;
  /** Whether the value being judged has a site (`sawSite`). */
  sawSite: boolean;
  /** Whether some site of the value being judged was killed (`siteKilled`). */
  siteKilled: boolean;
  /** What the judge noted at `beginValue` about the value and the adapter (`valueInAdapter`). */
  valueInAdapter: boolean;
}

/**
 * What is known about a decision-table value before its sites are given. The field
 * names are the parameter names of the specification's command `BeginValue`.
 */
export interface ValueFacts {
  /** Whether the value appears in the adapter (specification parameter `inAdapter`). */
  inAdapter: boolean;
  /** Whether the value is a number (specification parameter `numeric`). */
  numeric: boolean;
}

/**
 * What the judgement reports; it corresponds to the specification's external
 * component `verdict`, with one method per command under the same name in lower
 * camel case.
 *
 * Each method is called from inside a command of `MutationJudge`, with no
 * arguments, and returns nothing. Whether it is called is the judge's decision. A
 * stand-in should record the calls, in order.
 */
export interface JudgementReporter {
  /**
   * Tells that the value just ended is in the adapter (specification command
   * `InAdapter`). Called from `MutationJudge.endValue`.
   */
  inAdapter(): void;
  /**
   * Tells that the mutation as a whole is ineffective (specification command
   * `Ineffective`). Called from `MutationJudge.finish`.
   */
  ineffective(): void;
  /**
   * Tells that the value just ended survived (specification command `Survived`).
   * Called from `MutationJudge.endValue`.
   */
  survived(): void;
}

/** The judge's state before anything has been given. */
function initialState(): MutationJudgeState {
  return {
    anyKilled: false,
    located: false,
    phase: "VALUES",
    sawSite: false,
    siteKilled: false,
    valueInAdapter: false,
  };
}

/** Whether the value is a number that appears in the adapter. */
function isNumberInAdapter(value: ValueFacts): boolean {
  return value.numeric && value.inAdapter;
}

/** Whether the value had a site, and none of its sites was killed. */
function valueSurvived(state: MutationJudgeState): boolean {
  return state.sawSite && !state.siteKilled;
}

/** Whether the value had no site, and is a number that appears in the adapter. */
function valueOnlyInAdapter(state: MutationJudgeState): boolean {
  return !state.sawSite && state.valueInAdapter;
}

/**
 * Whether the mutation as a whole had no effect: no value was located, no mutant was
 * killed, and shared production code does not explain it.
 */
function mutationIneffective(state: MutationJudgeState, shared: boolean): boolean {
  return !state.located && !state.anyKilled && !shared;
}

/**
 * One judgement of one mutation report. Create one with
 * `new MutationJudge(reporter)`; it starts in the specification's initial state.
 *
 * Each method other than `state` performs one command of the specification and
 * returns nothing: what the command leads to is seen in the calls on the reporter
 * and in `state()`. A command's `requires` limits when it may be called; other
 * calls are never made. The usual sequence is: for each value `beginValue`, then
 * `site` once per site, then `endValue`; after the values `mutant` once per mutant;
 * and last `finish`.
 */
export class MutationJudge {
  private readonly reporter: JudgementReporter;
  private current: MutationJudgeState = initialState();

  /**
   * @param reporter told what the judgement finds, for as long as the judge lives.
   */
  constructor(reporter: JudgementReporter) {
    this.reporter = reporter;
  }

  /**
   * Reads what the judge remembers. It only reads, and may be called at any point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): MutationJudgeState {
    return { ...this.current };
  }

  /**
   * Performs the specification's command `BeginValue`: a decision-table value is
   * judged next, and none of its sites has been given yet.
   *
   * @param value what is known about the value.
   */
  beginValue(value: ValueFacts): void {
    this.current = {
      ...this.current,
      phase: "IN_VALUE",
      sawSite: false,
      siteKilled: false,
      valueInAdapter: isNumberInAdapter(value),
    };
  }

  /**
   * Performs the specification's command `Site`: gives one site of the open value,
   * a place in production code where the value was changed.
   *
   * @param killed whether that change made the tests fail (specification parameter
   *   `killed`).
   */
  site(killed: boolean): void {
    this.current = {
      ...this.current,
      sawSite: true,
      siteKilled: this.current.siteKilled || killed,
    };
  }

  /**
   * Performs the specification's command `EndValue`: the open value's sites are
   * over. This is where the reporter may be told about that value.
   */
  endValue(): void {
    const ended = this.current;
    this.current = {
      ...ended,
      located: ended.located || ended.sawSite,
      phase: "VALUES",
    };
    if (valueSurvived(ended)) {
      this.reporter.survived();
    }
    if (valueOnlyInAdapter(ended)) {
      this.reporter.inAdapter();
    }
  }

  /**
   * Performs the specification's command `Mutant`: gives one mutant of the report.
   * Every mutant is given this way, the sites of values included.
   *
   * @param killed whether the mutant was killed (specification parameter `killed`).
   */
  mutant(killed: boolean): void {
    this.current = {
      ...this.current,
      anyKilled: this.current.anyKilled || killed,
      phase: "MUTANTS",
    };
  }

  /**
   * Performs the specification's command `Finish`: the judgement is over. This is
   * where the reporter may be told about the report as a whole.
   *
   * @param shared whether the production code is shared with other components in a
   *   way that could not be narrowed (specification parameter `shared`).
   */
  finish(shared: boolean): void {
    const finished = this.current;
    this.current = { ...finished, phase: "DONE" };
    if (mutationIneffective(finished, shared)) {
      this.reporter.ineffective();
    }
  }
}
