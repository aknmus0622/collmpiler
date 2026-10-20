/**
 * Vocabulary of the overlay check: the facts it is given about an interpretation laid over Layer 1, the
 * problems it emits, and the dependency it reports them to.
 *
 * The check has no states of its own: it is always in the specification's single state `READY`, and it
 * remembers nothing between facts.
 */

/**
 * Classification of a problem. Corresponds to the `code` of the specification's `Problem` effect, with the
 * same spellings.
 */
export type OverlayProblemCode =
  | "unknown-key"
  | "conflict"
  | "undescribed"
  | "closed"
  | "flat-in-cases"
  | "layer1-outside-cases"
  | "branch-over-goto"
  | "one-query"
  | "no-part"
  | "key-missing"
  | "key-extra"
  | "stale";

/**
 * One problem emitted by the check. Corresponds to the payload of the specification's `Problem` effect,
 * member for member (`code`).
 */
export interface OverlayProblem {
  readonly code: OverlayProblemCode;
}

/**
 * How a command branches into cases. Corresponds to the input of the specification's `Branching` command,
 * member for member.
 */
export interface BranchingFact {
  /** Whether an outcome is written outside the cases. */
  readonly flat: boolean;
  /** Whether the interpretation wrote the cases. */
  readonly interpretationCases: boolean;
  /** Whether Layer 1 wrote the cases. */
  readonly layer1Cases: boolean;
  /** Whether Layer 1 wrote a goTo. */
  readonly layer1GoTo: boolean;
  /** Whether Layer 1 wrote a goTo, does or responds outside the cases. */
  readonly layer1Outcome: boolean;
}

/**
 * A command's call of a contained component. Corresponds to the input of the specification's `Call` command,
 * member for member.
 */
export interface CallFact {
  /** Whether the contained component named by the call exists. */
  readonly exists: boolean;
  /** Whether a key was written in the call. */
  readonly keyGiven: boolean;
  /** Whether the contained component is one of many (keyed) rather than a single component. */
  readonly keyedPart: boolean;
}

/**
 * An entry the interpretation wrote into a group (a datum, a command, a case, ...). Corresponds to the input
 * of the specification's `Entry` command, member for member.
 */
export interface EntryFact {
  /** Whether the group is closed to new entries. */
  readonly closed: boolean;
  /** Whether Layer 1 has this entry. */
  readonly inLayer1: boolean;
  /** Whether Layer 1 lists the group's entries. */
  readonly listed: boolean;
}

/**
 * One place, and who wrote it. Corresponds to the input of the specification's `Slot` command, member for
 * member.
 */
export interface SlotFact {
  /** Whether the interpretation wrote the place. */
  readonly interpretation: boolean;
  /** Whether the place is one that can be written. */
  readonly known: boolean;
  /** Whether Layer 1 wrote the place. */
  readonly layer1: boolean;
}

/**
 * The hashes of Layer 1. Corresponds to the input of the specification's `Stamp` command, member for member.
 */
export interface StampFact {
  /** The hash of Layer 1 now (for example `"sha256:a"`). */
  readonly current: string;
  /** The hash of Layer 1 recorded in the interpretation, or `null` when none was recorded. */
  readonly recorded: string | null;
}

/** Dependency: the receiver of the problems the check emits. */
export interface OverlayProblemSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted problem, in the order the
   * problems are emitted. Corresponds to the specification's `Problem` effect; the argument is its payload.
   */
  problem(problem: OverlayProblem): void;
}
