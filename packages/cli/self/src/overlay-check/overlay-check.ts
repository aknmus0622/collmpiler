import {
  asksProblems,
  branchingProblems,
  callProblems,
  entryProblems,
  keyProblems,
  slotProblems,
  stampProblems,
  stateProblems,
} from "./rules.ts";
import type {
  BranchingFact,
  CallFact,
  EntryFact,
  OverlayProblemCode,
  OverlayProblemSink,
  SlotFact,
  StampFact,
} from "./types.ts";

/**
 * The overlay check component: reports the problems found when an interpretation is laid over Layer 1, one
 * fact at a time.
 *
 * One instance is one check. The check has a single state (the specification's `READY`) and remembers no
 * data, so it exposes neither. Each method below performs one command of the specification and may be called
 * any number of times, in any order; a command returns nothing, and its outcome is observed only through the
 * calls it makes on the sink (`problem`, the specification's `Problem` effect), made synchronously before the
 * method returns.
 */
export class OverlayCheck {
  private readonly problems: OverlayProblemSink;

  /**
   * @param problems receives the effect `Problem`
   */
  constructor(problems: OverlayProblemSink) {
    this.problems = problems;
  }

  /**
   * Performs the command `Asks`: one thing a command asks. May tell the sink `problem`.
   *
   * @param count the command's `count`: how many queries the thing asked names (0 to 3)
   */
  asks(count: number): void {
    this.report(asksProblems(count));
  }

  /**
   * Performs the command `Branching`: how a command branches into cases. May tell the sink `problem` up to
   * twice.
   *
   * @param fact the command's input, field for field (`flat`, `interpretationCases`, `layer1Cases`,
   *   `layer1GoTo`, `layer1Outcome`)
   */
  branching(fact: BranchingFact): void {
    this.report(branchingProblems(fact));
  }

  /**
   * Performs the command `Call`: a command calls a contained component. May tell the sink `problem`.
   *
   * @param fact the command's input, field for field (`exists`, `keyGiven`, `keyedPart`)
   */
  call(fact: CallFact): void {
    this.report(callProblems(fact));
  }

  /**
   * Performs the command `Entry`: an entry the interpretation wrote into a group. May tell the sink `problem`.
   *
   * @param fact the command's input, field for field (`closed`, `inLayer1`, `listed`)
   */
  entry(fact: EntryFact): void {
    this.report(entryProblems(fact));
  }

  /**
   * Performs the command `Key`: a key the interpretation wrote. May tell the sink `problem`.
   *
   * @param known the command's `known`: whether the key can be written there
   */
  key(known: boolean): void {
    this.report(keyProblems(known));
  }

  /**
   * Performs the command `Slot`: one place, and whether Layer 1 and the interpretation each wrote it. May tell
   * the sink `problem`.
   *
   * @param fact the command's input, field for field (`interpretation`, `known`, `layer1`)
   */
  slot(fact: SlotFact): void {
    this.report(slotProblems(fact));
  }

  /**
   * Performs the command `Stamp`: the hash of Layer 1 recorded in the interpretation and the hash of Layer 1
   * now. May tell the sink `problem`.
   *
   * @param fact the command's input, field for field (`current`, `recorded`; `recorded` is `null` when the
   *   interpretation recorded no hash)
   */
  stamp(fact: StampFact): void {
    this.report(stampProblems(fact));
  }

  /**
   * Performs the command `State`: a state Layer 1 listed by name. May tell the sink `problem`.
   *
   * @param described the command's `described`: whether the state has a description
   */
  state(described: boolean): void {
    this.report(stateProblems(described));
  }

  /** Tells the sink each problem, in order. */
  private report(codes: OverlayProblemCode[]): void {
    for (const code of codes) this.problems.problem({ code });
  }
}
