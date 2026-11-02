/**
 * Judges, one decision-table value at a time, whether changing that value shows in
 * what the specification expects. It asks for runs of the changed specification and
 * reports on the values through a `MutationRuns`.
 *
 * The whole conversation is: call a command of `MutationVerdict`, see which
 * `MutationRuns` methods it called, and call the next command.
 *
 * It corresponds to the specification's component `mutation-verdict`; `MutationRuns`
 * corresponds to its external component `runs`. It keeps nothing across a restart: a
 * new instance starts over.
 */

/**
 * What kind of value a decision-table value is. Specification name: parameter `kind`
 * of command `Begin`; the values are the specification's own.
 *
 * - `"number"`, `"string"`, `"boolean"`: a value of that JSON type.
 * - `"null"`: a cell a row of the table does not use.
 */
export type TableValueKind = "number" | "string" | "boolean" | "null";

/**
 * Where the judging stands. Specification name: state field `status`; the values are
 * the specification's own.
 *
 * - `"IDLE"`: no value is being judged; the next one can begin.
 * - `"TRYING"`: a value is being judged; the outcome of a run is awaited.
 */
export type MutationVerdictStatus = "IDLE" | "TRYING";

/**
 * Everything the verdict remembers, one field per state field of the specification,
 * under the same names.
 */
export interface MutationVerdictState {
  /** Whether the value being judged is a boolean (`booleanValue`). */
  booleanValue: boolean;
  /**
   * Whether a run so far of the value being judged changed whether a command can be
   * executed (`enablementChanged`).
   */
  enablementChanged: boolean;
  /** Which extra seed the run being awaited belongs to (`extra`). */
  extra: number;
  /** Where the judging stands (`status`). */
  status: MutationVerdictStatus;
}

/**
 * The outcome of one finished run. The field names are the parameter names of the
 * specification's command `Tried`.
 */
export interface TrialOutcome {
  /** Whether some expected outcome changed (specification parameter `changed`). */
  changed: boolean;
  /**
   * Whether, in some step, the changed specification would have executed a different
   * command (specification parameter `enablementDiffers`).
   */
  enablementDiffers: boolean;
}

/**
 * How serious a report is. Specification name: parameter `severity` of the external
 * command `Report`; the values are the specification's own.
 */
export type MutationSeverity = "error" | "warning";

/**
 * What is reported about a value. Specification name: parameter `verdict` of the
 * external command `Report`; the values are the specification's own.
 *
 * - `"precondition"`: the change is seen only in whether commands can be executed.
 * - `"unobserved"`: the change is not seen at all.
 * - `"rare"`: the change is seen, but only seldom.
 */
export type MutationFinding = "precondition" | "unobserved" | "rare";

/**
 * What the verdict asks for and reports; it corresponds to the specification's
 * external component `runs`, with one method per command under the same name in lower
 * camel case.
 *
 * Each method is called from inside a command of `MutationVerdict` and returns
 * nothing. Whether it is called, and with which arguments, is the verdict's decision.
 * A stand-in should record the calls, in order. The outcome of a requested run is not
 * returned: it comes back later, through `MutationVerdict.tried`.
 */
export interface MutationRuns {
  /**
   * Asks for a run of the changed specification (specification command `RunTrials`).
   * Called from `MutationVerdict.begin` and `MutationVerdict.tried`.
   *
   * @param extra which seed to run under (specification parameter `extra`).
   */
  runTrials(extra: number): void;
  /**
   * Reports on the value being judged (specification command `Report`). Called from
   * `MutationVerdict.tried`.
   *
   * @param severity how serious it is (specification parameter `severity`).
   * @param verdict what is reported (specification parameter `verdict`).
   */
  report(severity: MutationSeverity, verdict: MutationFinding): void;
}

/** The verdict's state before anything has been judged. */
function initialState(): MutationVerdictState {
  return {
    booleanValue: false,
    enablementChanged: false,
    extra: 0,
    status: "IDLE",
  };
}

/** How many extra seeds a value is tried under after the verification seed. */
function extraSeeds(): number {
  return 2;
}

/** Whether the value is a cell a row of the table does not use, which is not judged. */
function isUnusedCell(kind: TableValueKind): boolean {
  return kind === "null";
}

/** Whether, after a run under this seed that changed nothing, another seed remains. */
function seedsRemain(extra: number): boolean {
  return extra < extraSeeds();
}

/** The severity of a value no seed showed: booleans do not fail the mutation gate. */
function unseenSeverity(booleanValue: boolean): MutationSeverity {
  return booleanValue ? "warning" : "error";
}

/** The finding on a value no seed showed. */
function unseenFinding(enablementChanged: boolean): MutationFinding {
  return enablementChanged ? "precondition" : "unobserved";
}

/**
 * The judging of a sequence of decision-table values. Create one with
 * `new MutationVerdict(runs)`; it starts in the specification's initial state.
 *
 * Each method other than `state` performs one command of the specification and
 * returns nothing: what the command leads to is seen in the calls on `runs` and in
 * `state()`. A command's `requires` limits when it may be called; other calls are
 * never made. The usual sequence is: for each value `begin`, then `tried` once per run
 * asked for.
 */
export class MutationVerdict {
  private readonly runs: MutationRuns;
  private current: MutationVerdictState = initialState();

  /**
   * @param runs asked for runs and told the reports, for as long as the verdict lives.
   */
  constructor(runs: MutationRuns) {
    this.runs = runs;
  }

  /**
   * Reads what the verdict remembers. It only reads, and may be called at any point.
   *
   * @returns a new plain object, so it can be compared by value.
   */
  state(): MutationVerdictState {
    return { ...this.current };
  }

  /**
   * Performs the specification's command `Begin`: a value of a decision table is
   * judged next.
   *
   * @param kind what kind of value it is (specification parameter `kind`).
   */
  begin(kind: TableValueKind): void {
    if (isUnusedCell(kind)) {
      return;
    }
    this.current = {
      booleanValue: kind === "boolean",
      enablementChanged: false,
      extra: 0,
      status: "TRYING",
    };
    this.runs.runTrials(0);
  }

  /**
   * Performs the specification's command `Tried`: a run asked for has finished. This
   * is where `runs` may be asked for another run, or told a report.
   *
   * @param outcome how the run came out.
   */
  tried(outcome: TrialOutcome): void {
    const finished = this.current;
    if (outcome.changed) {
      this.current = { ...finished, status: "IDLE" };
      if (finished.extra > 0) {
        this.runs.report("warning", "rare");
      }
      return;
    }
    if (seedsRemain(finished.extra)) {
      const next = finished.extra + 1;
      this.current = {
        ...finished,
        enablementChanged: finished.enablementChanged || outcome.enablementDiffers,
        extra: next,
      };
      this.runs.runTrials(next);
      return;
    }
    this.current = { ...finished, status: "IDLE" };
    this.runs.report(
      unseenSeverity(finished.booleanValue),
      unseenFinding(finished.enablementChanged || outcome.enablementDiffers),
    );
  }
}
