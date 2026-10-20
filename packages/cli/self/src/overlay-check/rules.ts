import type { BranchingFact, CallFact, EntryFact, OverlayProblemCode, SlotFact, StampFact } from "./types.ts";

/**
 * Pure decision for the `Asks` command.
 *
 * @param count the command's `count`: how many queries the thing asked names (0 to 3)
 * @returns the codes to report, possibly none, in order
 */
export function asksProblems(count: number): OverlayProblemCode[] {
  return count === 1 ? [] : ["one-query"];
}

/**
 * Pure decision for the `Branching` command.
 *
 * @param fact the command's input
 * @returns the codes to report, possibly none, in the order they are emitted
 */
export function branchingProblems(fact: BranchingFact): OverlayProblemCode[] {
  const codes: OverlayProblemCode[] = [];
  if (fact.layer1Cases) {
    if (fact.flat) codes.push("flat-in-cases");
    if (fact.layer1Outcome) codes.push("layer1-outside-cases");
  } else if (fact.interpretationCases) {
    if (fact.flat) codes.push("flat-in-cases");
    if (fact.layer1GoTo) codes.push("branch-over-goto");
  }
  return codes;
}

/**
 * Pure decision for the `Call` command.
 *
 * @param fact the command's input
 * @returns the codes to report, possibly none, in order
 */
export function callProblems(fact: CallFact): OverlayProblemCode[] {
  if (!fact.exists) return ["no-part"];
  if (fact.keyedPart && !fact.keyGiven) return ["key-missing"];
  if (!fact.keyedPart && fact.keyGiven) return ["key-extra"];
  return [];
}

/**
 * Pure decision for the `Entry` command.
 *
 * @param fact the command's input
 * @returns the codes to report, possibly none, in order
 */
export function entryProblems(fact: EntryFact): OverlayProblemCode[] {
  return fact.listed && fact.closed && !fact.inLayer1 ? ["closed"] : [];
}

/**
 * Pure decision for the `Key` command.
 *
 * @param known the command's `known`: whether the key can be written there
 * @returns the codes to report, possibly none, in order
 */
export function keyProblems(known: boolean): OverlayProblemCode[] {
  return known ? [] : ["unknown-key"];
}

/**
 * Pure decision for the `Slot` command.
 *
 * @param fact the command's input
 * @returns the codes to report, possibly none, in order
 */
export function slotProblems(fact: SlotFact): OverlayProblemCode[] {
  if (!fact.known) return ["unknown-key"];
  if (fact.layer1 && fact.interpretation) return ["conflict"];
  return [];
}

/**
 * Pure decision for the `Stamp` command.
 *
 * @param fact the command's input
 * @returns the codes to report, possibly none, in order
 */
export function stampProblems(fact: StampFact): OverlayProblemCode[] {
  return fact.recorded !== null && fact.recorded !== fact.current ? ["stale"] : [];
}

/**
 * Pure decision for the `State` command.
 *
 * @param described the command's `described`: whether the state Layer 1 listed by name has a description
 * @returns the codes to report, possibly none, in order
 */
export function stateProblems(described: boolean): OverlayProblemCode[] {
  return described ? [] : ["undescribed"];
}
