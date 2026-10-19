import { commandChangeSeenNow, isSkipped, judgeTrial, nextExtra } from "./judgement.ts";
import type {
  MutationVerdictState,
  TrialResult,
  TrialRunner,
  ValueKind,
  ValueReportSink,
} from "./types.ts";

/**
 * The mutation-verdict component: decides, for one changed decision-table value at a time, what (if
 * anything) to report about it. It is driven as a loop: `begin` for one value, then `tried` once for each run it asked for, until it is
 * back in `"idle"`; then `begin` for the next value. Runs are asked for from the `TrialRunner` and reports go
 * to the `ValueReportSink`, both passed to the constructor.
 *
 * One instance judges a sequence of values. A new instance starts in the specification's initial state with
 * nothing remembered. Each method below performs one command of the specification; a command returns
 * nothing, and its outcome is observed through `state`, `commandChangeSeen`, `currentExtra`, `valueKind`,
 * and the calls made on the dependencies.
 */
export class MutationVerdict {
  private readonly runner: TrialRunner;
  private readonly reports: ValueReportSink;
  private current: MutationVerdictState = "idle";
  private seen: boolean | undefined;
  private extra: number | undefined;
  private kind: ValueKind | undefined;

  /**
   * @param runner receives the effect `RunTrials`
   * @param reports receives the effect `Report`
   */
  constructor(runner: TrialRunner, reports: ValueReportSink) {
    this.runner = runner;
    this.reports = reports;
  }

  /** The current state. `MutationVerdictState` lists the specification name of each value. */
  get state(): MutationVerdictState {
    return this.current;
  }

  /** The specification's `data.commandChangeSeen`; `undefined` until a command has stored it. */
  get commandChangeSeen(): boolean | undefined {
    return this.seen;
  }

  /** The specification's `data.currentExtra`; `undefined` until a command has stored it. */
  get currentExtra(): number | undefined {
    return this.extra;
  }

  /** The specification's `data.valueKind`; `undefined` until a command has stored it. */
  get valueKind(): ValueKind | undefined {
    return this.kind;
  }

  /**
   * Performs the command `Begin`: the next decision-table value is to be judged. May ask the runner for
   * the first run.
   *
   * @param kind the command's `kind`: the kind of the value
   */
  begin(kind: ValueKind): void {
    if (isSkipped(kind)) return;
    this.seen = false;
    this.extra = 0;
    this.kind = kind;
    this.current = "trying";
    this.runner.runTrials(0);
  }

  /**
   * Performs the command `Tried`: the run last asked for has finished. May ask the runner for another run,
   * or emit a report.
   *
   * @param result the command's input (`changed`, `enablementDiffers`)
   */
  tried(result: TrialResult): void {
    const currentExtra = this.extra ?? 0;
    const seen = this.seen ?? false;
    const outcome = judgeTrial(result, currentExtra, seen, this.kind ?? "null");
    switch (outcome.kind) {
      case "shows":
        this.current = "idle";
        return;
      case "report":
        this.reports.report(outcome.report);
        this.current = "idle";
        return;
      case "retry": {
        const next = nextExtra(currentExtra);
        this.seen = commandChangeSeenNow(seen, result.enablementDiffers);
        this.extra = next;
        this.runner.runTrials(next);
        return;
      }
    }
  }
}
