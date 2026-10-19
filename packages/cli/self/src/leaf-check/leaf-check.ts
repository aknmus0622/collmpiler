import {
  beginFindings,
  branched,
  endCaseFindings,
  entryFieldMissing,
  lacksMeaning,
  otherwiseMissing,
  outcomeKind,
  progressAfterWritten,
  proseGroupEmpty,
  sentenceLacksMeaning,
} from "./rules.ts";
import type { CaseProgress } from "./rules.ts";
import type {
  CommandOutline,
  EntryFieldInfo,
  LeafFindingCode,
  LeafFindingSink,
  LeafGrammar,
  OutcomeKind,
  ProseGroupInfo,
  SentenceInfo,
  SpecificationOutline,
} from "./types.ts";

/**
 * The leaf check component: checks that every path of a merged specification ends in a leaf, and reports
 * what is left unwritten.
 *
 * It is driven from outside. `begin` is given the specification as a whole. Each command is judged with
 * `beginCommand`, then for each of its cases `beginCase`, `written` once per field written in the case, and
 * `endCase`. `entryField`, `proseGroup`, `calculation`, `invariant` and `sentence` judge single items and may
 * be called at any time.
 *
 * One instance is one check. The check has a single state (the specification's `READY`), so it exposes no
 * state. A new instance remembers nothing: every data getter is `undefined` until a command stores it. Each
 * method below performs one command of the specification; a command returns nothing, and its outcome is
 * observed through the data getters and the findings reported to the sink.
 */
export class LeafCheck {
  private readonly grammar: LeafGrammar;
  private readonly findings: LeafFindingSink;
  private commandBranched: boolean | undefined = undefined;
  private commandOutcomeKind: OutcomeKind | undefined = undefined;
  private progress: CaseProgress | undefined = undefined;

  /**
   * @param grammar answers the queries `required`, `outcome`, `requiredCase` and `nonEmpty`
   * @param findings receives the effect `Report`
   */
  constructor(grammar: LeafGrammar, findings: LeafFindingSink) {
    this.grammar = grammar;
    this.findings = findings;
  }

  /** The specification's `data.branched`: whether the command being judged has branched; `undefined` until stored. */
  get branched(): boolean | undefined {
    return this.commandBranched;
  }

  /** The specification's `data.outcomeKind`: whose outcomes count in the command being judged; `undefined` until stored. */
  get outcomeKind(): OutcomeKind | undefined {
    return this.commandOutcomeKind;
  }

  /** The specification's `data.caseDescribed`: whether prose says something happens in the case being judged; `undefined` until stored. */
  get caseDescribed(): boolean | undefined {
    return this.progress?.caseDescribed;
  }

  /** The specification's `data.nothingWritten`: whether `nothing` has been written in the case being judged; `undefined` until stored. */
  get nothingWritten(): boolean | undefined {
    return this.progress?.nothingWritten;
  }

  /** The specification's `data.otherWritten`: whether a field other than `nothing` has been written in the case being judged; `undefined` until stored. */
  get otherWritten(): boolean | undefined {
    return this.progress?.otherWritten;
  }

  /** The specification's `data.outcomeWritten`: whether an outcome field has been written in the case being judged; `undefined` until stored. */
  get outcomeWritten(): boolean | undefined {
    return this.progress?.outcomeWritten;
  }

  /**
   * Performs the command `Begin`: the merged specification as a whole. May ask the grammar `isRequired` with
   * kind `"service"` and field `"init"` or `"commands"`; may tell the sink `report` once or more.
   *
   * @param outline the command's input, field for field (`commands`, `init`, `states`)
   */
  begin(outline: SpecificationOutline): void {
    const initRequired = this.grammar.isRequired("service", "init");
    const commandsRequired = this.grammar.isRequired("service", "commands");
    this.reportAll(beginFindings(outline, initRequired, commandsRequired));
  }

  /**
   * Performs the command `BeginCommand`: a command about to be judged, before its cases. May ask the grammar
   * `requiresCase("otherwise")`; may tell the sink `report`. Stores `branched` and `outcomeKind`.
   *
   * @param command the command's input, field for field (`cases`, `hasOtherwise`)
   */
  beginCommand(command: CommandOutline): void {
    if (otherwiseMissing(command, this.grammar.requiresCase("otherwise"))) {
      this.findings.report({ code: "otherwise-missing" });
    }
    this.commandBranched = branched(command);
    this.commandOutcomeKind = outcomeKind(command);
  }

  /**
   * Performs the command `BeginCase`: one case of the current command (the whole command when it has not
   * branched) is judged next. Executable after `beginCommand`. Stores `caseDescribed` and resets the
   * written-field flags.
   *
   * @param described the command's `described` input: whether prose says something happens in the case
   */
  beginCase(described: boolean): void {
    this.progress = { caseDescribed: described, nothingWritten: false, otherWritten: false, outcomeWritten: false };
  }

  /**
   * Performs the command `Written`: one field written in the current case. Executable after `beginCase`. May
   * ask the grammar `isOutcome` with the remembered `outcomeKind` and `field`. Updates the written-field flags.
   *
   * @param field the command's `field` input: the name of the written field (any string, the empty one included)
   */
  written(field: string): void {
    const progress = this.caseProgress();
    // A case always follows the BeginCommand of its command, which stored outcomeKind.
    const isOutcome = this.grammar.isOutcome(this.commandOutcomeKind!, field);
    this.progress = progressAfterWritten(progress, field, isOutcome);
  }

  /**
   * Performs the command `EndCase`: all the fields of the current case have been given. Executable after
   * `beginCase`. May tell the sink `report` once or more.
   */
  endCase(): void {
    this.reportAll(endCaseFindings(this.caseProgress()));
  }

  /**
   * Performs the command `EntryField`: a field of an entry of the vocabulary. May ask the grammar `isRequired`
   * with `entry.kind` and `entry.field`; may tell the sink `report`.
   *
   * @param entry the command's input, field for field (`field`, `kind`, `present`)
   */
  entryField(entry: EntryFieldInfo): void {
    if (entryFieldMissing(entry, this.grammar.isRequired(entry.kind, entry.field))) {
      this.findings.report({ code: "field-missing" });
    }
  }

  /**
   * Performs the command `ProseGroup`: a group Layer 1 gave only as prose, with the number of entries it ended
   * up with. May ask the grammar `mustHaveEntries` with `group.group`; may tell the sink `report`.
   *
   * @param group the command's input, field for field (`entries`, `group`)
   */
  proseGroup(group: ProseGroupInfo): void {
    if (proseGroupEmpty(group, this.grammar.mustHaveEntries(group.group))) {
      this.findings.report({ code: "prose-empty" });
    }
  }

  /**
   * Performs the command `Calculation`: a calculation of the specification. May tell the sink `report`.
   *
   * @param hasMeaning the command's `hasMeaning` input: whether the calculation has a meaning
   */
  calculation(hasMeaning: boolean): void {
    if (lacksMeaning(hasMeaning)) {
      this.findings.report({ code: "no-meaning" });
    }
  }

  /**
   * Performs the command `Invariant`: an invariant of the specification. May tell the sink `report`.
   *
   * @param hasMeaning the command's `hasMeaning` input: whether the invariant has a meaning
   */
  invariant(hasMeaning: boolean): void {
    if (lacksMeaning(hasMeaning)) {
      this.findings.report({ code: "no-meaning" });
    }
  }

  /**
   * Performs the command `Sentence`: a condition sentence the specification uses. May tell the sink `report`.
   *
   * @param sentence the command's input, field for field (`composite`, `hasMeaning`)
   */
  sentence(sentence: SentenceInfo): void {
    if (sentenceLacksMeaning(sentence)) {
      this.findings.report({ code: "no-meaning" });
    }
  }

  /** The progress of the current case; a case is always begun before it is written to or ended. */
  private caseProgress(): CaseProgress {
    if (this.progress === undefined) {
      throw new Error("no case has been begun");
    }
    return this.progress;
  }

  private reportAll(codes: readonly LeafFindingCode[]): void {
    for (const code of codes) {
      this.findings.report({ code });
    }
  }
}
