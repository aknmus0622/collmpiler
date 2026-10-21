/**
 * The mutation gate's judge: reads one mutation report, per value and
 * overall, and reports verdicts.
 *
 * Corresponds to the specification component "mutation-judge". One
 * `MutationJudge` object judges one mutation report. It is driven from
 * outside: whoever owns it feeds it the report piece by piece by calling its
 * methods, and it tells its `MutationJudgeListener` its verdicts. It asks
 * nothing of its environment.
 *
 * Feeding order: for each decision-table value, `beginValue`, then one
 * `site` per site reported for that value, then `endValue`. After the
 * values, one `mutant` per mutant in the report (including the mutants at
 * value sites). Finally `finish`.
 *
 * Command -> method:
 *   `BeginValue` -> `beginValue`
 *   `Site`       -> `site`
 *   `EndValue`   -> `endValue`
 *   `Mutant`     -> `mutant`
 *   `Finish`     -> `finish`
 *
 * Effect -> listener method:
 *   `Survived`    -> `MutationJudgeListener.survived`
 *   `InAdapter`   -> `MutationJudgeListener.inAdapter`
 *   `Ineffective` -> `MutationJudgeListener.ineffective`
 */

/**
 * Where the judgement stands; values identical to the specification's states.
 *   `"VALUES"`   starting state; between values, ready for `beginValue`.
 *   `"IN_VALUE"` after `beginValue`, until `endValue`; ready for `site`.
 *   `"MUTANTS"`  after the first `mutant`.
 *   `"DONE"`     after `finish` (final state).
 */
export type MutationJudgeState = "VALUES" | "IN_VALUE" | "MUTANTS" | "DONE";

/**
 * What the judgement remembers between commands (spec `model.data`; field
 * names identical to the specification's). Before any command every field
 * is `false`.
 */
export interface MutationJudgeProgress {
  /** Running flag about the mutants given so far (spec `anyKilled`). Updated by `mutant`. */
  anyKilled: boolean;
  /** Running flag about the values finished so far (spec `located`). Updated by `endValue`. */
  located: boolean;
  /** Per-value flag about the sites given for the current value (spec `sawSite`). Reset by `beginValue`, updated by `site`. */
  sawSite: boolean;
  /** Per-value flag about the outcomes of the current value's sites (spec `siteKilled`). Reset by `beginValue`, updated by `site`. */
  siteKilled: boolean;
  /** Per-value flag derived from the `beginValue` input (spec `valueInAdapter`). Set by `beginValue`. */
  valueInAdapter: boolean;
}

/** Input of `BeginValue`: facts about one decision-table value. Field names identical to the specification's. */
export interface ValueFacts {
  /** Whether the value is a number. */
  numeric: boolean;
  /** Whether the value appears in the test adapter. */
  inAdapter: boolean;
}

/** Dependency: told the verdicts of the judgement (spec effects; none carries a payload). */
export interface MutationJudgeListener {
  /** Spec effect `Survived`, about the value whose sites just ended. May be told by `endValue`. */
  survived(): void;
  /** Spec effect `InAdapter`, about the value whose sites just ended. May be told by `endValue`. */
  inAdapter(): void;
  /** Spec effect `Ineffective`, about the report as a whole. May be told by `finish`. */
  ineffective(): void;
}

/**
 * Judges one mutation report. Starts in `"VALUES"`. Each method performs one
 * specification command; calling a method in a state the command is not
 * listed for has unspecified behaviour.
 */
export class MutationJudge {
  private readonly listener: MutationJudgeListener;
  private current: MutationJudgeState = "VALUES";
  private data: MutationJudgeProgress = {
    anyKilled: false,
    located: false,
    sawSite: false,
    siteKilled: false,
    valueInAdapter: false,
  };

  /** @param listener receives the verdicts. */
  constructor(listener: MutationJudgeListener) {
    this.listener = listener;
  }

  /** Current state of the judgement (spec state names). */
  get state(): MutationJudgeState {
    return this.current;
  }

  /** What the judgement currently remembers (spec data); a copy. */
  get progress(): MutationJudgeProgress {
    return { ...this.data };
  }

  /**
   * Spec command `BeginValue` (in `"VALUES"`): starts the next
   * decision-table value, described by `value`. Resets the remembered per-value data, remembers
   * `valueInAdapter` and moves to `"IN_VALUE"`. Tells nothing.
   */
  beginValue(value: ValueFacts): void {
    this.data = {
      ...this.data,
      sawSite: false,
      siteKilled: false,
      valueInAdapter: valueInAdapterNow(value),
    };
    this.current = "IN_VALUE";
  }

  /**
   * Spec command `Site` (in `"IN_VALUE"`): one site of the current value;
   * `killed` is that site's mutation-test outcome (spec input `killed`). Updates `sawSite` / `siteKilled`. Tells nothing; the state
   * does not change.
   */
  site(killed: boolean): void {
    this.data = { ...this.data, sawSite: true, siteKilled: this.data.siteKilled || killed };
  }

  /**
   * Spec command `EndValue` (in `"IN_VALUE"`): the current value's sites are
   * over. Updates `located`, may tell `survived` or `inAdapter`, and moves
   * back to `"VALUES"`.
   */
  endValue(): void {
    const verdicts = valueVerdicts(this.data);
    if (verdicts.survived) this.listener.survived();
    if (verdicts.inAdapter) this.listener.inAdapter();
    this.data = { ...this.data, located: locatedNow(this.data) };
    this.current = "VALUES";
  }

  /**
   * Spec command `Mutant` (in `"VALUES"` or `"MUTANTS"`): one mutant of the
   * report; `killed` is its mutation-test outcome (spec input `killed`). Updates `anyKilled`
   * and moves to `"MUTANTS"`. Tells nothing.
   */
  mutant(killed: boolean): void {
    this.data = { ...this.data, anyKilled: anyKilledNow(this.data, killed) };
    this.current = "MUTANTS";
  }

  /**
   * Spec command `Finish` (in `"VALUES"` or `"MUTANTS"`): the judgement is
   * over. `shared` is the spec input of the same name (about how the
   * production code is shared with other components). May tell
   * `ineffective`; moves to `"DONE"`.
   */
  finish(shared: boolean): void {
    if (isIneffective(this.data, shared)) this.listener.ineffective();
    this.current = "DONE";
  }
}

/** Pure calculation `valueInAdapterNow`, from the input of `beginValue`. */
export function valueInAdapterNow(value: ValueFacts): boolean {
  return value.numeric && value.inAdapter;
}

/** Pure calculation `locatedNow`, from what is remembered when `endValue` is performed. */
export function locatedNow(progress: MutationJudgeProgress): boolean {
  return progress.located || progress.sawSite;
}

/** Pure calculation `anyKilledNow`, from what is remembered and the `killed` input of `mutant`. */
export function anyKilledNow(progress: MutationJudgeProgress, killed: boolean): boolean {
  return progress.anyKilled || killed;
}

/** Which verdicts `endValue` tells, from what is remembered when it is performed. */
export interface ValueVerdicts {
  /** Whether to tell `MutationJudgeListener.survived`. */
  survived: boolean;
  /** Whether to tell `MutationJudgeListener.inAdapter`. */
  inAdapter: boolean;
}

/** Pure decision for `endValue`: which verdicts to tell about the value whose sites are over. */
export function valueVerdicts(progress: MutationJudgeProgress): ValueVerdicts {
  return {
    survived: progress.sawSite && !progress.siteKilled,
    inAdapter: !progress.sawSite && progress.valueInAdapter,
  };
}

/** Pure decision for `finish`: whether to tell `MutationJudgeListener.ineffective`. */
export function isIneffective(progress: MutationJudgeProgress, shared: boolean): boolean {
  return !progress.located && !progress.anyKilled && !shared;
}
