/**
 * Chooses, for the simulator of a specification, the command executed at a
 * step and the case that happens.
 *
 * Corresponds to the specification component "step-choice". The component has
 * no states of its own (it is always in the specification state `READY`) and
 * performs no effects. One `StepChoice` object remembers what it has been told
 * between calls; each method performs one specification command. Nothing is
 * kept across a restart of the system.
 *
 * Choosing a command: call `beginStep` with the state of the step, then, for
 * each command of the simulated specification, describe it with `consider`,
 * followed by its facts in this order: every `from`, then every `pathValue`,
 * then every `onlyIf`, and finally `considered`. Then ask `choose`.
 *
 * Choosing a case: call `beginCases`, then `caseNamed` once per case of the
 * simulated outcome table (in the order of the table), then ask `decideCase`.
 *
 * Command -> method:
 *   `BeginCases` -> `beginCases`
 *   `BeginStep`  -> `beginStep`
 *   `Case`       -> `caseNamed`
 *   `Choose`     -> `choose`
 *   `Consider`   -> `consider`
 *   `Considered` -> `considered`
 *   `DecideCase` -> `decideCase`
 *   `From`       -> `from`
 *   `OnlyIf`     -> `onlyIf`
 *   `PathValue`  -> `pathValue`
 *
 * Query -> dependency method:
 *   `holds` -> `ConditionOracle.holds`
 *
 * Remembered data (spec `data`: `considering`, `enabled`, `hits`, `possible`,
 * `stepState`) is private; it is observable only through the answers of
 * `choose` and `decideCase` and through the questions put to the
 * `ConditionOracle`. It starts as in the specification's `model.initial`.
 * The specification calculations are the exported pure functions at the end
 * of this file.
 */

/**
 * The environment's answer to whether a named condition holds in the situation
 * being simulated (spec query `holds`).
 */
export interface ConditionOracle {
  /**
   * Whether the condition named `condition` (spec input field `condition`)
   * holds, for the command being considered or for the case being chosen.
   * Asked by `onlyIf` and by `caseNamed`, at the moment the answer is needed;
   * the answer may differ from one call to the next.
   */
  holds(condition: string): boolean;
}

/** Input of `choose` (spec command `Choose`). Field names identical to the specification's. */
export interface ChooseInput {
  /**
   * The command another component calls at this step, or `null` when no
   * command is forced.
   */
  forced: string | null;
  /** A non-negative integer selecting among the commands that can be executed. */
  pick: number;
  /** Whether a forced command that cannot be executed at this step is refused. */
  strict: boolean;
}

/** Answer of `choose` (spec output `Choose`). */
export interface CommandChoice {
  /** The command executed at this step, or `null` when none is chosen. */
  chosen: string | null;
  /** Whether a forced call was refused. */
  refused: boolean;
}

/** Answer of `decideCase` (spec output `DecideCase`). */
export interface CaseDecision {
  /**
   * The name of the case that happens (possibly `"otherwise"`), or `null`
   * when none is chosen.
   */
  chosen: string | null;
  /** The cases in conflict, in the order they were given; empty when there is no conflict. */
  conflict: string[];
}

/** The case without a condition, which happens when no other case holds. */
const OTHERWISE = "otherwise";

/** Whether `value` cannot be sent as a path segment of an HTTP route. */
function isUnsendablePathSegment(value: string): boolean {
  return value === "." || value === "..";
}

/**
 * Remembers the step being simulated, the command being considered, the
 * commands found executable, and the cases found to hold.
 */
export class StepChoice {
  private readonly oracle: ConditionOracle;
  private stepState = "";
  private enabled: string[] = [];
  private considering = "";
  private possible = false;
  private hits: string[] = [];

  /**
   * @param oracle answers whether a named condition holds (spec query `holds`).
   */
  constructor(oracle: ConditionOracle) {
    this.oracle = oracle;
  }

  /**
   * Spec command `BeginCases`: a case is chosen next; forgets the cases given
   * so far (spec data `hits`).
   */
  beginCases(): void {
    this.hits = [];
  }

  /**
   * Spec command `BeginStep`: a new step starts in the simulated state
   * `state` (spec data `stepState`); forgets the commands found executable so
   * far (spec data `enabled`). The cases given so far are kept.
   */
  beginStep(state: string): void {
    this.stepState = state;
    this.enabled = [];
  }

  /**
   * Spec command `Case`: a case of the table being decided, named by its
   * condition `name` (the name `"otherwise"` included). May ask the
   * `ConditionOracle` about `name`.
   */
  caseNamed(name: string): void {
    if (name === OTHERWISE) return;
    if (this.oracle.holds(name)) this.hits = hitsWithCase(this.hits, name);
  }

  /**
   * Spec command `Choose`: answers which command is executed at this step,
   * from the commands found executable since `beginStep`. Changes nothing.
   */
  choose(input: ChooseInput): CommandChoice {
    const { forced, pick, strict } = input;
    if (forced === null) {
      if (this.enabled.length === 0) return { chosen: null, refused: false };
      return { chosen: pickedCommand(this.enabled, pick), refused: false };
    }
    if (strict && !this.enabled.includes(forced)) return { chosen: null, refused: true };
    return { chosen: forced, refused: false };
  }

  /**
   * Spec command `Consider`: the command named `command` is considered next
   * (spec data `considering`). `everywhere` tells whether it names no states
   * it is executed from (spec data `possible` starts from it).
   */
  consider(command: string, everywhere: boolean): void {
    this.considering = command;
    this.possible = everywhere;
  }

  /**
   * Spec command `Considered`: every fact about the command being considered
   * has been given; it may be added to the commands found executable at this
   * step (spec data `enabled`).
   */
  considered(): void {
    if (this.possible) this.enabled = enabledWithConsidered(this.enabled, this.considering);
  }

  /**
   * Spec command `DecideCase`: answers which case happens, from the cases
   * given since `beginCases`. Changes nothing.
   */
  decideCase(): CaseDecision {
    if (this.hits.length === 1) return { chosen: onlyHit(this.hits), conflict: [] };
    if (this.hits.length === 0) return { chosen: OTHERWISE, conflict: [] };
    return { chosen: null, conflict: [...this.hits] };
  }

  /**
   * Spec command `From`: `state` is a simulated state the command being
   * considered can be executed from.
   */
  from(state: string): void {
    if (state === this.stepState) this.possible = true;
  }

  /**
   * Spec command `OnlyIf`: `condition` names a condition that must hold for
   * the command being considered to be executed. May ask the
   * `ConditionOracle` about `condition`.
   */
  onlyIf(condition: string): void {
    if (this.possible && !this.oracle.holds(condition)) this.possible = false;
  }

  /**
   * Spec command `PathValue`: `value` is a value the command being considered
   * would put into a path segment of its HTTP route.
   */
  pathValue(value: string): void {
    if (isUnsendablePathSegment(value)) this.possible = false;
  }
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

/** Spec calculation `enabledWithConsidered`: the executable commands after adding `considering` to `enabled`. */
export function enabledWithConsidered(enabled: readonly string[], considering: string): string[] {
  return [...enabled, considering];
}

/** Spec calculation `hitsWithCase`: the holding cases after adding the case `name` to `hits`. */
export function hitsWithCase(hits: readonly string[], name: string): string[] {
  return [...hits, name];
}

/** Spec calculation `pickedCommand`: the command selected by `pick` among `enabled` (non-empty). */
export function pickedCommand(enabled: readonly string[], pick: number): string {
  return enabled[pick % enabled.length];
}

/** Spec calculation `onlyHit`: the single case in `hits`. */
export function onlyHit(hits: readonly string[]): string {
  return hits[0];
}
