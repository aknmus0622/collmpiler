/**
 * Vocabulary of the tree check: the children it is given, the findings it emits, and the dependencies it is
 * given.
 *
 * The check has no states of its own: it is always in the specification's single state `READY`.
 */

/**
 * What a child that is not a grammar node is. Corresponds to the `form` input of the specification's `Stray`
 * command, with the same spellings:
 *
 * - `"bad-field"`: the child is a field that is not among those of the parent's kind
 * - `"unknown"`: the child is not recognised as a node at all
 */
export type TreeStrayForm = "bad-field" | "unknown";

/**
 * Classification of a finding. Corresponds to the `code` of the specification's `Report` effect, with the
 * same spellings.
 */
export type TreeFindingCode =
  | "unknown-field"
  | "unknown"
  | "misplaced"
  | "too-many"
  | "duplicate"
  | "unknown-state";

/**
 * One finding emitted by the check. Corresponds to the payload of the specification's `Report` effect,
 * member for member (`code`, `index`).
 */
export interface TreeFinding {
  readonly code: TreeFindingCode;
  /** Position of the child the finding is about, among the parent's children (0 to 1000). */
  readonly index: number;
}

/**
 * One child of the parent being checked that is a grammar node. Corresponds to the input of the
 * specification's `Child` command, member for member.
 */
export interface TreeChild {
  /** Position of the child among the parent's children (0 to 1000). */
  readonly index: number;
  /**
   * The child's identity (its kind and name, as one string, as given by the caller); the value stored in, and
   * compared against, the specification's `data.names`. Meaningful only when `named` is `true`.
   */
  readonly identity: string;
  /** Whether the child carries a name. */
  readonly named: boolean;
  /** The slot of the parent the child is given in. */
  readonly slot: string;
}

/**
 * One child of the parent being checked that is not a grammar node. Corresponds to the input of the
 * specification's `Stray` command, member for member.
 */
export interface TreeStray {
  readonly form: TreeStrayForm;
  /** Position of the child among the parent's children (0 to 1000). */
  readonly index: number;
}

/**
 * Description of the parent whose children have all been given. Corresponds to the input of the
 * specification's `EndParent` command, member for member.
 */
export interface ParentEnd {
  /** Whether the parent is a component. */
  readonly isComponent: boolean;
  /** Whether the parent declares an initial state. */
  readonly hasInit: boolean;
  /** The name of the parent's initial state; meaningful only when `hasInit` is `true`. */
  readonly init: string;
  /** Position of the initial state among the parent's children (0 to 1000); the index of any finding about it. */
  readonly initIndex: number;
  /** Number of states the parent declares (0 to 1000). */
  readonly stateCount: number;
}

/**
 * Dependency: the grammar the children are checked against. The check consults it each time it needs an
 * answer and keeps no copy of the answers, so they may differ from one call to the next.
 */
export interface TreeGrammar {
  /**
   * Asked during `Child` about the current parent's kind and the child's slot.
   * Corresponds to the query `allowed` with input `{ parent, slot }`; returns its boolean answer unchanged.
   */
  allowsSlot(parent: string, slot: string): boolean;

  /**
   * Asked during `Child` about the current parent's kind and the child's slot.
   * Corresponds to the query `limit` with input `{ parent, slot }`; returns its answer unchanged (0 or 1).
   */
  slotLimit(parent: string, slot: string): number;
}

/**
 * Dependency: the states of the parent being checked. Consulted each time an answer is needed, never cached.
 */
export interface ParentStates {
  /**
   * Asked during `EndParent` with the parent's initial-state name.
   * Corresponds to the query `stateNamed` with input `{ name }`; returns its boolean answer unchanged.
   */
  hasStateNamed(name: string): boolean;
}

/** Dependency: the receiver of the findings the check emits. */
export interface TreeFindingSink {
  /**
   * Called synchronously, from inside the command that emits it, once per emitted finding, in the order
   * the findings are emitted. Corresponds to the specification's `Report` effect; the argument is its payload.
   */
  report(finding: TreeFinding): void;
}

/**
 * Dependency: whoever walks the tree and feeds the children to the check. The check tells it which child to
 * enter.
 */
export interface TreeWalker {
  /**
   * Corresponds to the specification's `Descend` effect; the argument is its `index`. Called synchronously,
   * at the end of the `Child` command that emits it, after any findings about that child have been reported
   * and after the command has stored its outcome. The walker then feeds that child's own children (a nested
   * `beginParent` … `endParent` sequence).
   */
  descend(index: number): void;
}
