/**
 * The mutation gate's per-value verdict: judges, one decision-table value at
 * a time, whether a changed value shows in what the specification expects.
 *
 * Corresponds to the specification component "mutation-verdict". One
 * `MutationVerdict` object judges a sequence of values, one after another.
 * It is driven from outside: whoever owns it calls `begin` with the next
 * value, performs the runs it is asked for through its
 * `MutationVerdictListener`, and calls `tried` with the result of each run.
 * It asks nothing of its environment.
 *
 * Command -> method:
 *   `Begin` -> `begin`
 *   `Tried` -> `tried`
 *
 * Effect -> listener method:
 *   `RunTrials` -> `MutationVerdictListener.runTrials`
 *   `Report`    -> `MutationVerdictListener.report`
 */

/**
 * Where the judgement stands; values identical to the specification's states.
 *   `"IDLE"`   no value is being judged; ready for `begin` (the starting state).
 *   `"TRYING"` the changed value is being run under one seed after another;
 *              ready for `tried`.
 */
export type MutationVerdictState = "IDLE" | "TRYING";

/**
 * The kind of a decision-table value (spec input `kind` of `Begin`, spec
 * data `valueKind`). `"null"` is a cell that a row does not use.
 */
export type ValueKind = "number" | "string" | "boolean" | "null";

/** The verdict reported about a value (spec effect `Report`, field `verdict`). */
export type MutationVerdictKind = "precondition" | "unobserved" | "rare";

/** How serious a reported verdict is (spec effect `Report`, field `severity`). */
export type VerdictSeverity = "error" | "warning";

/**
 * What the judgement remembers between commands (spec `model.data`; field
 * names identical to the specification's). A field is `null` until a command
 * has stored it.
 */
export interface MutationVerdictProgress {
  /**
   * Spec `commandChangeSeen`: a running flag about the `enablementDiffers`
   * results of the current value's runs. Set by `begin`, updated by `tried`.
   */
  commandChangeSeen: boolean | null;
  /**
   * Spec `currentExtra`: the extra of the run asked for most recently for the
   * current value (0 is the verification seed itself). Set by `begin`,
   * updated by `tried`.
   */
  currentExtra: number | null;
  /** Spec `valueKind`: the kind of the value being judged. Set by `begin`. */
  valueKind: ValueKind | null;
}

/** Input of `Tried`: the result of the run that has just finished. Field names identical to the specification's. */
export interface TrialResult {
  /** Whether some expected outcome changed in that run. */
  changed: boolean;
  /**
   * Whether, in some step of that run, the changed specification would have
   * executed a different command (whether a command can be executed changed).
   */
  enablementDiffers: boolean;
}

/** Dependency: asked for runs and told the verdicts (spec effects). */
export interface MutationVerdictListener {
  /**
   * Spec effect `RunTrials`: run the specification with the current value
   * changed, under the verification seed (`extra` 0) or under the
   * verification seed plus `extra`. Asked by `begin` and by `tried`; the
   * result is expected back through `tried`.
   */
  runTrials(extra: number): void;
  /**
   * Spec effect `Report`: the current value is reported with `verdict`, and
   * how serious it is (`severity`). May be told by `tried`.
   */
  report(verdict: MutationVerdictKind, severity: VerdictSeverity): void;
}

/**
 * Judges decision-table values one after another. Starts in `"IDLE"`. Each
 * method performs one specification command; calling a method in a state
 * the command is not listed for has unspecified behaviour.
 */
export class MutationVerdict {
  private readonly listener: MutationVerdictListener;
  private current: MutationVerdictState = "IDLE";
  private data: MutationVerdictProgress = { commandChangeSeen: null, currentExtra: null, valueKind: null };

  /** @param listener is asked for runs and receives the verdicts. */
  constructor(listener: MutationVerdictListener) {
    this.listener = listener;
  }

  /** Current state of the judgement (spec state names). */
  get state(): MutationVerdictState {
    return this.current;
  }

  /** What the judgement currently remembers (spec data); a copy. */
  get progress(): MutationVerdictProgress {
    return { ...this.data };
  }

  /**
   * Spec command `Begin` (in `"IDLE"`): the next decision-table value is to
   * be judged; `kind` is its kind (spec input `kind`). Either skips the value
   * (nothing happens, the state stays `"IDLE"`), or stores the per-value data,
   * asks `runTrials` for the first run and moves to `"TRYING"`.
   */
  begin(kind: ValueKind): void {
    if (kind === "null") return;
    this.data = { commandChangeSeen: false, currentExtra: 0, valueKind: kind };
    this.current = "TRYING";
    this.listener.runTrials(0);
  }

  /**
   * Spec command `Tried` (in `"TRYING"`): the run asked for most recently has
   * finished with `result`. Either asks `runTrials` for another run (staying
   * in `"TRYING"` and updating the remembered data), or finishes the value
   * and moves back to `"IDLE"`, telling `report` at most once.
   */
  tried(result: TrialResult): void {
    const kind = this.data.valueKind ?? "null";
    switch (triedCase(this.data, result)) {
      case "rare":
        this.listener.report("rare", "warning");
        this.current = "IDLE";
        return;
      case "shows":
        this.current = "IDLE";
        return;
      case "next-seed": {
        const extra = nextExtra(this.data);
        this.listener.runTrials(extra);
        this.data = { ...this.data, commandChangeSeen: commandChangeSeenNow(this.data, result), currentExtra: extra };
        return;
      }
      case "precondition":
        this.listener.report("precondition", severity(kind));
        this.current = "IDLE";
        return;
      case "unobserved":
        this.listener.report("unobserved", severity(kind));
        this.current = "IDLE";
        return;
    }
  }
}

/**
 * Which case of the spec's `Tried` behaviour applies, one per row:
 *   `"rare"`         the row that reports verdict `"rare"`.
 *   `"shows"`        the row in which the value shows: nothing is reported.
 *   `"next-seed"`    the row that asks for another run.
 *   `"precondition"` the row that reports verdict `"precondition"`.
 *   `"unobserved"`   the `otherwise` row (reports verdict `"unobserved"`).
 */
export type TriedCase = "rare" | "shows" | "next-seed" | "precondition" | "unobserved";

/** Pure decision for `tried`: which case applies, from what is remembered and the run's result. */
export function triedCase(progress: MutationVerdictProgress, result: TrialResult): TriedCase {
  const extra = progress.currentExtra ?? 0;
  if (result.changed) return extra > 0 ? "rare" : "shows";
  if (extra < extraSeeds()) return "next-seed";
  return commandChangeSeenNow(progress, result) ? "precondition" : "unobserved";
}

/** Spec decision table `seeds`, column `extraSeeds`: how many extra seeds a value is tried under. */
export function extraSeeds(): number {
  return 2;
}

/** Pure calculation `nextExtra`, from what is remembered when `tried` is performed. */
export function nextExtra(progress: MutationVerdictProgress): number {
  return (progress.currentExtra ?? 0) + 1;
}

/** Pure calculation `commandChangeSeenNow`, from what is remembered and the result given to `tried`. */
export function commandChangeSeenNow(progress: MutationVerdictProgress, result: TrialResult): boolean {
  return progress.commandChangeSeen === true || result.enablementDiffers;
}

/** Pure calculation `severity`, from the kind of the value being judged. */
export function severity(kind: ValueKind): VerdictSeverity {
  return kind === "boolean" ? "warning" : "error";
}
