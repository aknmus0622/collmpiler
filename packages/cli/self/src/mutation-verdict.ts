/**
 * Mutation verdict: judges, one decision-table value at a time, whether changing
 * the value shows in what the specification expects. It asks for runs of the
 * changed specification and reports the values that do not show.
 *
 * Corresponds to the specification component `mutation-verdict`. Nothing it keeps
 * is durable, and it serves no HTTP routes. Its state is
 * {@link MutationVerdictState}; it relies on one dependency, the runs
 * ({@link MutationRuns}, specification component `runs`), which is asked for runs
 * and told what is reported.
 *
 * Each specification command is a pure step function (`*Step`) that takes the
 * state before the command and answers the state after it together with the
 * calls to make on the runs, in order ({@link MutationVerdictStep}).
 * {@link MutationVerdict} keeps the state, runs those step functions and makes the
 * calls on its runs.
 *
 * Use: for each value, `begin` with the value's kind; then, each time a run that
 * was asked for has finished, `tried` with its outcome, until the component is
 * back in status `"IDLE"`. Commands are only sent in the status stated for each
 * method; other inputs are never sent and need no handling.
 */

/**
 * Where the verdict is (specification state field `status`). The names are the
 * specification's.
 *
 * - `"IDLE"`: no value is being judged; the next value may begin.
 * - `"TRYING"`: a value is being judged and a run of it has been asked for; its
 *   outcome (`tried`) comes next.
 */
export type VerdictStatus = "IDLE" | "TRYING";

/**
 * The kind of the decision-table value judged next (specification parameter
 * `kind` of `Begin`). `"null"` is a cell that a row does not use.
 */
export type ValueKind = "number" | "string" | "boolean" | "null";

/** How serious a report is (specification parameter `severity` of `runs.Report`). */
export type ReportSeverity = "error" | "warning";

/**
 * What is reported about a value (specification parameter `verdict` of `runs.Report`).
 *
 * - `"precondition"`: the change shows only in whether commands can be executed.
 * - `"unobserved"`: the change was not observed at all.
 * - `"rare"`: the change shows, but only in some runs.
 */
export type ReportVerdict = "precondition" | "unobserved" | "rare";

/**
 * Everything the verdict remembers (the specification's `state`). Each field has
 * the name of the specification state field it holds.
 */
export interface MutationVerdictState {
  /** Whether the value being judged is a boolean (state `booleanValue`). */
  readonly booleanValue: boolean;
  /**
   * Whether, in some run of the value being judged so far, whether a command can
   * be executed changed (state `enablementChanged`).
   */
  readonly enablementChanged: boolean;
  /**
   * Which run of the value is in progress: 0 for the verification seed, then the
   * number of the extra seed (state `extra`).
   */
  readonly extra: number;
  /** Where the verdict is (state `status`). */
  readonly status: VerdictStatus;
}

/** The state the verdict starts from (the specification's `init`). */
export function initialMutationVerdictState(): MutationVerdictState {
  return { booleanValue: false, enablementChanged: false, extra: 0, status: "IDLE" };
}

/** The answer of the decision table `seeds` (specification decision `seeds`). */
export interface SeedPlan {
  /** How many extra seeds may be tried after the verification seed (result field `extraSeeds`). */
  readonly extraSeeds: number;
}

/** Specification decision table `seeds` (no parameters). Pure. */
export function seedPlan(): SeedPlan {
  return { extraSeeds: 2 };
}

/**
 * The runs (specification component `runs`, external): asked for runs of the
 * changed specification and told what is reported. Each method is one of its
 * specification commands; the verdict calls them, in order, during one of its own
 * commands. None of them answers anything; the outcome of a run that was asked
 * for comes back later through {@link MutationVerdict.tried}.
 */
export interface MutationRuns {
  /**
   * Asks for a run of the value being judged (specification `RunTrials`).
   *
   * @param extra which seed to run under: 0 for the verification seed, otherwise
   *              the number of the extra seed (specification parameter `extra`).
   */
  runTrials(extra: number): void;
  /**
   * Reports the value being judged (specification `Report`).
   *
   * @param severity how serious the report is (specification parameter `severity`).
   * @param verdict  what is reported (specification parameter `verdict`).
   */
  report(severity: ReportSeverity, verdict: ReportVerdict): void;
}

/**
 * One call the verdict makes on its runs: `call` names the {@link MutationRuns}
 * method, the other fields are its arguments.
 */
export type RunsCall =
  | { readonly call: "runTrials"; readonly extra: number }
  | { readonly call: "report"; readonly severity: ReportSeverity; readonly verdict: ReportVerdict };

/** Makes one call on the runs. */
export function callRuns(runs: MutationRuns, call: RunsCall): void {
  if (call.call === "runTrials") {
    runs.runTrials(call.extra);
  } else {
    runs.report(call.severity, call.verdict);
  }
}

/** The result of a step function: the state after the command and the calls to make on the runs, in order. */
export interface MutationVerdictStep {
  readonly state: MutationVerdictState;
  readonly calls: readonly RunsCall[];
}

/** The outcome of a finished run (parameters of specification `Tried`). */
export interface TrialOutcome {
  /** Whether some expected outcome changed in the run (specification parameter `changed`). */
  readonly changed: boolean;
  /**
   * Whether, in some step of the run, the changed specification would have
   * executed a different command, i.e. whether a command can be executed changed
   * (specification parameter `enablementDiffers`).
   */
  readonly enablementDiffers: boolean;
}

// ---------------------------------------------------------------------------
// Step functions: one per specification command, pure

/**
 * Specification command `Begin`: a value of a decision table is judged next.
 * Sent only in status `"IDLE"`.
 *
 * @param kind the kind of the value (specification parameter `kind`).
 */
export function beginStep(state: MutationVerdictState, kind: ValueKind): MutationVerdictStep {
  // A cell that a row does not use is not judged.
  if (kind === "null") {
    return { state, calls: [] };
  }
  return {
    state: { booleanValue: kind === "boolean", enablementChanged: false, extra: 0, status: "TRYING" },
    calls: [{ call: "runTrials", extra: 0 }],
  };
}

/**
 * Specification command `Tried`: a run that was asked for has finished.
 * Sent only in status `"TRYING"`.
 *
 * @param outcome what the run showed (specification parameters `changed` and `enablementDiffers`).
 */
export function triedStep(state: MutationVerdictState, outcome: TrialOutcome): MutationVerdictStep {
  if (outcome.changed) {
    // The change shows; if only under an extra seed, it shows only rarely.
    const calls: RunsCall[] = state.extra > 0 ? [{ call: "report", severity: "warning", verdict: "rare" }] : [];
    return { state: { ...state, status: "IDLE" }, calls };
  }
  if (state.extra < seedPlan().extraSeeds) {
    // Not shown yet: try the next extra seed.
    return {
      state: {
        ...state,
        enablementChanged: state.enablementChanged || outcome.enablementDiffers,
        extra: state.extra + 1,
      },
      calls: [{ call: "runTrials", extra: state.extra + 1 }],
    };
  }
  // Every seed tried and the change never showed.
  const severity: ReportSeverity = state.booleanValue ? "warning" : "error";
  const verdict: ReportVerdict = state.enablementChanged || outcome.enablementDiffers ? "precondition" : "unobserved";
  return { state: { ...state, status: "IDLE" }, calls: [{ call: "report", severity, verdict }] };
}

// ---------------------------------------------------------------------------
// The component

/**
 * The verdict on the values of a mutation, one value at a time. It starts in the
 * initial state, keeps its state between commands, and makes its calls on the
 * runs synchronously, in order, before the command method returns. No command
 * answers anything; read {@link MutationVerdict.state} to see where it is.
 */
export class MutationVerdict {
  private readonly runs: MutationRuns;
  private current: MutationVerdictState = initialMutationVerdictState();

  /** @param runs the runs the verdict asks for runs and reports to (specification `runs`). */
  constructor(runs: MutationRuns) {
    this.runs = runs;
  }

  /** The current state (all specification state fields, with the same names). */
  get state(): MutationVerdictState {
    return this.current;
  }

  /**
   * A decision-table value is judged next (specification `Begin`). Sent only in
   * status `"IDLE"`. The runs may be asked for a run (`runTrials`).
   *
   * @param kind the kind of the value (specification parameter `kind`).
   */
  begin(kind: ValueKind): void {
    this.apply(beginStep(this.current, kind));
  }

  /**
   * A run that was asked for has finished (specification `Tried`). Sent only in
   * status `"TRYING"`. The runs may be asked for another run (`runTrials`) or told
   * a report (`report`).
   *
   * @param outcome whether some expected outcome changed in the run, and whether
   *                whether a command can be executed changed in it
   *                (specification parameters `changed` and `enablementDiffers`).
   */
  tried(outcome: TrialOutcome): void {
    this.apply(triedStep(this.current, outcome));
  }

  /** Takes the state after a command and makes its calls on the runs, in order. */
  private apply(step: MutationVerdictStep): void {
    this.current = step.state;
    for (const call of step.calls) {
      callRuns(this.runs, call);
    }
  }
}
