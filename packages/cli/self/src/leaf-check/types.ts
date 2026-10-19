/**
 * Vocabulary of the leaf check: what it is given, the findings it emits, and the dependencies it is given.
 *
 * The check has no states of its own: it is always in the specification's single state `READY`.
 */

/**
 * Classification of a finding. Corresponds to the `code` of the specification's `Report` effect, with the
 * same spellings.
 */
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
 * One finding emitted by the check: what was just given is left unwritten, for this reason. Corresponds to
 * the payload of the specification's `Report` effect, member for member (`code`).
 */
export interface LeafFinding {
  readonly code: LeafFindingCode;
}

/**
 * Whose outcomes count in the command being judged. Corresponds to the specification's `data.outcomeKind`
 * (and the calculation `outcomeKind`), with the same spellings: `"case"` or `"command"`. It is also the
 * `kind` the grammar's `isOutcome` is asked with.
 */
export type OutcomeKind = "case" | "command";

/**
 * How the merged specification stands with respect to states. Corresponds to the `states` input of the
 * specification's `Begin` command, with the same spellings:
 *
 * - `"given"`: the specification has states
 * - `"missing"`: it has none, although Layer 1 speaks of states
 * - `"stateless"`: it is a specification without states
 */
export type StatesPresence = "given" | "missing" | "stateless";

/**
 * The merged specification as a whole. Corresponds to the input of the specification's `Begin` command,
 * member for member.
 */
export interface SpecificationOutline {
  /** Number of commands the specification has (0 to 1000). */
  readonly commands: number;
  /** Whether the specification has an initial state. */
  readonly init: boolean;
  /** How the specification stands with respect to states. */
  readonly states: StatesPresence;
}

/**
 * A command about to be judged. Corresponds to the input of the specification's `BeginCommand` command,
 * member for member.
 */
export interface CommandOutline {
  /** Number of cases the command has (0 to 1000). */
  readonly cases: number;
  /** Whether `otherwise` is one of its cases. */
  readonly hasOtherwise: boolean;
}

/**
 * A field of an entry of the vocabulary. Corresponds to the input of the specification's `EntryField`
 * command, member for member.
 */
export interface EntryFieldInfo {
  /** The field's name. */
  readonly field: string;
  /** The kind of the entry the field belongs to (`service`, `datum`, `query`, `calculation`, ...). */
  readonly kind: string;
  /** Whether the field is written. */
  readonly present: boolean;
}

/**
 * A group of the vocabulary. Corresponds to the `group` input of the specification's `ProseGroup` command,
 * with the same spellings.
 */
export type VocabularyGroup = "states" | "data" | "queries" | "effects" | "calculations" | "commands";

/**
 * A group Layer 1 gave only as prose. Corresponds to the input of the specification's `ProseGroup` command,
 * member for member.
 */
export interface ProseGroupInfo {
  /** Number of entries the group ended up with (0 to 1000). */
  readonly entries: number;
  /** Which group it is. */
  readonly group: VocabularyGroup;
}

/**
 * A condition sentence the specification uses. Corresponds to the input of the specification's `Sentence`
 * command, member for member.
 */
export interface SentenceInfo {
  /** Whether the sentence is a combination of other sentences. */
  readonly composite: boolean;
  /** Whether the sentence has a meaning. */
  readonly hasMeaning: boolean;
}

/**
 * Dependency: the grammar the specification is checked against. The check consults it each time it needs an
 * answer and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface LeafGrammar {
  /**
   * Whether a field is required on a node of a kind. Corresponds to the query `required` with input
   * `{ field, kind }`; returns its boolean answer unchanged.
   *
   * Asked during `Begin` with kind `"service"` and field `"init"` (the specification's `initRequired`) and
   * with kind `"service"` and field `"commands"` (`commandsRequired`); asked during `EntryField` with the
   * command's `kind` and `field` (`fieldRequired`).
   */
  isRequired(kind: string, field: string): boolean;

  /**
   * Whether a field is one of the outcomes of a node of a kind. Corresponds to the query `outcome` with input
   * `{ field, kind }`; returns its boolean answer unchanged.
   *
   * Asked during `Written` with the remembered `outcomeKind` and the command's `field` (the specification's
   * `isOutcome`).
   */
  isOutcome(kind: OutcomeKind, field: string): boolean;

  /**
   * Whether a command that has cases must have the case with a name. Corresponds to the query `requiredCase`
   * with input `{ name }`; returns its boolean answer unchanged.
   *
   * Asked during `BeginCommand` with the name `"otherwise"` (the specification's `otherwiseRequired`).
   */
  requiresCase(name: string): boolean;

  /**
   * Whether a group given only as prose in Layer 1 must end up with entries. Corresponds to the query
   * `nonEmpty` with input `{ group }`; returns its boolean answer unchanged.
   *
   * Asked during `ProseGroup` with the command's `group` (the specification's `mustHaveEntries`).
   */
  mustHaveEntries(group: VocabularyGroup): boolean;
}

/** Dependency: the receiver of the findings the check emits. */
export interface LeafFindingSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted finding, in the order
   * the findings are emitted. Corresponds to the specification's `Report` effect; the argument is its payload.
   */
  report(finding: LeafFinding): void;
}
