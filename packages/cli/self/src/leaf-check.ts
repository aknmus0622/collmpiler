/**
 * Leaf check over a merged specification: finds the places where something
 * should have been written but was not, and reports each one.
 *
 * Corresponds to the specification component "leaf-check". One `LeafCheck`
 * object checks one merged specification. It has no states of its own (it is
 * always in the specification's single state `READY`). It is driven from
 * outside: whoever owns it feeds it the specification piece by piece by
 * calling its methods, and it tells its `LeafCheckListener` each finding.
 *
 * Command -> method:
 *   `Begin`        -> `begin`
 *   `ProseGroup`   -> `proseGroup`
 *   `EntryField`   -> `entryField`
 *   `BeginCommand` -> `beginCommand`
 *   `BeginCase`    -> `beginCase`
 *   `Written`      -> `written`
 *   `EndCase`      -> `endCase`
 *   `Calculation`  -> `calculation`
 *   `Invariant`    -> `invariant`
 *   `Sentence`     -> `sentence`
 *
 * Effect -> listener method:
 *   `Report` -> `LeafCheckListener.report`
 *
 * Query -> dependency method (all on `LeafRules`):
 *   `required`     -> `LeafRules.isRequired`
 *   `outcome`      -> `LeafRules.isOutcome`
 *   `nonEmpty`     -> `LeafRules.mustHaveEntries`
 *   `requiredCase` -> `LeafRules.isRequiredCase`
 */

/** Kind of finding (spec field `code` of the `Report` effect); values identical to the specification's. */
export type LeafFindingCode =
  | "states-missing"
  | "init-missing"
  | "commands-missing"
  | "prose-empty"
  | "field-missing"
  | "otherwise-missing"
  | "no-outcome"
  | "nothing-and-others"
  | "no-meaning";

/**
 * Which node kind's outcome list applies to the command currently being
 * checked (spec data `outcomeKind`, result of spec calculation
 * `outcomeKind`); values identical to the specification's. Also the `kind`
 * passed to `LeafRules.isOutcome`.
 */
export type OutcomeKind = "case" | "command";

/**
 * Spec input `states` of `Begin`; values identical to the specification's.
 *   `"given"`     the specification lists states.
 *   `"missing"`   it lists none, but its first layer mentions states.
 *   `"stateless"` it lists none on purpose.
 */
export type StatesPresence = "given" | "missing" | "stateless";

/** Name of a vocabulary group (spec input `group` of `ProseGroup`); values identical to the specification's. */
export type ProseGroupName = "states" | "data" | "queries" | "effects" | "calculations" | "commands";

/** Input of `Begin`: facts about the whole specification. Field names identical to the specification's. */
export interface LeafCheckStart {
  /** Whether and how the specification lists states. */
  states: StatesPresence;
  /** `true` if the specification names an initial state. */
  init: boolean;
  /** How many commands the specification lists (whole number, 0 or more). */
  commands: number;
}

/**
 * Dependency: the rules of the specification format, asked at the moment an
 * answer is needed; answers are never cached. Each method may throw instead
 * of answering (no command of this component specifies a failure case).
 */
export interface LeafRules {
  /**
   * Spec query `required`: `true` if nodes of kind `kind` (for example
   * `"service"`, `"datum"`, `"query"`, `"calculation"`) must carry a field
   * named `field`. Asked by `begin` (kind `"service"`, about the fields
   * `"init"` and `"commands"`) and by `entryField` (about the field and kind
   * given there).
   */
  isRequired(kind: string, field: string): boolean;
  /**
   * Spec query `outcome`: `true` if `field` counts as an outcome field for
   * nodes of kind `kind` (an `OutcomeKind`). Asked by `beginCase` (about
   * `"nothing"`) and by `written` (about the field given there), with the
   * remembered `outcomeKind`.
   */
  isOutcome(kind: string, field: string): boolean;
  /**
   * Spec query `nonEmpty`: `true` if the vocabulary group `group` is
   * expected to have entries in the end. Asked by `proseGroup`.
   */
  mustHaveEntries(group: string): boolean;
  /**
   * Spec query `requiredCase`: `true` if the case named `name` is mandatory
   * for commands with cases. Asked by `beginCommand` (about `"otherwise"`).
   */
  isRequiredCase(name: string): boolean;
}

/** Dependency: told what the check finds (spec effect `Report`). */
export interface LeafCheckListener {
  /**
   * Spec effect `Report`: one finding, with its code, about the piece of
   * the specification passed in the command just performed. A single
   * command may report several findings, told in the order the
   * specification lists them.
   */
  report(code: LeafFindingCode): void;
}

/**
 * What the check remembers between commands (spec `model.data`; field
 * names identical to the specification's). Set by `beginCommand`,
 * `beginCase` and `written`; read by `endCase` and `written`.
 */
export interface LeafCheckProgress {
  /** Set by `beginCommand`: result of the `branched` calculation for the current command. */
  branched: boolean;
  /** Set by `beginCommand`: outcome kind used for `LeafRules.isOutcome` in the current command. */
  outcomeKind: OutcomeKind;
  /** Set by `beginCase`: the `described` flag passed for the current case. */
  caseDescribed: boolean;
  /** Set by `beginCase` / `written`: tracks the field `"nothing"` in the current case. */
  nothingWritten: boolean;
  /** Set by `beginCase` / `written`: tracks fields not named `"nothing"` in the current case. */
  otherWritten: boolean;
  /** Set by `beginCase` / `written`: tracks fields for which `LeafRules.isOutcome` answered `true` in the current case. */
  outcomeWritten: boolean;
}

/**
 * Checks one merged specification. Each method performs one specification
 * command; all can be called at any time. Commands about a command's cases
 * come in the order `beginCommand`, then per case `beginCase`, one `written`
 * per further field written in the case, and `endCase`.
 */
export class LeafCheck {
  private readonly rules: LeafRules;
  private readonly listener: LeafCheckListener;
  private readonly state: LeafCheckProgress = {
    branched: false,
    outcomeKind: "command",
    caseDescribed: false,
    nothingWritten: false,
    otherWritten: false,
    outcomeWritten: false,
  };

  /**
   * @param rules answers the questions about the specification format.
   * @param listener receives the findings.
   */
  constructor(rules: LeafRules, listener: LeafCheckListener) {
    this.rules = rules;
    this.listener = listener;
  }

  /**
   * What the check currently remembers (spec data). Before any command it
   * holds the specification's initial values.
   */
  get progress(): LeafCheckProgress {
    return { ...this.state };
  }

  /**
   * Spec command `Begin`, with its input fields `states`, `init` and
   * `commands`. May ask `LeafRules.isRequired` and may report
   * `"states-missing"`, `"init-missing"` and `"commands-missing"` (more than
   * one possible).
   */
  begin(start: LeafCheckStart): void {
    if (start.states === "missing") this.listener.report("states-missing");
    if (start.states !== "stateless" && !start.init && this.rules.isRequired("service", "init")) {
      this.listener.report("init-missing");
    }
    if (start.commands === 0 && this.rules.isRequired("service", "commands")) {
      this.listener.report("commands-missing");
    }
  }

  /**
   * Spec command `ProseGroup`: input `group`, and `entries`, the entry
   * count of that group (0 or more). May ask `LeafRules.mustHaveEntries`
   * and may report `"prose-empty"`.
   */
  proseGroup(group: ProseGroupName, entries: number): void {
    if (group === "states" || group === "commands") return;
    if (entries === 0 && this.rules.mustHaveEntries(group)) this.listener.report("prose-empty");
  }

  /**
   * Spec command `EntryField`: field name `field` of a vocabulary entry of
   * kind `kind`, and `present`, `true` if that entry has the field. May ask
   * `LeafRules.isRequired` and may report `"field-missing"`.
   */
  entryField(field: string, kind: string, present: boolean): void {
    if (!present && this.rules.isRequired(kind, field)) this.listener.report("field-missing");
  }

  /**
   * Spec command `BeginCommand`: starts checking a command, given its case
   * count `cases` (0 or more) and `hasOtherwise`, `true` if one of those
   * cases is named otherwise. Remembers `branched` and `outcomeKind`. May
   * ask `LeafRules.isRequiredCase` and may report `"otherwise-missing"`.
   */
  beginCommand(cases: number, hasOtherwise: boolean): void {
    const branched = isBranched(cases, hasOtherwise);
    if (branched && !hasOtherwise && this.rules.isRequiredCase("otherwise")) {
      this.listener.report("otherwise-missing");
    }
    this.state.branched = branched;
    this.state.outcomeKind = outcomeKindOf(branched);
  }

  /**
   * Spec command `BeginCase`: starts checking one case of the current
   * command (or the command itself if it has no cases). `described` and
   * `nothing` are the spec inputs of the same names; `nothing` is `true` if
   * the case has the field `nothing`. Resets the remembered case data; may
   * ask `LeafRules.isOutcome`. Reports nothing.
   */
  beginCase(described: boolean, nothing: boolean): void {
    this.state.caseDescribed = described;
    this.state.nothingWritten = nothing;
    this.state.otherWritten = false;
    this.state.outcomeWritten = nothing && this.rules.isOutcome(this.state.outcomeKind, NOTHING);
  }

  /**
   * Spec command `Written`: one more field of the current case, by name
   * (`"nothing"` or any other name, `""` included). Updates the remembered
   * case data; may ask `LeafRules.isOutcome`. Reports nothing.
   */
  written(field: string): void {
    const isNothing = field === NOTHING;
    this.state.nothingWritten = this.state.nothingWritten || isNothing;
    this.state.otherWritten = this.state.otherWritten || !isNothing;
    this.state.outcomeWritten =
      this.state.outcomeWritten || this.rules.isOutcome(this.state.outcomeKind, field);
  }

  /**
   * Spec command `EndCase`: closes the current case. May report
   * `"no-outcome"` and `"nothing-and-others"` (both possible).
   */
  endCase(): void {
    for (const code of caseFindings(this.state)) this.listener.report(code);
  }

  /**
   * Spec command `Calculation`: one calculation entry, with `hasMeaning`
   * as given in the spec input. May report `"no-meaning"`.
   */
  calculation(hasMeaning: boolean): void {
    if (!hasMeaning) this.listener.report("no-meaning");
  }

  /**
   * Spec command `Invariant`: one invariant entry, with `hasMeaning` as
   * given in the spec input. May report `"no-meaning"`.
   */
  invariant(hasMeaning: boolean): void {
    if (!hasMeaning) this.listener.report("no-meaning");
  }

  /**
   * Spec command `Sentence`: one condition sentence, with the spec inputs
   * `composite` (`true` if it is built from other sentences) and
   * `hasMeaning`. May report `"no-meaning"`.
   */
  sentence(composite: boolean, hasMeaning: boolean): void {
    if (!composite && !hasMeaning) this.listener.report("no-meaning");
  }
}

/** Name of the field that says a case does nothing. */
const NOTHING = "nothing";

/** Pure calculation `branched`, from the inputs of `beginCommand`. */
export function isBranched(cases: number, hasOtherwise: boolean): boolean {
  return cases > (hasOtherwise ? 1 : 0);
}

/** Pure calculation `outcomeKind`, from the result of `isBranched`. */
export function outcomeKindOf(branched: boolean): OutcomeKind {
  return branched ? "case" : "command";
}

/**
 * Pure decision for `endCase`: the findings to report about a case, in
 * reporting order, from what is remembered about it. Empty when none.
 */
export function caseFindings(progress: LeafCheckProgress): LeafFindingCode[] {
  const findings: LeafFindingCode[] = [];
  if (progress.caseDescribed && !progress.outcomeWritten) findings.push("no-outcome");
  if (progress.nothingWritten && progress.otherWritten) findings.push("nothing-and-others");
  return findings;
}
