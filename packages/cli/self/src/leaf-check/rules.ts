import type {
  CommandOutline,
  EntryFieldInfo,
  LeafFindingCode,
  OutcomeKind,
  ProseGroupInfo,
  SentenceInfo,
  SpecificationOutline,
} from "./types.ts";

/** The name of the field that says a case does nothing. */
const NOTHING = "nothing";

/** The finding for a case where `nothing` is written together with other fields; named after that field. */
const NOTHING_AND_OTHERS = `${NOTHING}-and-others` as const;

/**
 * Pure decision: the findings of the `Begin` command, in the order they are reported.
 *
 * @param outline the input of `Begin`
 * @param initRequired the grammar's `isRequired("service", "init")` (the specification's `query:initRequired`)
 * @param commandsRequired the grammar's `isRequired("service", "commands")` (the specification's
 *   `query:commandsRequired`)
 * @returns the codes to report, possibly none, in order
 */
export function beginFindings(
  outline: SpecificationOutline,
  initRequired: boolean,
  commandsRequired: boolean,
): LeafFindingCode[] {
  const findings: LeafFindingCode[] = [];
  if (outline.states === "missing") {
    findings.push("states-missing");
  }
  if (initRequired && outline.states !== "stateless" && !outline.init) {
    findings.push("init-missing");
  }
  if (commandsRequired && outline.commands === 0) {
    findings.push("commands-missing");
  }
  return findings;
}

/**
 * Pure calculation `branched`: whether the command has branched.
 *
 * @param command the input of `BeginCommand`
 * @returns the new `data.branched`
 */
export function branched(command: CommandOutline): boolean {
  const otherwiseCases = command.hasOtherwise ? 1 : 0;
  return command.cases > otherwiseCases;
}

/**
 * Pure calculation `outcomeKind`: whose outcomes count in the command.
 *
 * @param command the input of `BeginCommand`
 * @returns the new `data.outcomeKind`
 */
export function outcomeKind(command: CommandOutline): OutcomeKind {
  return branched(command) ? "case" : "command";
}

/**
 * Pure decision: chooses the case of the `BeginCommand` command.
 *
 * @param command the input of `BeginCommand`
 * @param otherwiseRequired the grammar's `requiresCase("otherwise")` (the specification's
 *   `query:otherwiseRequired`)
 * @returns `true` for the case that reports `otherwise-missing`, `false` for `otherwise`
 */
export function otherwiseMissing(command: CommandOutline, otherwiseRequired: boolean): boolean {
  return branched(command) && !command.hasOtherwise && otherwiseRequired;
}

/**
 * What the check remembers about the case being judged. Corresponds to the specification's data fields of
 * the same names.
 */
export interface CaseProgress {
  /** The specification's `data.caseDescribed`. */
  readonly caseDescribed: boolean;
  /** The specification's `data.nothingWritten`. */
  readonly nothingWritten: boolean;
  /** The specification's `data.otherWritten`. */
  readonly otherWritten: boolean;
  /** The specification's `data.outcomeWritten`. */
  readonly outcomeWritten: boolean;
}

/**
 * Pure calculations `nothingWrittenNow`, `otherWrittenNow` and `outcomeWrittenNow`: the case progress after
 * one more field is written.
 *
 * @param progress the progress before the `Written` command
 * @param field the `field` input of `Written`
 * @param isOutcome the grammar's `isOutcome` for the remembered `outcomeKind` and `field` (the
 *   specification's `query:isOutcome`)
 * @returns the new progress (`caseDescribed` unchanged)
 */
export function progressAfterWritten(progress: CaseProgress, field: string, isOutcome: boolean): CaseProgress {
  const isNothing = field === NOTHING;
  return {
    caseDescribed: progress.caseDescribed,
    nothingWritten: progress.nothingWritten || isNothing,
    otherWritten: progress.otherWritten || !isNothing,
    outcomeWritten: progress.outcomeWritten || isOutcome,
  };
}

/**
 * Pure decision: the findings of the `EndCase` command, in the order they are reported.
 *
 * @param progress the progress of the case being ended
 * @returns the codes to report, possibly none, in order
 */
export function endCaseFindings(progress: CaseProgress): LeafFindingCode[] {
  const findings: LeafFindingCode[] = [];
  if (progress.caseDescribed && !progress.outcomeWritten) {
    findings.push("no-outcome");
  }
  if (progress.nothingWritten && progress.otherWritten) {
    findings.push(NOTHING_AND_OTHERS);
  }
  return findings;
}

/**
 * Pure decision: chooses the case of the `EntryField` command.
 *
 * @param entry the input of `EntryField`
 * @param fieldRequired the grammar's `isRequired(entry.kind, entry.field)` (the specification's
 *   `query:fieldRequired`)
 * @returns `true` for the case that reports `field-missing`, `false` for `otherwise`
 */
export function entryFieldMissing(entry: EntryFieldInfo, fieldRequired: boolean): boolean {
  return fieldRequired && !entry.present;
}

/**
 * Pure decision: chooses the case of the `ProseGroup` command.
 *
 * @param group the input of `ProseGroup`
 * @param mustHaveEntries the grammar's `mustHaveEntries(group.group)` (the specification's
 *   `query:mustHaveEntries`)
 * @returns `true` for the case that reports `prose-empty`, `false` for `otherwise`
 */
export function proseGroupEmpty(group: ProseGroupInfo, mustHaveEntries: boolean): boolean {
  // States and commands are judged by `Begin`, never here.
  const judgedElsewhere = group.group === "states" || group.group === "commands";
  return !judgedElsewhere && mustHaveEntries && group.entries === 0;
}

/**
 * Pure decision: chooses the case of the `Calculation` and `Invariant` commands.
 *
 * @param hasMeaning the command's `hasMeaning` input
 * @returns `true` for the case that reports `no-meaning`, `false` for `otherwise`
 */
export function lacksMeaning(hasMeaning: boolean): boolean {
  return !hasMeaning;
}

/**
 * Pure decision: chooses the case of the `Sentence` command.
 *
 * @param sentence the input of `Sentence`
 * @returns `true` for the case that reports `no-meaning`, `false` for `otherwise`
 */
export function sentenceLacksMeaning(sentence: SentenceInfo): boolean {
  return !sentence.composite && !sentence.hasMeaning;
}
