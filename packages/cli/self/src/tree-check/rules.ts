import type { ParentEnd, TreeChild, TreeFindingCode, TreeStrayForm } from "./types.ts";

/**
 * Pure decision: chooses the finding of the `Stray` command from the stray child's form.
 *
 * @param form the `form` input of `Stray`
 * @returns the code to report about the stray child
 */
export function strayFinding(form: TreeStrayForm): TreeFindingCode {
  return form === "bad-field" ? "unknown-field" : "unknown";
}

/**
 * Pure decision: the findings for a node child whose slot the grammar accepted under the parent, in the order
 * they are reported. The child is entered after these are reported.
 *
 * @param slots the specification's `data.slots` before the command
 * @param names the specification's `data.names` before the command
 * @param limit the answer of the grammar's `slotLimit` for the parent and the child's slot (the
 *   specification's `query:slotLimit`)
 * @param child the input of `Child`
 * @returns the codes to report, possibly none, in order
 */
export function fittingChildFindings(
  slots: readonly string[],
  names: readonly string[],
  limit: number,
  child: TreeChild,
): TreeFindingCode[] {
  return findingsForFittingChild(slots, names, () => limit, child);
}

/**
 * Pure decision: as {@link fittingChildFindings}, but the slot limit is looked up only when it can matter.
 *
 * @param slots the specification's `data.slots` before the command
 * @param names the specification's `data.names` before the command
 * @param limitOf looks up the grammar's `slotLimit` for the parent and the child's slot; called at most once,
 *   and only when the slot already holds a child
 * @param child the input of `Child`
 * @returns the codes to report, possibly none, in order
 */
export function findingsForFittingChild(
  slots: readonly string[],
  names: readonly string[],
  limitOf: () => number,
  child: TreeChild,
): TreeFindingCode[] {
  const findings: TreeFindingCode[] = [];
  const alreadyInSlot = slots.filter((given) => given === child.slot).length;
  // An empty slot cannot be over any limit. A limit of 0 means no limit; otherwise only the first child
  // beyond it is reported.
  if (alreadyInSlot > 0) {
    const limit = limitOf();
    if (limit > 0 && alreadyInSlot === limit) {
      findings.push("too-many");
    }
  }
  if (child.named && names.includes(nameEntry(child))) {
    findings.push("duplicate");
  }
  return findings;
}

/**
 * Pure calculation `namesWithChild`: the names stored for an accepted child.
 *
 * @param names the specification's `data.names` before the command
 * @param child the input of `Child`
 * @returns the new `data.names`
 */
export function namesWithChild(names: readonly string[], child: TreeChild): string[] {
  return child.named ? [...names, nameEntry(child)] : [...names];
}

/** A named child's entry in `data.names`, taken from the child's `identity`. */
function nameEntry(child: TreeChild): string {
  return child.identity;
}

/**
 * Pure calculation `slotsWithChild`: the slots stored for an accepted child.
 *
 * @param slots the specification's `data.slots` before the command
 * @param slot the `slot` input of `Child`
 * @returns the new `data.slots`
 */
export function slotsWithChild(slots: readonly string[], slot: string): string[] {
  return [...slots, slot];
}

/**
 * Pure decision: whether the answer of `stateNamed` is needed to decide the case of `EndParent`.
 *
 * @param end the input of `EndParent`
 * @returns `true` when the check must ask `ParentStates.hasStateNamed` about `end.init`
 */
export function needsInitLookup(end: ParentEnd): boolean {
  return end.isComponent && end.hasInit && end.stateCount >= 1;
}

/**
 * Pure decision: chooses the case of the `EndParent` command.
 *
 * @param end the input of `EndParent`
 * @param initStateDeclared the answer of `stateNamed` for `end.init` (the specification's
 *   `query:initStateDeclared`)
 * @returns `true` for the case that reports `unknown-state` at `end.initIndex`, `false` for `otherwise`
 */
export function initStateUnknown(end: ParentEnd, initStateDeclared: boolean): boolean {
  return needsInitLookup(end) && !initStateDeclared;
}
