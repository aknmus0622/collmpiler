/**
 * Tree check over a specification: checks, one parent at a time, whether the
 * children of the specification's nodes fit the grammar.
 *
 * Corresponds to the specification component "tree-check". One `TreeCheck`
 * object checks one specification. It has no states of its own (it is always
 * in the specification's single state `READY`). It is driven from outside:
 * whoever walks the specification tells it, for each parent, that its
 * children begin (`beginParent`), then each child (`child` for a node,
 * `stray` for anything else), then that they end (`endParent`). It tells its
 * `TreeCheckListener` what does not fit and which children to look inside.
 *
 * Command -> method:
 *   `BeginParent` -> `beginParent`
 *   `Child`       -> `child`
 *   `EndParent`   -> `endParent`
 *   `Stray`       -> `stray`
 *
 * Effect -> listener method:
 *   `Report`  -> `TreeCheckListener.report`
 *   `Descend` -> `TreeCheckListener.descend`
 *
 * Query -> dependency method:
 *   `allowed`    -> `TreeGrammar.mayContain`
 *   `limit`      -> `TreeGrammar.limitOf`
 *   `stateNamed` -> `ParentStates.hasStateNamed`
 */

/** Reason a child does not fit (spec field `code` of the `Report` effect); values identical to the specification's. */
export type TreeFindingCode =
  | "unknown-field"
  | "unknown"
  | "misplaced"
  | "too-many"
  | "duplicate"
  | "unknown-state";

/**
 * What a stray child is (spec input `form` of `Stray`); values identical to
 * the specification's.
 *   `"bad-field"` a field the parent's kind does not have.
 *   `"unknown"`   something that is not a node at all.
 */
export type StrayForm = "bad-field" | "unknown";

/** Input of `child`: one child of the current parent that is a node. Field names identical to the specification's. */
export interface TreeChild {
  /** Position of the child among the parent's children (whole number, 0 or more). */
  index: number;
  /** The slot the child occupies under its parent. */
  slot: string;
  /** `true` if the child has a name. */
  named: boolean;
  /** The child's identity (its kind and name, as one string); compared with the identities remembered so far. */
  identity: string;
}

/** Input of `endParent`: facts about the parent whose children have all been given. Field names identical to the specification's. */
export interface TreeParentEnd {
  /** `true` if the parent is a component. */
  isComponent: boolean;
  /** `true` if the parent names an initial state. */
  hasInit: boolean;
  /** Name of the initial state (meaningful only when `hasInit`). */
  init: string;
  /** Position of the initial state among the parent's children; the index reported with `"unknown-state"`. */
  initIndex: number;
  /** How many states the parent has (whole number, 0 or more). */
  stateCount: number;
}

/**
 * Dependency: the grammar of the specification format, asked at the moment
 * an answer is needed; answers are never cached.
 */
export interface TreeGrammar {
  /**
   * Spec query `allowed`: `true` if a child in slot `slot` may be under a
   * parent of kind `parentKind`. Asked by `child`, with the remembered
   * parent kind and the child's slot.
   */
  mayContain(parentKind: string, slot: string): boolean;
  /**
   * Spec query `limit`: how many children in slot `slot` a parent of kind
   * `parentKind` may have; 0 means there is no limit. Asked by `child`, with
   * the remembered parent kind and the child's slot.
   */
  limitOf(parentKind: string, slot: string): number;
}

/** Dependency: looks up the states of the parent currently being checked. */
export interface ParentStates {
  /**
   * Spec query `stateNamed`: `true` if the current parent has a state child
   * named `name`. Asked by `endParent`, with the initial state's name.
   */
  hasStateNamed(name: string): boolean;
}

/** Dependency: told what the check finds and what to check next. */
export interface TreeCheckListener {
  /**
   * Spec effect `Report`: the child at position `index` (among the current
   * parent's children) does not fit, for reason `code`. One command may
   * report several times; they are told in the specification's order.
   */
  report(index: number, code: TreeFindingCode): void;
  /**
   * Spec effect `Descend`: look inside the child at position `index`; its
   * own children are checked next. Told after any `report` about that same
   * child in the same command.
   */
  descend(index: number): void;
}

/**
 * What the check remembers between commands (spec `model.data`; field names
 * identical to the specification's). Set by `beginParent` and `child`.
 */
export interface TreeCheckProgress {
  /** Spec data `parent`: kind of the current parent; `null` before any `beginParent`. */
  parent: string | null;
  /** Spec data `names`: identities of the children given so far that fit and have a name. Starts empty. */
  names: string[];
  /** Spec data `slots`: slots of the children given so far that fit, in order, one entry per child. Starts empty. */
  slots: string[];
}

/** What `child` does about one child: the outcome chosen by `judgeChild`. */
export interface ChildVerdict {
  /** Findings to report about the child, in reporting order (possibly empty). */
  reports: TreeFindingCode[];
  /** `true` if the child is looked inside (`Descend`), after the reports. */
  descend: boolean;
  /** `true` if the child is remembered (spec data `names` and `slots` updated). */
  remember: boolean;
}

/**
 * Checks one specification. Each method performs one specification command.
 * `child` and `endParent` are called only after a `beginParent`.
 */
export class TreeCheck {
  private readonly grammar: TreeGrammar;
  private readonly states: ParentStates;
  private readonly listener: TreeCheckListener;
  private parent: string | null = null;
  private names: string[] = [];
  private slots: string[] = [];

  /**
   * @param grammar answers which slots a parent kind may contain and how many.
   * @param states answers whether the current parent has a state of a given name.
   * @param listener receives the findings and the children to look inside.
   */
  constructor(grammar: TreeGrammar, states: ParentStates, listener: TreeCheckListener) {
    this.grammar = grammar;
    this.states = states;
    this.listener = listener;
  }

  /**
   * What the check currently remembers (spec data). Before any command it
   * holds the specification's initial values.
   */
  get progress(): TreeCheckProgress {
    return { parent: this.parent, names: [...this.names], slots: [...this.slots] };
  }

  /**
   * Spec command `BeginParent`: the children of a parent of kind `kind` are
   * given next. Remembers the kind and forgets the children of any previous
   * parent. Reports nothing.
   */
  beginParent(kind: string): void {
    this.parent = kind;
    this.names = [];
    this.slots = [];
  }

  /**
   * Spec command `Child`: one child of the current parent that is a node.
   * Asks `TreeGrammar.mayContain` and `TreeGrammar.limitOf` (as needed); may
   * report `"misplaced"`, `"too-many"` and `"duplicate"` (more than one
   * possible) and may tell `descend`. May update the remembered names and
   * slots.
   */
  child(child: TreeChild): void {
    const parentKind = this.parent ?? "";
    const allowed = this.grammar.mayContain(parentKind, child.slot);
    const limit = allowed ? this.grammar.limitOf(parentKind, child.slot) : 0;
    const verdict = judgeChild(this.progress, child, allowed, limit);
    for (const code of verdict.reports) this.listener.report(child.index, code);
    if (verdict.descend) this.listener.descend(child.index);
    if (verdict.remember) {
      this.names = namesWithChild(this.names, child);
      this.slots = slotsWithChild(this.slots, child);
    }
  }

  /**
   * Spec command `EndParent`: all the children of the current parent have
   * been given (and looked inside). May ask `ParentStates.hasStateNamed` and
   * may report `"unknown-state"` at `end.initIndex`.
   */
  endParent(end: TreeParentEnd): void {
    const findings = endParentFindings(end, (name) => this.states.hasStateNamed(name));
    for (const code of findings) this.listener.report(end.initIndex, code);
  }

  /**
   * Spec command `Stray`: one child at position `index` that is not a node of
   * the grammar, of form `form`. Reports `"unknown-field"` or `"unknown"`;
   * never descends and remembers nothing.
   */
  stray(index: number, form: StrayForm): void {
    this.listener.report(index, strayFinding(form));
  }
}

/**
 * Pure decision for `child`: what to do about one child, from what is
 * remembered, the child, and the grammar's answers about its slot (`allowed`
 * from `TreeGrammar.mayContain`, `limit` from `TreeGrammar.limitOf`).
 */
export function judgeChild(
  progress: TreeCheckProgress,
  child: TreeChild,
  allowed: boolean,
  limit: number,
): ChildVerdict {
  if (!allowed) return { reports: ["misplaced"], descend: false, remember: false };
  const reports: TreeFindingCode[] = [];
  const countInSlot = progress.slots.filter((slot) => slot === child.slot).length + 1;
  if (limit > 0 && countInSlot === limit + 1) reports.push("too-many");
  if (child.named && progress.names.includes(child.identity)) reports.push("duplicate");
  return { reports, descend: true, remember: true };
}

/**
 * Pure decision for `endParent`: the findings about the parent (empty or
 * `"unknown-state"`). `hasStateNamed` is consulted only when its answer is
 * needed.
 */
export function endParentFindings(
  end: TreeParentEnd,
  hasStateNamed: (name: string) => boolean,
): TreeFindingCode[] {
  if (end.isComponent && end.hasInit && end.stateCount > 0 && !hasStateNamed(end.init)) {
    return ["unknown-state"];
  }
  return [];
}

/** Pure decision for `stray`: the finding for a stray child of this form. */
export function strayFinding(form: StrayForm): TreeFindingCode {
  return form === "bad-field" ? "unknown-field" : "unknown";
}

/** Pure calculation `namesWithChild`: the remembered identities after a remembered child. */
export function namesWithChild(names: readonly string[], child: TreeChild): string[] {
  return child.named ? [...names, child.identity] : [...names];
}

/** Pure calculation `slotsWithChild`: the remembered slots after a remembered child. */
export function slotsWithChild(slots: readonly string[], child: TreeChild): string[] {
  return [...slots, child.slot];
}
