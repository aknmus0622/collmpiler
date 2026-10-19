import {
  findingsForFittingChild,
  initStateUnknown,
  namesWithChild,
  needsInitLookup,
  slotsWithChild,
  strayFinding,
} from "./rules.ts";
import type {
  ParentEnd,
  ParentStates,
  TreeChild,
  TreeFindingSink,
  TreeGrammar,
  TreeStray,
  TreeWalker,
} from "./types.ts";

/**
 * The tree check component. It is driven from outside, parent by parent: for each parent, `beginParent`
 * once, then `child` (for a child that is a grammar node) or `stray` (for one that is not) once per child in
 * order, then `endParent` once. Each time the walker is told `descend`,
 * the walker feeds that child's own children next.
 *
 * One instance is one check. The check has a single state (the specification's `READY`), so it exposes no
 * state. A new instance remembers no parent and empty `names` and `slots`. Each method below performs one
 * command of the specification; a command returns nothing, and its outcome is observed through the data
 * getters and the calls made on the dependencies.
 */
export class TreeCheck {
  private readonly grammar: TreeGrammar;
  private readonly states: ParentStates;
  private readonly findings: TreeFindingSink;
  private readonly walker: TreeWalker;
  private parentKind: string | undefined = undefined;
  private givenNames: readonly string[] = [];
  private givenSlots: readonly string[] = [];

  /**
   * @param grammar answers the queries `allowed` and `limit`
   * @param states answers the query `stateNamed`
   * @param findings receives the effect `Report`
   * @param walker receives the effect `Descend`
   */
  constructor(grammar: TreeGrammar, states: ParentStates, findings: TreeFindingSink, walker: TreeWalker) {
    this.grammar = grammar;
    this.states = states;
    this.findings = findings;
    this.walker = walker;
  }

  /** The specification's `data.parent`: the kind of the parent being checked; `undefined` until stored. */
  get parent(): string | undefined {
    return this.parentKind;
  }

  /** The specification's `data.names`, in order; empty on a new instance. */
  get names(): readonly string[] {
    return this.givenNames;
  }

  /** The specification's `data.slots`, in order; empty on a new instance. */
  get slots(): readonly string[] {
    return this.givenSlots;
  }

  /**
   * Performs the command `BeginParent`: announces a new parent; its children are fed through `child` next.
   *
   * @param kind the command's `kind`: the kind of the parent
   */
  beginParent(kind: string): void {
    this.parentKind = kind;
    this.givenNames = [];
    this.givenSlots = [];
  }

  /**
   * Performs the command `Child`: one child of the current parent that is a grammar node. Executable after
   * `beginParent`. May ask the grammar `allowsSlot` and `slotLimit` about the current parent and `child.slot`
   * (the specification's `slotAllowed` and `slotLimit`); may tell the sink `report` and the walker `descend`
   * with `child.index`; may update `names` and `slots`.
   *
   * @param child the command's input, field for field (`identity`, `index`, `named`, `slot`)
   */
  child(child: TreeChild): void {
    const parent = this.parentKind ?? "";
    if (!this.grammar.allowsSlot(parent, child.slot)) {
      this.findings.report({ code: "misplaced", index: child.index });
      return;
    }
    const codes = findingsForFittingChild(
      this.givenSlots,
      this.givenNames,
      () => this.grammar.slotLimit(parent, child.slot),
      child,
    );
    for (const code of codes) {
      this.findings.report({ code, index: child.index });
    }
    this.givenNames = namesWithChild(this.givenNames, child);
    this.givenSlots = slotsWithChild(this.givenSlots, child.slot);
    this.walker.descend(child.index);
  }

  /**
   * Performs the command `Stray`: one child of the current parent that is not a grammar node (a field the
   * parent's kind does not have, or something not recognised as a node). Asks no dependency; may tell the sink
   * `report` with `stray.index`.
   *
   * @param stray the command's input, field for field (`form`, `index`)
   */
  stray(stray: TreeStray): void {
    this.findings.report({ code: strayFinding(stray.form), index: stray.index });
  }

  /**
   * Performs the command `EndParent`: closes the current parent once every child has been fed (including any
   * nested children the walker descended into). Executable after `beginParent`. May ask `ParentStates.hasStateNamed` about `end.init` (the
   * specification's `initStateDeclared`); may tell the sink `report` with `end.initIndex`.
   *
   * @param end the command's input, field for field (`isComponent`, `hasInit`, `init`, `initIndex`, `stateCount`)
   */
  endParent(end: ParentEnd): void {
    if (!needsInitLookup(end)) {
      return;
    }
    if (initStateUnknown(end, this.states.hasStateNamed(end.init))) {
      this.findings.report({ code: "unknown-state", index: end.initIndex });
    }
  }
}
